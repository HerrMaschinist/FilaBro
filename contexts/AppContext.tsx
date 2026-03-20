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
import type { Spool } from "@/lib/spoolViewTypes";
import type {
  SpoolView,
  Manufacturer,
  Filament as DomainFilament,
} from "@/src/domain/models";
import { isPersistenceEnabled } from "@/src/data/db/client";
import { CatalogUseCase } from "@/src/core/application/CatalogUseCase";
import { SyncUseCase } from "@/src/core/application/SyncUseCase";
import { FilaBaseAdapter } from "@/src/adapters/filabase";
import { SpoolUseCase } from "@/src/core/application/SpoolUseCase";
import { WeightUseCase } from "@/src/core/application/WeightUseCase";
import { FilamentUseCase } from "@/src/core/application/FilamentUseCase";
import { ManufacturerUseCase } from "@/src/core/application/ManufacturerUseCase";
import { SpoolEditUseCase } from "@/src/core/application/SpoolEditUseCase";
import {
  SpoolListUseCase,
  DEFAULT_PAGE_SIZE,
} from "@/src/core/application/SpoolListUseCase";
import type { UpdateFilamentPatch, UpdateManufacturerPatch, UpdateSpoolPatch } from "@/src/core/ports";
import { normalizeColor } from "@/src/core/application/filament/ColorNormalizer";
import type { PrinterProfile } from "@/src/domain/models";
import { PrinterRepository } from "@/src/data/repositories/PrinterRepository";
import type { PrinterProfileData } from "@/src/data/repositories/PrinterRepository";
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
        color_name: sv.filament.colorNameNormalized ?? sv.filament.colorNameRaw,
        color_hex: sv.filament.colorHex,
        color_hex_normalized: sv.filament.colorHexNormalized,
        vendor: sv.filament.manufacturer
          ? {
              id: sv.filament.manufacturer.remoteId ?? 0,
              name: sv.filament.manufacturer.name,
            }
          : undefined,
        weight: sv.filament.weight,
        spool_weight: sv.filament.spoolWeight,
        comment: sv.filament.comment,
        paid_price: sv.filament.paidPrice,
        shop: sv.filament.shop,
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
    _filamentLocalId: sv.filamentLocalId,
    _displayName: sv.displayName,
    _qrCode: sv.qrCode,
    _nfcTagId: sv.nfcTagId,
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
  colorInput?: string;
  colorHex?: string;
  manufacturerLocalId?: string;
  weight?: number;
  spoolWeight?: number;
  comment?: string;
  spec?: Partial<import("@/src/core/domain/filament").FilamentSpec>;
}

interface CreateSpoolData {
  filamentLocalId: string;
  remainingWeight?: number;
  initialWeight?: number;
  spoolWeight?: number;
  comment?: string;
  displayName?: string;
  lotNr?: string;
  qrCode?: string;
  nfcTagId?: string;
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

  /** Phase 5: pagination */
  hasMoreSpools: boolean;
  isLoadingMoreSpools: boolean;
  loadNextPage: () => Promise<void>;

  /** Phase 5: indexed QR / NFC lookup */
  findSpoolByQrCode: (qr: string) => Promise<Spool | null>;
  findSpoolByNfcTagId: (tagId: string) => Promise<Spool | null>;
  /** Scanner multi-match: distinguishes 0 / 1 / N results */
  findSpoolsByQrCode: (qr: string) => Promise<Spool[]>;
  findSpoolsByNfcTagId: (tagId: string) => Promise<Spool[]>;

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
  reloadSpoolsLocal: () => Promise<void>;
  updateFilament: (localId: string, patch: UpdateFilamentPatch) => Promise<DomainFilament | null>;
  updateManufacturer: (localId: string, patch: UpdateManufacturerPatch) => Promise<Manufacturer | null>;
  updateSpool: (localId: string, patch: UpdateSpoolPatch) => Promise<boolean>;
  printerProfiles: PrinterProfile[];
  loadPrinterProfiles: () => Promise<void>;
  createPrinterProfile: (data: PrinterProfileData) => Promise<PrinterProfile | null>;
  updatePrinterProfile: (localId: string, data: PrinterProfileData) => Promise<void>;
  deletePrinterProfile: (localId: string) => Promise<void>;
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
  const [printerProfilesList, setPrinterProfilesList] = useState<PrinterProfile[]>([]);

