/**
 * AppContext — UI-facing state boundary.
 *
 * Internally uses:
 *   SpoolRepository + SyncService  → data and sync
 *   lib/storage                    → settings (server URL, theme, etc.)
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
import {
  getServerUrl,
  setServerUrl as persistServerUrl,
  setIsOnboarded,
  getIsOnboarded,
  setLastSync,
  getLastSync,
  getTheme,
  setTheme as persistTheme,
  getDefaultWeightMode,
  setDefaultWeightMode as persistWeightMode,
} from "@/lib/storage";
import type { Spool } from "@/lib/spoolman";
import type { SpoolView } from "@/src/domain/models";
import { SpoolRepository } from "@/src/data/repositories/SpoolRepository";
import * as SyncService from "@/src/data/sync/SyncService";
import { isPersistenceEnabled } from "@/src/data/db/client";

// ─── Compatibility mapping ────────────────────────────────────────────────────
// Converts internal SpoolView (domain) to the legacy Spool type that existing
// screens expect. The _localId and _isFavorite bridge fields are added so
// context methods can resolve by remoteId without extra DB lookups.

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

// ─── Context interface ────────────────────────────────────────────────────────
interface AppContextValue {
  serverUrl: string;
  isOnboarded: boolean;
  isLoading: boolean;

  setServerUrl: (url: string) => Promise<void>;
  markOnboarded: () => Promise<void>;

  spools: Spool[];
  isSpoolsLoading: boolean;
  spoolsError: string | null;
  lastSync: number | null;
  refreshSpools: () => Promise<void>;

  favorites: number[];
  toggleFavorite: (id: number) => void;
  isFavorite: (id: number) => boolean;

  /** Derived from dirty SQLite rows — kept for screen compat */
  pendingUpdates: PendingUpdate[];
  updateWeight: (spoolId: number, weight: number) => Promise<void>;
  syncPending: () => Promise<void>;

  isOnline: boolean;

  theme: string;
  setTheme: (t: string) => void;

  defaultWeightMode: string;
  setDefaultWeightMode: (m: string) => void;

  /**
   * false on web preview — SQLite is unavailable, no data is persisted.
   * Write operations throw. Screens should surface a banner when false.
   */
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
  const [isOnline, setIsOnline] = useState(true);
  const [theme, setThemeState] = useState("auto");
  const [defaultWeightMode, setDefaultWeightModeState] = useState("slider");
  /** Remote spool IDs that have a local dirty weight not yet confirmed synced */
  const [dirtySpoolIds, setDirtySpoolIds] = useState<Set<number>>(new Set());

  // ─── Startup: load settings + local DB snapshot ───────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [url, onboarded, lastSyncTs, thm, wmode] = await Promise.all([
          getServerUrl(),
          getIsOnboarded(),
          getLastSync(),
          getTheme(),
          getDefaultWeightMode(),
        ]);

        const resolvedUrl = url ?? "";
        setServerUrlState(resolvedUrl);
        setIsOnboardedState(onboarded);
        setLastSyncState(lastSyncTs);
        setThemeState(thm);
        setDefaultWeightModeState(wmode);

        // Load immediately from SQLite (no network, instant)
        // Skip on web — persistence is disabled, getLocalSpools() returns []
        if (onboarded && isPersistenceEnabled) {
          const local = await SyncService.getLocalSpools();
          setSpools(local.map(toViewSpool));
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
  }, []);

  const markOnboarded = useCallback(async () => {
    await setIsOnboarded(true);
    setIsOnboardedState(true);
  }, []);

  // ─── Sync: push then pull, reload from DB ─────────────────────────────────
  const refreshSpools = useCallback(async () => {
    if (!serverUrl) return;

    // Web: persistence is disabled — DB writes throw explicitly.
    // Skip sync entirely; empty state is the correct web preview behavior.
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
      // Fallback: serve whatever is already in local DB
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
      if (!spool?._localId) return;

      const next = !spool._isFavorite;
      // Optimistic UI
      setSpools((prev) =>
        prev.map((s) => (s.id === id ? { ...s, _isFavorite: next } : s))
      );
      // Persist to DB (fire and forget — no network call)
      SpoolRepository.setFavorite(spool._localId, next).catch(() => {
        // Revert on failure
        setSpools((prev) =>
          prev.map((s) => (s.id === id ? { ...s, _isFavorite: !next } : s))
        );
      });
    },
    [spools]
  );

  // ─── Weight update (DB → mark dirty → background push) ──────────────────
  const updateWeight = useCallback(
    async (spoolId: number, weight: number) => {
      if (!isPersistenceEnabled) {
        throw new Error("Persistence not supported in web preview mode");
      }
      const spool = spools.find((s) => s.id === spoolId);
      if (!spool?._localId) return;

      // Optimistic UI
      setSpools((prev) =>
        prev.map((s) =>
          s.id === spoolId ? { ...s, remaining_weight: weight } : s
        )
      );

      // Mark as pending locally
      setDirtySpoolIds((prev) => {
        const next = new Set(prev);
        next.add(spoolId);
        return next;
      });

      // Persist to local DB (marks dirty in SQLite)
      await SpoolRepository.updateRemainingWeight(spool._localId, weight);

      // Background push — if offline, stays dirty for next sync()
      if (serverUrl) {
        SyncService.pushOne(serverUrl, spool._localId).then(() => {
          setIsOnline(true);
          setDirtySpoolIds((prev) => {
            const next = new Set(prev);
            next.delete(spoolId);
            return next;
          });
        }).catch(() => {
          setIsOnline(false);
          // Remains dirty — syncPending() or next refreshSpools() will retry
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

  // pendingUpdates: derived from in-flight dirty spool IDs — kept for screen backward compat
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
      theme,
      setTheme,
      defaultWeightMode,
      setDefaultWeightMode,
      persistenceEnabled: isPersistenceEnabled,
    }),
    [
      serverUrl,
      isOnboarded,
      isLoading,
      setServerUrl,
      markOnboarded,
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
      theme,
      setTheme,
      defaultWeightMode,
      setDefaultWeightMode,
      // isPersistenceEnabled is a module-level constant — no reactive dep needed
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
