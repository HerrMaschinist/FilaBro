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
  getFavorites,
  setFavorites,
  getServerUrl,
  setServerUrl as persistServerUrl,
  setIsOnboarded,
  getIsOnboarded,
  getSpoolCache,
  setSpoolCache,
  getLastSync,
  setLastSync,
  getPendingUpdates,
  addPendingUpdate,
  removePendingUpdate,
  PendingUpdate,
  getTheme,
  setTheme as persistTheme,
  getDefaultWeightMode,
  setDefaultWeightMode as persistWeightMode,
} from "@/lib/storage";
import {
  fetchSpools,
  updateSpoolWeight,
  Spool,
} from "@/lib/spoolman";

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

  pendingUpdates: PendingUpdate[];
  updateWeight: (spoolId: number, weight: number) => Promise<void>;
  syncPending: () => Promise<void>;

  isOnline: boolean;

  theme: string;
  setTheme: (t: string) => void;

  defaultWeightMode: string;
  setDefaultWeightMode: (m: string) => void;
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

  const [favorites, setFavoritesState] = useState<number[]>([]);
  const [pendingUpdates, setPendingUpdates] = useState<PendingUpdate[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [theme, setThemeState] = useState("auto");
  const [defaultWeightMode, setDefaultWeightModeState] = useState("slider");

  useEffect(() => {
    (async () => {
      try {
        const [url, onboarded, favs, cache, sync, pending, thm, wmode] =
          await Promise.all([
            getServerUrl(),
            getIsOnboarded(),
            getFavorites(),
            getSpoolCache(),
            getLastSync(),
            getPendingUpdates(),
            getTheme(),
            getDefaultWeightMode(),
          ]);
        setServerUrlState(url ?? "");
        setIsOnboardedState(onboarded);
        setFavoritesState(favs);
        setSpools(cache);
        setLastSyncState(sync);
        setPendingUpdates(pending);
        setThemeState(thm);
        setDefaultWeightModeState(wmode);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const setServerUrl = useCallback(async (url: string) => {
    await persistServerUrl(url);
    setServerUrlState(url);
  }, []);

  const markOnboarded = useCallback(async () => {
    await setIsOnboarded(true);
    setIsOnboardedState(true);
  }, []);

  const refreshSpools = useCallback(async () => {
    setIsSpoolsLoading(true);
    setSpoolsError(null);
    try {
      const data = await fetchSpools();
      setSpools(data);
      await setSpoolCache(data);
      const now = Date.now();
      setLastSyncState(now);
      await setLastSync(now);
      setIsOnline(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setSpoolsError(msg);
      setIsOnline(false);
      const cached = await getSpoolCache();
      if (cached.length > 0) setSpools(cached);
    } finally {
      setIsSpoolsLoading(false);
    }
  }, []);

  const toggleFavorite = useCallback((id: number) => {
    setFavoritesState((prev) => {
      const next = prev.includes(id)
        ? prev.filter((f) => f !== id)
        : [...prev, id];
      setFavorites(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (id: number) => favorites.includes(id),
    [favorites]
  );

  const updateWeight = useCallback(
    async (spoolId: number, weight: number) => {
      setSpools((prev) =>
        prev.map((s) =>
          s.id === spoolId ? { ...s, remaining_weight: weight } : s
        )
      );
      try {
        await updateSpoolWeight(spoolId, weight);
        setIsOnline(true);
        setSpools((prev) => {
          const updated = prev.map((s) =>
            s.id === spoolId ? { ...s, remaining_weight: weight } : s
          );
          setSpoolCache(updated);
          return updated;
        });
      } catch {
        setIsOnline(false);
        await addPendingUpdate({
          spoolId,
          remaining_weight: weight,
          timestamp: Date.now(),
        });
        const pending = await getPendingUpdates();
        setPendingUpdates(pending);
      }
    },
    []
  );

  const syncPending = useCallback(async () => {
    const pending = await getPendingUpdates();
    if (pending.length === 0) return;
    const results = await Promise.allSettled(
      pending.map(async (u) => {
        await updateSpoolWeight(u.spoolId, u.remaining_weight);
        await removePendingUpdate(u.id);
      })
    );
    const success = results.filter((r) => r.status === "fulfilled").length;
    if (success > 0) {
      const remaining = await getPendingUpdates();
      setPendingUpdates(remaining);
      setIsOnline(true);
      await refreshSpools();
    }
  }, [refreshSpools]);

  const setTheme = useCallback((t: string) => {
    setThemeState(t);
    persistTheme(t);
  }, []);

  const setDefaultWeightMode = useCallback((m: string) => {
    setDefaultWeightModeState(m);
    persistWeightMode(m);
  }, []);

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
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
