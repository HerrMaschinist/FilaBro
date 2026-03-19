import * as SQLite from "expo-sqlite";
import * as FileSystem from "expo-file-system/legacy";
import { Asset } from "expo-asset";

const CATALOG_DB_NAME = "ofd_catalog.db";

let _catalogDb: SQLite.SQLiteDatabase | null = null;

export async function initCatalogDatabase(): Promise<void> {
  if (_catalogDb) return;

  const dbPath = FileSystem.documentDirectory + "SQLite/" + CATALOG_DB_NAME;
  const dbDir = FileSystem.documentDirectory + "SQLite/";

  // Verzeichnis anlegen falls nicht vorhanden
  const dirInfo = await FileSystem.getInfoAsync(dbDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dbDir, { intermediates: true });
  }

  // Prüfen ob DB bereits kopiert
  const fileInfo = await FileSystem.getInfoAsync(dbPath);
  let needsCopy = !fileInfo.exists;

  // Versions-Check: Falls DB existiert aber sizes-Tabelle fehlt → neu kopieren
  if (!needsCopy) {
    try {
      const testDb = SQLite.openDatabaseSync(CATALOG_DB_NAME);
      const tables = testDb.getAllSync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='sizes'"
      );
      if (tables.length === 0) {
        needsCopy = true;
        await FileSystem.deleteAsync(dbPath, { idempotent: true });
      }
    } catch {
      needsCopy = true;
    }
  }

  if (needsCopy) {
    // Asset laden und kopieren
    const asset = Asset.fromModule(require("../../../assets/ofd_catalog.db"));
    await asset.downloadAsync();
    if (asset.localUri) {
      await FileSystem.copyAsync({ from: asset.localUri, to: dbPath });
    }
  }

  _catalogDb = SQLite.openDatabaseSync(CATALOG_DB_NAME);
}

export function getCatalogDb(): SQLite.SQLiteDatabase {
  if (!_catalogDb) throw new Error("Catalog DB not initialized");
  return _catalogDb;
}

export function isCatalogReady(): boolean {
  return _catalogDb !== null;
}
