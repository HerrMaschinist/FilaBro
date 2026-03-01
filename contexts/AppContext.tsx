import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import {
  getServerUrl,
  setServerUrl as persistServerUrl,
  deleteServerUrl,
  setIsOnboarded,
  getIsOnboarded,
  setLastSync,
  getLastSync,
  getTheme,
  setTheme as persistTheme,
  getDefaultWeightMode,
  setDefaultWeightMode as persistWeightMode,
  getLanguage,
  setLanguage as persistLanguage,
} from "@/lib/storage";
import type { Spool } from "@/lib/spoolman";
import type {
  SpoolView,
  Manufacturer,
  Filament as DomainFilament,
} from "@/src/domain/models";
import { isPersistenceEnabled } from "@/src/data/db/client";
import { CatalogUseCase } from "@/src/core/application/CatalogUseCase";
import { SyncUseCase } from "@/src/core/application/SyncUseCase";
import { SpoolUseCase } from "@/src/core/application/SpoolUseCase";
import Colors from "@/constants/colors";
import i18n from "@/lib/i18n";
import {
  DEMO_SPOOLS,
  DEMO_MANUFACTURERS,
  DEMO_FILAMENTS,
} from "@/src/data/demo/demoData";

function toViewSpool(sv: SpoolView): Spool {
  const filament: Spool["filament"] = sv.filament
    ? {
        id: sv.filament.remoteId ?? 0,
        name: sv.filament.name,
        material: sv.filament.material,
        color_hex: sv.filament.colorHex,
        vendor: sv.filament.manufacturer
          ? {
              id: sv.filament.manufacturer.remoteId ?? 0,
              name: sv.filament.manufacturer.name,
            }
          : undefined,
        weight: sv.filament.weight,
        spool_weight: sv.filament.spoolWeight,
        comment: sv.filament.comment,
      }
    : { id: 0, name: "Unknown", material: "Unknown" };

  return {
    id: sv.remoteId ?? 0,
    filament,
    remaining_weight: sv.remainingWeight,
    initial_weight: sv.initialWeight,
    spool_weight: sv.spoolWeight,
    used_weight: sv.usedWeight,
    comment: sv.comment,
    archived: sv.archived,
    lot_nr: sv.lotNr,
    last_used: sv.lastUsed,
    first_used: sv.firstUsed,
    registered: sv.registered,
    _localId: sv.localId,
    _isFavorite: sv.isFavorite,
  };
}

export interface PendingUpdate {
  id: string;
  spoolId: number;
  remaining_weight: number;
  timestamp: number;
}

export type ConnectionStatus = "connected" | "offline" | "no_server" | "error";

interface CreateManufacturerData {
  name: string;
  website?: string;
  comment?: string;
}

interface CreateFilamentData {
  name: string;
  material: string;
  colorHex?: string;
  manufacturerLocalId?: string;
  weight?: number;
  spoolWeight?: number;
  comment?: string;
}

interface CreateSpoolData {
  filamentLocalId: string;
  remainingWeight?: number;
  initialWeight?: number;
  spoolWeight?: number;
  comment?: string;
  displayName?: string;
  lotNr?: string;
}

interface AppContextValue {
  serverUrl: string;
  isOnboarded: boolean;
  isLoading: boolean;

  setServerUrl: (url: string) => Promise<void>;
  markOnboarded: () => Promise<void>;
  disconnectServer: () => Promise<void>;

  spools: Spool[];
  isSpoolsLoading: boolean;
  spoolsError: string | null;
  lastSync: number | null;
  refreshSpools: () => Promise<void>;

  favorites: number[];
  toggleFavorite: (id: number) => void;
  isFavorite: (id: number) => boolean;

  pendingUpdates: PendingUpdate[];
  updateWeight: (spoolId: number, weight: number) => Promise<void>;
  syncPending: () => Promise<void>;

  isOnline: boolean;
  connectionStatus: ConnectionStatus;
  isConnected: boolean;

  theme: string;
  setTheme: (t: string) => void;

  defaultWeightMode: string;
  setDefaultWeightMode: (m: string) => void;

  language: string;
  setLanguage: (lang: string) => Promise<void>;

  persistenceEnabled: boolean;

  /** Count of open (unresolved) conflict snapshots. 0 = no conflicts. */
  openConflictCount: number;

