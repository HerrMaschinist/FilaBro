import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const STORAGE_KEYS = {
  SERVER_URL: "filabro_server_url",
  IS_ONBOARDED: "filabro_is_onboarded",
  THEME: "filabro_theme",
  FAVORITES: "filabro_favorites",
  SPOOL_CACHE: "filabro_spool_cache",
  LAST_SYNC: "filabro_last_sync",
  PENDING_UPDATES: "filabro_pending_updates",
  DEFAULT_WEIGHT_MODE: "filabro_default_weight_mode",
  LANGUAGE: "filabro_language",
} as const;

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    return AsyncStorage.setItem(key, value);
  }
  return SecureStore.setItemAsync(key, value);
}

async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === "web") {
    return AsyncStorage.removeItem(key);
  }
  return SecureStore.deleteItemAsync(key);
}

export async function getServerUrl(): Promise<string | null> {
  return secureGet(STORAGE_KEYS.SERVER_URL);
}

export async function setServerUrl(url: string): Promise<void> {
  return secureSet(STORAGE_KEYS.SERVER_URL, url);
}

export async function deleteServerUrl(): Promise<void> {
  return secureDelete(STORAGE_KEYS.SERVER_URL);
}

export async function getIsOnboarded(): Promise<boolean> {
  const val = await AsyncStorage.getItem(STORAGE_KEYS.IS_ONBOARDED);
  return val === "true";
}

export async function setIsOnboarded(val: boolean): Promise<void> {
  return AsyncStorage.setItem(STORAGE_KEYS.IS_ONBOARDED, val ? "true" : "false");
}

export async function getTheme(): Promise<string> {
  return (await AsyncStorage.getItem(STORAGE_KEYS.THEME)) ?? "auto";
}

export async function setTheme(theme: string): Promise<void> {
  return AsyncStorage.setItem(STORAGE_KEYS.THEME, theme);
}

export async function getFavorites(): Promise<number[]> {
  const val = await AsyncStorage.getItem(STORAGE_KEYS.FAVORITES);
  if (!val) return [];
  try {
    return JSON.parse(val) as number[];
  } catch {
    return [];
  }
}

export async function setFavorites(ids: number[]): Promise<void> {
  return AsyncStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(ids));
}

export async function getSpoolCache(): Promise<import("./spoolViewTypes").Spool[]> {
  const val = await AsyncStorage.getItem(STORAGE_KEYS.SPOOL_CACHE);
  if (!val) return [];
  try {
    return JSON.parse(val);
  } catch {
    return [];
  }
}

export async function setSpoolCache(
  spools: import("./spoolViewTypes").Spool[]
): Promise<void> {
  return AsyncStorage.setItem(STORAGE_KEYS.SPOOL_CACHE, JSON.stringify(spools));
}

export async function getLastSync(): Promise<number | null> {
  const val = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
  return val ? parseInt(val, 10) : null;
}

export async function setLastSync(ts: number): Promise<void> {
  return AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, ts.toString());
}

export interface PendingUpdate {
  id: string;
  spoolId: number;
  remaining_weight: number;
  timestamp: number;
}

export async function getPendingUpdates(): Promise<PendingUpdate[]> {
  const val = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_UPDATES);
  if (!val) return [];
  try {
    return JSON.parse(val);
  } catch {
    return [];
  }
}

export async function addPendingUpdate(
  update: Omit<PendingUpdate, "id">
): Promise<void> {
  const existing = await getPendingUpdates();
  const filtered = existing.filter((u) => u.spoolId !== update.spoolId);
  const newUpdate: PendingUpdate = {
    ...update,
    id:
      Date.now().toString() + Math.random().toString(36).substring(2, 9),
  };
  filtered.push(newUpdate);
  return AsyncStorage.setItem(
    STORAGE_KEYS.PENDING_UPDATES,
    JSON.stringify(filtered)
  );
}

export async function removePendingUpdate(id: string): Promise<void> {
  const existing = await getPendingUpdates();
  const filtered = existing.filter((u) => u.id !== id);
  return AsyncStorage.setItem(
    STORAGE_KEYS.PENDING_UPDATES,
    JSON.stringify(filtered)
  );
}

export async function clearPendingUpdates(): Promise<void> {
  return AsyncStorage.removeItem(STORAGE_KEYS.PENDING_UPDATES);
}

export async function getDefaultWeightMode(): Promise<string> {
  return (await AsyncStorage.getItem(STORAGE_KEYS.DEFAULT_WEIGHT_MODE)) ?? "slider";
}

export async function setDefaultWeightMode(mode: string): Promise<void> {
  return AsyncStorage.setItem(STORAGE_KEYS.DEFAULT_WEIGHT_MODE, mode);
}

export async function getLanguage(): Promise<string> {
  return (await AsyncStorage.getItem(STORAGE_KEYS.LANGUAGE)) ?? "en";
}

export async function setLanguage(lang: string): Promise<void> {
  return AsyncStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
}
