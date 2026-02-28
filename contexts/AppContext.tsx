/**
 * AppContext — UI-facing state boundary.
 *
 * Internally uses:
 *   SpoolRepository + SyncService  → data and sync
 *   lib/storage                    → settings (server URL, theme, language, etc.)
 *
 * Screens NEVER call SpoolmanClient or SpoolRepository directly.
 * All reads go through this context.
 * All writes go through this context.
 */
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
import type { SpoolView } from "@/src/domain/models";
import { SpoolRepository } from "@/src/data/repositories/SpoolRepository";
import * as SyncService from "@/src/data/sync/SyncService";
import { isPersistenceEnabled } from "@/src/data/db/client";
import Colors from "@/constants/colors";
import i18n from "@/lib/i18n";
import { DEMO_SPOOLS } from "@/src/data/demo/demoData";

// ─── Compatibility mapping ────────────────────────────────────────────────────
function toViewSpool(sv: SpoolView): Spool {
  const filament: Spool["filament"] = sv.filament
    ? {
        id: sv.filament.remoteId ?? 0,
        name: sv.filament.name,
        material: sv.filament.material,
        color_hex: sv.filament.colorHex,
        vendor: sv.filament.manufacturer
          ? { id: sv.filament.manufacturer.remoteId ?? 0, name: sv.filament.manufacturer.name }
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

// ─── PendingUpdate (kept for screen backward compat) ─────────────────────────
export interface PendingUpdate {
  id: string;
  spoolId: number;
  remaining_weight: number;
  timestamp: number;
}

export type ConnectionStatus = "connected" | "offline" | "no_server" | "error";

// ─── Context interface ────────────────────────────────────────────────────────
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
}

const AppContext = createContext<AppContextValue | null>(null);

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

  // ─── Startup: load settings + local DB snapshot ───────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [url, onboarded, lastSyncTs, thm, wmode, lang] = await Promise.all([
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

        if (onboarded && isPersistenceEnabled) {
          const local = await SyncService.getLocalSpools();
          setSpools(local.map(toViewSpool));
        } else if (!isPersistenceEnabled) {
          setSpools(DEMO_SPOOLS);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // ─── Settings ─────────────────────────────────────────────────────────────
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

  // ─── Connection status (derived) ──────────────────────────────────────────
  const connectionStatus = useMemo<ConnectionStatus>(() => {
    if (!serverUrl) return "no_server";
    if (isOnline) return "connected";
    if (spoolsError) return "error";
    return "offline";
  }, [serverUrl, isOnline, spoolsError]);

  const isConnected = connectionStatus === "connected";

  // ─── Sync: push then pull, reload from DB ─────────────────────────────────
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
      const result = await SyncService.sync(serverUrl);
      const local = await SyncService.getLocalSpools();
      setSpools(local.map(toViewSpool));

      if (result.errors.length > 0 && result.pulled === 0 && local.length === 0) {
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
      const local = await SyncService.getLocalSpools();
      setSpools(local.map(toViewSpool));
    } finally {
      setIsSpoolsLoading(false);
    }
  }, [serverUrl]);

  // ─── Favorites (DB-backed, local-only) ───────────────────────────────────
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
        SpoolRepository.setFavorite(spool._localId, next).catch(() => {
          setSpools((prev) =>
            prev.map((s) => (s.id === id ? { ...s, _isFavorite: !next } : s))
          );
        });
      }
    },
    [spools]
  );

  // ─── Weight update (DB → mark dirty → background push) ──────────────────
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

      await SpoolRepository.updateRemainingWeight(spool._localId, weight);

      if (serverUrl) {
        SyncService.pushOne(serverUrl, spool._localId)
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

  // ─── Sync pending dirty records ───────────────────────────────────────────
  const syncPending = useCallback(async () => {
    if (!serverUrl) return;
    try {
      await SyncService.push(serverUrl);
      const local = await SyncService.getLocalSpools();
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

  // ─── Theme / weight mode ──────────────────────────────────────────────────
  const setTheme = useCallback((t: string) => {
    setThemeState(t);
    persistTheme(t);
  }, []);

  const setDefaultWeightMode = useCallback((m: string) => {
    setDefaultWeightModeState(m);
    persistWeightMode(m);
  }, []);

  // ─── Context value ────────────────────────────────────────────────────────
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
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

/**
 * Returns the correct color palette and isDark flag based on the user's
 * stored theme preference (auto/light/dark) combined with the system color scheme.
 * Use this in every screen instead of calling useColorScheme() directly.
 */
export function useAppTheme() {
  const { theme } = useApp();
  const systemColorScheme = useColorScheme();
  const isDark =
    theme === "auto" ? systemColorScheme === "dark" : theme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  return { colors, isDark };
}