  manufacturers: Manufacturer[];
  filaments: DomainFilament[];
  createManufacturer: (
    data: CreateManufacturerData
  ) => Promise<Manufacturer | null>;
  createFilament: (
    data: CreateFilamentData
  ) => Promise<DomainFilament | null>;
  createSpool: (data: CreateSpoolData) => Promise<boolean>;
  deleteManufacturer: (localId: string) => Promise<boolean>;
  deleteFilament: (localId: string) => Promise<boolean>;
  deleteSpool: (localId: string) => Promise<boolean>;
  reloadCatalog: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function generateLocalId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
  );
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [serverUrl, setServerUrlState] = useState("");
  const [isOnboarded, setIsOnboardedState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [spools, setSpools] = useState<Spool[]>([]);
  const [isSpoolsLoading, setIsSpoolsLoading] = useState(false);
  const [spoolsError, setSpoolsError] = useState<string | null>(null);
  const [lastSync, setLastSyncState] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [theme, setThemeState] = useState("auto");
  const [defaultWeightMode, setDefaultWeightModeState] = useState("slider");
  const [language, setLanguageState] = useState("en");
  const [dirtySpoolIds, setDirtySpoolIds] = useState<Set<number>>(new Set());

  const [openConflictCount, setOpenConflictCount] = useState(0);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [filaments, setFilaments] = useState<DomainFilament[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [url, onboarded, lastSyncTs, thm, wmode, lang] =
          await Promise.all([
            getServerUrl(),
            getIsOnboarded(),
            getLastSync(),
            getTheme(),
            getDefaultWeightMode(),
            getLanguage(),
          ]);

        const resolvedUrl = url ?? "";
        setServerUrlState(resolvedUrl);
        setIsOnboardedState(onboarded);
        setLastSyncState(lastSyncTs);
        setThemeState(thm);
        setDefaultWeightModeState(wmode);
        setLanguageState(lang);

        if (lang !== "en") {
          i18n.changeLanguage(lang);
        }

        if (isPersistenceEnabled) {
          const [mfrs, fils, conflictCount] = await Promise.all([
            CatalogUseCase.loadManufacturers(),
            CatalogUseCase.loadFilaments(),
            SyncUseCase.getOpenConflictCount(),
          ]);
          setManufacturers(mfrs);
          setFilaments(fils);
          setOpenConflictCount(conflictCount);

          if (onboarded) {
            const local = await SyncUseCase.getLocalSpools();
            setSpools(local.map(toViewSpool));
          }
        } else {
          setManufacturers(DEMO_MANUFACTURERS);
          setFilaments(DEMO_FILAMENTS);
          setSpools(DEMO_SPOOLS);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const setServerUrl = useCallback(async (url: string) => {
    await persistServerUrl(url);
    setServerUrlState(url);
    setIsOnline(false);
    setSpoolsError(null);
  }, []);

  const markOnboarded = useCallback(async () => {
    await setIsOnboarded(true);
    setIsOnboardedState(true);
  }, []);

  const disconnectServer = useCallback(async () => {
    await deleteServerUrl();
    setServerUrlState("");
    setIsOnline(false);
    setSpoolsError(null);
  }, []);

  const setLanguage = useCallback(async (lang: string) => {
    setLanguageState(lang);
    await persistLanguage(lang);
    await i18n.changeLanguage(lang);
  }, []);

  const connectionStatus = useMemo<ConnectionStatus>(() => {
    if (!serverUrl) return "no_server";
    if (isOnline) return "connected";
    if (spoolsError) return "error";
    return "offline";
  }, [serverUrl, isOnline, spoolsError]);

  const isConnected = connectionStatus === "connected";

  const reloadLocalSpools = useCallback(async () => {
    if (!isPersistenceEnabled) return;
    const local = await SyncUseCase.getLocalSpools();
    setSpools(local.map(toViewSpool));
  }, []);

  const refreshSpools = useCallback(async () => {
    if (!serverUrl) return;

    if (!isPersistenceEnabled) {
      setSpoolsError(
        "Web preview mode: no local persistence. Run on a native device via Expo Go to sync data."
      );
      return;
    }

    setIsSpoolsLoading(true);
    setSpoolsError(null);

    try {
      const result = await SyncUseCase.sync(serverUrl);
      const [local, conflictCount] = await Promise.all([
        SyncUseCase.getLocalSpools(),
        SyncUseCase.getOpenConflictCount(),
      ]);
      setSpools(local.map(toViewSpool));
      setOpenConflictCount(conflictCount);

      if (
        result.errors.length > 0 &&
        result.pulled === 0 &&
        local.length === 0
      ) {
        setSpoolsError(result.errors[0]);
        setIsOnline(false);
      } else {
        setIsOnline(result.errors.length === 0);
        const now = Date.now();
        setLastSyncState(now);
        await setLastSync(now);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown sync error";
      setSpoolsError(msg);
      setIsOnline(false);
      const local = await SyncUseCase.getLocalSpools();
      setSpools(local.map(toViewSpool));
    } finally {
      setIsSpoolsLoading(false);
    }
  }, [serverUrl]);

  const favorites = useMemo(
    () => spools.filter((s) => s._isFavorite).map((s) => s.id),
    [spools]
  );

  const isFavorite = useCallback(
    (id: number) => !!spools.find((s) => s.id === id)?._isFavorite,
    [spools]
  );

  const toggleFavorite = useCallback(
    (id: number) => {
      const spool = spools.find((s) => s.id === id);
      if (!spool) return;

      const next = !spool._isFavorite;
      setSpools((prev) =>
        prev.map((s) => (s.id === id ? { ...s, _isFavorite: next } : s))
      );

      if (isPersistenceEnabled && spool._localId) {
        SpoolUseCase.setFavorite(spool._localId, next).catch(() => {
          setSpools((prev) =>
            prev.map((s) =>
              s.id === id ? { ...s, _isFavorite: !next } : s
            )
          );
        });
      }
    },
    [spools]
  );

  const updateWeight = useCallback(
    async (spoolId: number, weight: number) => {
      const spool = spools.find((s) => s.id === spoolId);
      if (!spool) return;

      if (!isPersistenceEnabled) {
        setSpools((prev) =>
          prev.map((s) =>
            s.id === spoolId ? { ...s, remaining_weight: weight } : s
          )
        );
        return;
      }

      if (!spool._localId) return;

      setSpools((prev) =>
        prev.map((s) =>
          s.id === spoolId ? { ...s, remaining_weight: weight } : s
        )
      );

      setDirtySpoolIds((prev) => {
        const next = new Set(prev);
        next.add(spoolId);
        return next;
      });

      await SpoolUseCase.updateRemainingWeight(spool._localId, weight);

      if (serverUrl) {
        SyncUseCase.pushOne(serverUrl, spool._localId)
          .then(() => {
            setIsOnline(true);
            setDirtySpoolIds((prev) => {
              const next = new Set(prev);
              next.delete(spoolId);
              return next;
            });
          })
          .catch(() => {
            setIsOnline(false);
          });
      }
    },
    [spools, serverUrl]
  );

  const syncPending = useCallback(async () => {
    if (!serverUrl) return;
    try {
      await SyncUseCase.push(serverUrl);
      const local = await SyncUseCase.getLocalSpools();
      setSpools(local.map(toViewSpool));
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    }
  }, [serverUrl]);

  const pendingUpdates = useMemo<PendingUpdate[]>(
    () =>
      spools
        .filter((s) => s._localId && dirtySpoolIds.has(s.id))
        .map((s) => ({
          id: s._localId!,
          spoolId: s.id,
          remaining_weight: s.remaining_weight ?? 0,
          timestamp: Date.now(),
        })),
    [spools, dirtySpoolIds]
  );

  const setTheme = useCallback((t: string) => {
    setThemeState(t);
    persistTheme(t);
  }, []);

  const setDefaultWeightMode = useCallback((m: string) => {
    setDefaultWeightModeState(m);
    persistWeightMode(m);
  }, []);

  const reloadCatalog = useCallback(async () => {
    if (!isPersistenceEnabled) return;
    const [mfrs, fils] = await Promise.all([
      CatalogUseCase.loadManufacturers(),
      CatalogUseCase.loadFilaments(),
    ]);
    setManufacturers(mfrs);
    setFilaments(fils);
  }, []);

  const createManufacturer = useCallback(
    async (data: CreateManufacturerData): Promise<Manufacturer | null> => {
      if (!isPersistenceEnabled) {
        const m: Manufacturer = {
          localId: generateLocalId(),
          name: data.name,
          website: data.website,
          comment: data.comment,
          lastModifiedAt: Date.now(),
        };
        setManufacturers((prev) => [...prev, m]);
        return m;
      }
      try {
        const m = await CatalogUseCase.createManufacturer(data);
        setManufacturers((prev) => [...prev, m]);
        return m;
      } catch {
        return null;
      }
    },
    []
  );

  const createFilament = useCallback(
    async (data: CreateFilamentData): Promise<DomainFilament | null> => {
      if (!isPersistenceEnabled) {
        const f: DomainFilament = {
          localId: generateLocalId(),
          name: data.name,
          material: data.material,
          colorHex: data.colorHex,
          manufacturerLocalId: data.manufacturerLocalId,
          weight: data.weight,
          spoolWeight: data.spoolWeight,
          comment: data.comment,
          lastModifiedAt: Date.now(),
        };
        setFilaments((prev) => [...prev, f]);
        return f;
      }
      try {
        const f = await CatalogUseCase.createFilament(data);
        setFilaments((prev) => [...prev, f]);
        return f;
      } catch {
        return null;
      }
    },
    []
  );

  const createSpool = useCallback(
    async (data: CreateSpoolData): Promise<boolean> => {
      if (!isPersistenceEnabled) {
        const fil = filaments.find(
          (f) => f.localId === data.filamentLocalId
        );
        const mfr = fil?.manufacturerLocalId
          ? manufacturers.find(
              (m) => m.localId === fil.manufacturerLocalId
            )
          : undefined;
        const uid = generateLocalId();
        const numericId =
          Date.now() + Math.floor(Math.random() * 10000);
        const newSpool: Spool = {
          id: numericId,
          filament: {
            id: 0,
            name: fil?.name ?? "Unknown",
            material: fil?.material ?? "Unknown",
            color_hex: fil?.colorHex,
            vendor: mfr ? { id: 0, name: mfr.name } : undefined,
            weight: fil?.weight,
            spool_weight: fil?.spoolWeight,
          },
          remaining_weight:
            data.initialWeight ?? data.remainingWeight ?? 1000,
          initial_weight: data.initialWeight ?? 1000,
          spool_weight: data.spoolWeight,
          comment: data.comment,
          lot_nr: data.lotNr,
          registered: new Date().toISOString(),
          _localId: `web-${uid}`,
          _isFavorite: false,
        };
        setSpools((prev) => [...prev, newSpool]);
        return true;
      }
      try {
        await CatalogUseCase.createSpool(data);
        await reloadLocalSpools();
        return true;
      } catch {
        return false;
      }
    },
    [filaments, manufacturers, reloadLocalSpools]
  );

  const deleteManufacturer = useCallback(
    async (localId: string): Promise<boolean> => {
      if (!isPersistenceEnabled) {
        setManufacturers((prev) =>
          prev.filter((m) => m.localId !== localId)
        );
        return true;
      }
      try {
        await CatalogUseCase.deleteManufacturer(localId);
        setManufacturers((prev) =>
          prev.filter((m) => m.localId !== localId)
        );
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  const deleteFilament = useCallback(
    async (localId: string): Promise<boolean> => {
      if (!isPersistenceEnabled) {
        setFilaments((prev) =>
          prev.filter((f) => f.localId !== localId)
        );
        return true;
      }
      try {
        await CatalogUseCase.deleteFilament(localId);
        setFilaments((prev) =>
          prev.filter((f) => f.localId !== localId)
        );
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  const deleteSpool = useCallback(
    async (localId: string): Promise<boolean> => {
      if (!isPersistenceEnabled) {
        setSpools((prev) =>
          prev.filter((s) => s._localId !== localId)
        );
        return true;
      }
      try {
        await CatalogUseCase.deleteSpool(localId);
        await reloadLocalSpools();
        return true;
      } catch {
        return false;
      }
    },
    [reloadLocalSpools]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      serverUrl,
      isOnboarded,
      isLoading,
      setServerUrl,
      markOnboarded,
      disconnectServer,
      spools,
      isSpoolsLoading,
      spoolsError,
      lastSync,
      refreshSpools,
      favorites,
      toggleFavorite,
      isFavorite,
      pendingUpdates,
      updateWeight,
      syncPending,
      isOnline,
      connectionStatus,
      isConnected,
      theme,
      setTheme,
      defaultWeightMode,
      setDefaultWeightMode,
      language,
      setLanguage,
      persistenceEnabled: isPersistenceEnabled,
      openConflictCount,
      manufacturers,
      filaments,
      createManufacturer,
      createFilament,
      createSpool,
      deleteManufacturer,
      deleteFilament,
      deleteSpool,
      reloadCatalog,
    }),
    [
      serverUrl,
      isOnboarded,
      isLoading,
      setServerUrl,
      markOnboarded,
      disconnectServer,
      spools,
      isSpoolsLoading,
      spoolsError,
      lastSync,
      refreshSpools,
      favorites,
      toggleFavorite,
      isFavorite,
      pendingUpdates,
      updateWeight,
      syncPending,
      isOnline,
      connectionStatus,
      isConnected,
      theme,
      setTheme,
      defaultWeightMode,
      setDefaultWeightMode,
      language,
      setLanguage,
      openConflictCount,
      manufacturers,
      filaments,
      createManufacturer,
      createFilament,
      createSpool,
      deleteManufacturer,
      deleteFilament,
      deleteSpool,
      reloadCatalog,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function useAppTheme() {
  const { theme } = useApp();
  const systemColorScheme = useColorScheme();
  const isDark =
    theme === "auto" ? systemColorScheme === "dark" : theme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  return { colors, isDark };
}
