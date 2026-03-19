import * as SQLite from "expo-sqlite";
import * as FileSystem from "expo-file-system/legacy";
import { Asset } from "expo-asset";

const FILABASE_DB_NAME = "filabase_catalog.db";

let _filabaseDb: SQLite.SQLiteDatabase | null = null;

export async function initFilabaseDatabase(): Promise<void> {
  if (_filabaseDb) return;

  const dbPath = FileSystem.documentDirectory + "SQLite/" + FILABASE_DB_NAME;
  const dbDir = FileSystem.documentDirectory + "SQLite/";

  const dirInfo = await FileSystem.getInfoAsync(dbDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dbDir, { intermediates: true });
  }

  const fileInfo = await FileSystem.getInfoAsync(dbPath);
  if (!fileInfo.exists) {
    const asset = Asset.fromModule(require("../../../assets/filabase_catalog.db"));
    await asset.downloadAsync();
    if (asset.localUri) {
      await FileSystem.copyAsync({ from: asset.localUri, to: dbPath });
    }
  }

  _filabaseDb = SQLite.openDatabaseSync(FILABASE_DB_NAME);
}

export function getFilabaseDb(): SQLite.SQLiteDatabase {
  if (!_filabaseDb) throw new Error("FilaBase DB not initialized");
  return _filabaseDb;
}

export function isFilabaseReady(): boolean {
  return _filabaseDb !== null;
}