  // Phase 5: pagination state
  const [spoolPage, setSpoolPage] = useState(0);
  const [hasMoreSpools, setHasMoreSpools] = useState(false);
  const [isLoadingMoreSpools, setIsLoadingMoreSpools] = useState(false);

  /**
   * Load (or reload) the first page of spools.
   * Resets page to 0 and replaces the spool list.
   */
  const loadFirstPage = useCallback(async () => {
    if (!isPersistenceEnabled) return;
    const views = await SpoolListUseCase.listSpoolsPage(0, DEFAULT_PAGE_SIZE);
    setSpools(views.map(toViewSpool));
    setSpoolPage(0);
    setHasMoreSpools(views.length === DEFAULT_PAGE_SIZE);
  }, []);

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

          const printers = await PrinterRepository.getAll();
          setPrinterProfilesList(printers);

          if (onboarded) {
            // Phase 5: load first page instead of all spools
            const views = await SpoolListUseCase.listSpoolsPage(0, DEFAULT_PAGE_SIZE);
            setSpools(views.map(toViewSpool));
            setSpoolPage(0);
            setHasMoreSpools(views.length === DEFAULT_PAGE_SIZE);
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
      const result = await SyncUseCase.sync(serverUrl, FilaBaseAdapter);
      const conflictCount = await SyncUseCase.getOpenConflictCount();
      setOpenConflictCount(conflictCount);

      // Phase 5: reload first page after sync
      const views = await SpoolListUseCase.listSpoolsPage(0, DEFAULT_PAGE_SIZE);
      setSpools(views.map(toViewSpool));
      setSpoolPage(0);
      setHasMoreSpools(views.length === DEFAULT_PAGE_SIZE);

      if (
        result.errors.length > 0 &&
        result.pulled === 0 &&
        views.length === 0
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
      // Phase 5: reload first page even on error (show what we have locally)
      await loadFirstPage();
    } finally {
      setIsSpoolsLoading(false);
    }
  }, [serverUrl, loadFirstPage]);

  /**
   * Phase 5: load the next page of spools and append to the list.
   * No-op if there are no more pages or if already loading.
   */
  const loadNextPage = useCallback(async () => {
    if (!isPersistenceEnabled || !hasMoreSpools || isLoadingMoreSpools) return;
    const nextPage = spoolPage + 1;
    setIsLoadingMoreSpools(true);
    try {
      const views = await SpoolListUseCase.listSpoolsPage(nextPage, DEFAULT_PAGE_SIZE);
      if (views.length > 0) {
        setSpools((prev) => [...prev, ...views.map(toViewSpool)]);
        setSpoolPage(nextPage);
      }
      setHasMoreSpools(views.length === DEFAULT_PAGE_SIZE);
    } finally {
      setIsLoadingMoreSpools(false);
    }
  }, [hasMoreSpools, isLoadingMoreSpools, spoolPage]);

  /**
   * Phase 5: indexed QR code lookup — O(log n) via idx_spools_qr_code.
   */
  const findSpoolByQrCode = useCallback(async (qr: string): Promise<Spool | null> => {
    if (!isPersistenceEnabled) return null;
    const view = await SpoolListUseCase.findByQrCode(qr);
    return view ? toViewSpool(view) : null;
  }, []);

  /**
   * Phase 5: indexed NFC tag lookup — O(log n) via idx_spools_nfc_tag_id.
   */
  const findSpoolByNfcTagId = useCallback(async (tagId: string): Promise<Spool | null> => {
    if (!isPersistenceEnabled) return null;
    const view = await SpoolListUseCase.findByNfcTagId(tagId);
    return view ? toViewSpool(view) : null;
  }, []);

  /**
   * Scanner multi-match: return ALL spools sharing the same qr_code.
   * Used to distinguish 0 / 1 / N scan results without changing existing lookups.
   */
  const findSpoolsByQrCode = useCallback(async (qr: string): Promise<Spool[]> => {
    if (!isPersistenceEnabled) return [];
    const views = await SpoolListUseCase.findAllByQrCode(qr);
    return views.map(toViewSpool);
  }, []);

  /**
   * Scanner multi-match: return ALL spools sharing the same nfc_tag_id.
   */
  const findSpoolsByNfcTagId = useCallback(async (tagId: string): Promise<Spool[]> => {
    if (!isPersistenceEnabled) return [];
    const views = await SpoolListUseCase.findAllByNfcTagId(tagId);
    return views.map(toViewSpool);
  }, []);

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

      // Phase 4: record as adjustment event + upsert spool_stats projection
      await WeightUseCase.adjustRemaining(spool._localId, weight, "manual");

      if (serverUrl) {
        SyncUseCase.pushOne(serverUrl, spool._localId, FilaBaseAdapter)
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
      await SyncUseCase.push(serverUrl, FilaBaseAdapter);
      // Phase 5: reload first page after push
      await loadFirstPage();
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    }
  }, [serverUrl, loadFirstPage]);

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

  const loadPrinterProfiles = useCallback(async () => {
    if (!isPersistenceEnabled) return;
    const printers = await PrinterRepository.getAll();
    setPrinterProfilesList(printers);
  }, []);

  const createPrinterProfile = useCallback(async (data: PrinterProfileData): Promise<PrinterProfile | null> => {
    if (!isPersistenceEnabled) return null;
    try {
      const profile = await PrinterRepository.insert(data);
      setPrinterProfilesList((prev) => [...prev, profile].sort((a, b) => a.name.localeCompare(b.name)));
      return profile;
    } catch {
      return null;
    }
  }, []);

  const updatePrinterProfile = useCallback(async (localId: string, data: PrinterProfileData): Promise<void> => {
    if (!isPersistenceEnabled) return;
    await PrinterRepository.update(localId, data);
    await loadPrinterProfiles();
  }, [loadPrinterProfiles]);

  const deletePrinterProfile = useCallback(async (localId: string): Promise<void> => {
    if (!isPersistenceEnabled) return;
    await PrinterRepository.remove(localId);
    setPrinterProfilesList((prev) => prev.filter((p) => p.localId !== localId));
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

  const reloadSpoolsLocal = useCallback(async () => {
    await loadFirstPage();
  }, [loadFirstPage]);

  const updateFilament = useCallback(
    async (localId: string, patch: UpdateFilamentPatch): Promise<DomainFilament | null> => {
      if (!isPersistenceEnabled) {
        const { colorInput, spec, ...restPatch } = patch;
        const colorFields = colorInput !== undefined
          ? normalizeColor(colorInput)
          : {};
        const updated: DomainFilament | undefined = (() => {
          let found: DomainFilament | undefined;
          setFilaments((prev) =>
            prev.map((f) => {
              if (f.localId !== localId) return f;
              found = {
                ...f,
                ...restPatch,
                ...colorFields,
                spec: spec !== undefined ? { ...f.spec, ...spec } : f.spec,
                lastModifiedAt: Date.now(),
              };
              return found;
            })
          );
          return found;
        })();
        return updated ?? null;
      }
      try {
        const result = await FilamentUseCase.updateFilament(localId, patch);
        if (result) {
          setFilaments((prev) =>
            prev.map((f) => (f.localId === localId ? result : f))
          );
        }
        return result;
      } catch {
        return null;
      }
    },
    []
  );

  const updateManufacturer = useCallback(
    async (localId: string, patch: UpdateManufacturerPatch): Promise<Manufacturer | null> => {
      if (!isPersistenceEnabled) {
        let found: Manufacturer | undefined;
        setManufacturers((prev) =>
          prev.map((m) => {
            if (m.localId !== localId) return m;
            found = { ...m, ...patch, lastModifiedAt: Date.now() };
            return found;
          })
        );
        return found ?? null;
      }
      try {
        const result = await ManufacturerUseCase.updateManufacturer(localId, patch);
        if (result) {
          setManufacturers((prev) =>
            prev.map((m) => (m.localId === localId ? result : m))
          );
        }
        return result;
      } catch {
        return null;
      }
    },
    []
  );

  const updateSpool = useCallback(
    async (localId: string, patch: UpdateSpoolPatch): Promise<boolean> => {
      if (!isPersistenceEnabled) {
        setSpools((prev) =>
          prev.map((s) => {
            if (s._localId !== localId) return s;
            return {
              ...s,
              comment: patch.comment !== undefined ? patch.comment : s.comment,
              lot_nr: patch.lotNr !== undefined ? patch.lotNr : s.lot_nr,
              spool_weight: patch.spoolWeight !== undefined ? patch.spoolWeight : s.spool_weight,
            };
          })
        );
        return true;
      }
      try {
        const result = await SpoolEditUseCase.updateSpool(localId, patch);
        if (result) {
          await loadFirstPage();
        }
        return !!result;
      } catch {
        return false;
      }
    },
    [loadFirstPage]
  );

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
        let colorNameRaw: string | undefined;
        let colorNameNormalized: string | undefined;
        let colorHexNormalized: string | undefined;
        if (data.colorInput?.trim()) {
          const nc = normalizeColor(data.colorInput);
          colorNameRaw = nc.colorNameRaw;
          colorNameNormalized = nc.colorNameNormalized;
          colorHexNormalized = nc.colorHexNormalized;
        }
        const f: DomainFilament = {
          localId: generateLocalId(),
          name: data.name,
          material: data.material,
          colorHex: data.colorHex,
          colorNameRaw,
          colorNameNormalized,
          colorHexNormalized,
          manufacturerLocalId: data.manufacturerLocalId,
          weight: data.weight,
          spoolWeight: data.spoolWeight,
          comment: data.comment,
          spec: data.spec ? { ...data.spec } : undefined,
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
            color_name: fil?.colorNameNormalized ?? fil?.colorNameRaw,
            color_hex: fil?.colorHex,
            color_hex_normalized: fil?.colorHexNormalized,
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
        // Phase 5: reset to page 0 after create
        await loadFirstPage();
        return true;
      } catch {
        return false;
      }
    },
    [filaments, manufacturers, loadFirstPage]
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
        // Phase 5: reset to page 0 after delete
        await loadFirstPage();
        return true;
      } catch {
        return false;
      }
    },
    [loadFirstPage]
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
      hasMoreSpools,
      isLoadingMoreSpools,
      loadNextPage,
      findSpoolByQrCode,
      findSpoolByNfcTagId,
      findSpoolsByQrCode,
      findSpoolsByNfcTagId,
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
      reloadSpoolsLocal,
      updateFilament,
      updateManufacturer,
      updateSpool,
      printerProfiles: printerProfilesList,
      loadPrinterProfiles,
      createPrinterProfile,
      updatePrinterProfile,
      deletePrinterProfile,
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
      hasMoreSpools,
      isLoadingMoreSpools,
      loadNextPage,
      findSpoolByQrCode,
      findSpoolByNfcTagId,
      findSpoolsByQrCode,
      findSpoolsByNfcTagId,
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
      reloadSpoolsLocal,
      updateFilament,
      updateManufacturer,
      updateSpool,
      printerProfilesList,
      loadPrinterProfiles,
      createPrinterProfile,
      updatePrinterProfile,
      deletePrinterProfile,
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
