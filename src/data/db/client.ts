/**
 * Database client.
 * Opens expo-sqlite, runs versioned migrations, exports drizzle db instance.
 *
 * Call initDatabase() once at app startup (in root _layout.tsx).
 */
import * as SQLite from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import * as schema from "./schema";

const DB_NAME = "filabro.db";
const CURRENT_SCHEMA_VERSION = 6;

/**
 * Versioned SQL migrations.
 * Each entry runs when upgrading FROM (version - 1) TO version.
 * Only append — never edit existing entries.
 */
const MIGRATIONS: { version: number; statements: string[] }[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS schema_version (
         version INTEGER NOT NULL
       )`,
      `INSERT INTO schema_version (version) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM schema_version)`,
      `CREATE TABLE IF NOT EXISTS manufacturers (
         local_id       TEXT PRIMARY KEY,
         remote_id      INTEGER,
         name           TEXT NOT NULL,
         comment        TEXT,
         sync_state     TEXT NOT NULL DEFAULT 'synced',
         last_modified_at INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_manufacturers_remote_id ON manufacturers(remote_id)`,
      `CREATE TABLE IF NOT EXISTS filaments (
         local_id              TEXT PRIMARY KEY,
         remote_id             INTEGER,
         name                  TEXT NOT NULL,
         material              TEXT NOT NULL,
         color_hex             TEXT,
         manufacturer_local_id TEXT,
         weight                REAL,
         spool_weight          REAL,
         comment               TEXT,
         sync_state            TEXT NOT NULL DEFAULT 'synced',
         last_modified_at      INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_filaments_remote_id ON filaments(remote_id)`,
      `CREATE TABLE IF NOT EXISTS spools (
         local_id          TEXT PRIMARY KEY,
         remote_id         INTEGER,
         filament_local_id TEXT,
         remaining_weight  REAL,
         initial_weight    REAL,
         spool_weight      REAL,
         used_weight       REAL,
         comment           TEXT,
         archived          INTEGER NOT NULL DEFAULT 0,
         lot_nr            TEXT,
         last_used         TEXT,
         first_used        TEXT,
         registered        TEXT,
         is_favorite       INTEGER NOT NULL DEFAULT 0,
         sync_state        TEXT NOT NULL DEFAULT 'synced',
         dirty_fields      TEXT,
         local_version     INTEGER NOT NULL DEFAULT 1,
         remote_version    INTEGER,
         last_modified_at  INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_spools_remote_id ON spools(remote_id)`,
      `CREATE INDEX IF NOT EXISTS idx_spools_sync_state ON spools(sync_state)`,
      `CREATE TABLE IF NOT EXISTS sync_meta (
         entity_type TEXT PRIMARY KEY,
         last_pull_at INTEGER,
         last_push_at INTEGER,
         server_url   TEXT NOT NULL DEFAULT ''
       )`,
      `CREATE TABLE IF NOT EXISTS printer_profiles (
         local_id              TEXT PRIMARY KEY,
         name                  TEXT NOT NULL,
         nozzle_diameter       REAL,
         bed_temp              INTEGER,
         nozzle_temp           INTEGER,
         compatible_materials  TEXT
       )`,
    ],
  },
  {
    version: 2,
    statements: [
      `ALTER TABLE manufacturers ADD COLUMN website TEXT`,
      `ALTER TABLE filaments ADD COLUMN print_temp_min INTEGER`,
      `ALTER TABLE filaments ADD COLUMN print_temp_max INTEGER`,
      `ALTER TABLE filaments ADD COLUMN density REAL`,
      `ALTER TABLE spools ADD COLUMN display_name TEXT`,
      `ALTER TABLE spools ADD COLUMN qr_code TEXT`,
      `ALTER TABLE spools ADD COLUMN nfc_tag_id TEXT`,
    ],
  },
  {
    version: 3,
    statements: [
      `CREATE TABLE IF NOT EXISTS conflict_snapshots (
         id                   TEXT PRIMARY KEY,
         entity_type          TEXT NOT NULL,
         local_id             TEXT NOT NULL,
         remote_snapshot_json TEXT NOT NULL,
         captured_at          INTEGER NOT NULL,
         resolved_at          INTEGER,
         resolution           TEXT
       )`,
      `CREATE INDEX IF NOT EXISTS conflict_local_entity_idx ON conflict_snapshots(entity_type, local_id)`,
      `CREATE INDEX IF NOT EXISTS conflict_resolved_idx ON conflict_snapshots(resolved_at)`,
    ],
  },
  {
    version: 4,
    statements: [
      `CREATE TABLE IF NOT EXISTS usage_events (
         id             TEXT PRIMARY KEY,
         spool_local_id TEXT NOT NULL,
         grams          INTEGER NOT NULL,
         type           TEXT NOT NULL,
         occurred_at    INTEGER NOT NULL,
         source         TEXT NOT NULL,
         note           TEXT
       )`,
      `CREATE INDEX IF NOT EXISTS usage_events_spool_time_idx ON usage_events(spool_local_id, occurred_at)`,
      `CREATE INDEX IF NOT EXISTS usage_events_spool_idx ON usage_events(spool_local_id)`,
      `CREATE TABLE IF NOT EXISTS spool_stats (
         spool_local_id   TEXT PRIMARY KEY,
         remaining_weight INTEGER,
         updated_at       INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS spool_stats_updated_idx ON spool_stats(updated_at)`,
      `INSERT OR IGNORE INTO spool_stats (spool_local_id, remaining_weight, updated_at)
       SELECT local_id, CAST(remaining_weight AS INTEGER), last_modified_at
       FROM spools
       WHERE remaining_weight IS NOT NULL`,
    ],
  },
  {
    version: 5,
    statements: [
      // Phase 5: additional indexes for 1000+ spool scale
      `CREATE INDEX IF NOT EXISTS idx_spools_archived ON spools(archived)`,
      `CREATE INDEX IF NOT EXISTS idx_spools_filament_local_id ON spools(filament_local_id)`,
      `CREATE INDEX IF NOT EXISTS idx_spools_qr_code ON spools(qr_code)`,
      `CREATE INDEX IF NOT EXISTS idx_spools_nfc_tag_id ON spools(nfc_tag_id)`,
      `CREATE INDEX IF NOT EXISTS idx_spools_last_modified_at ON spools(last_modified_at)`,
      `CREATE INDEX IF NOT EXISTS idx_filaments_manufacturer_local_id ON filaments(manufacturer_local_id)`,
    ],
  },
  {
    version: 6,
    statements: [
      // Phase 5.1A: purchase metadata fields on filaments (local-only, not synced to Spoolman)
      `ALTER TABLE filaments ADD COLUMN paid_price REAL`,
      `ALTER TABLE filaments ADD COLUMN shop TEXT`,
    ],
  },
];

/**
 * true on native — SQLite is available and persistence is active.
 * AppContext surfaces this to the UI.
 */
export const isPersistenceEnabled = true;

let _sqliteDb: SQLite.SQLiteDatabase | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _initialized = false;

function getSqliteDb(): SQLite.SQLiteDatabase {
  if (!_sqliteDb) {
    _sqliteDb = SQLite.openDatabaseSync(DB_NAME);
  }
  return _sqliteDb;
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!_db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return _db;
}


function getCurrentVersion(db: SQLite.SQLiteDatabase): number {
  try {
    const result = db.getFirstSync<{ version: number }>(
      "SELECT version FROM schema_version LIMIT 1"
    );
    return result?.version ?? 0;
  } catch {
    return 0;
  }
}

function setVersion(db: SQLite.SQLiteDatabase, version: number): void {
  db.runSync("UPDATE schema_version SET version = ?", [version]);
}

/**
 * Run all pending migrations synchronously.
 * Safe to call multiple times — skips already-applied versions.
 */
export function initDatabase(): void {
  if (_initialized) return;

  const sqlite = getSqliteDb();

  sqlite.execSync(
    `CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)`
  );
  sqlite.execSync(
    `INSERT INTO schema_version (version) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM schema_version)`
  );

  const currentVersion = getCurrentVersion(sqlite);

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue;

    if (__DEV__) {
      console.log(`[DB] Running migration to v${migration.version}`);
    }

    sqlite.withTransactionSync(() => {
      for (const stmt of migration.statements) {
        if (
          stmt.includes("CREATE TABLE IF NOT EXISTS schema_version") ||
          stmt.includes("INSERT INTO schema_version")
        ) {
          continue;
        }
        sqlite.execSync(stmt);
      }
      setVersion(sqlite, migration.version);
    });

    if (__DEV__) {
      console.log(`[DB] Migration v${migration.version} complete`);
    }
  }

  _db = drizzle(sqlite, { schema });
  _initialized = true;

  if (__DEV__) {
    console.log(`[DB] Ready (schema v${CURRENT_SCHEMA_VERSION})`);
  }
}
