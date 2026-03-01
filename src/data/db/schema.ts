/**
 * Drizzle SQLite schema — mirrors domain models exactly.
 * Integer for booleans, text for JSON blobs, integer for timestamps (unix ms).
 */
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
} from "drizzle-orm/sqlite-core";

export const manufacturers = sqliteTable("manufacturers", {
  localId: text("local_id").primaryKey(),
  remoteId: integer("remote_id"),
  name: text("name").notNull(),
  website: text("website"),
  comment: text("comment"),
  syncState: text("sync_state").notNull().default("synced"),
  lastModifiedAt: integer("last_modified_at").notNull(),
});

export const filaments = sqliteTable("filaments", {
  localId: text("local_id").primaryKey(),
  remoteId: integer("remote_id"),
  name: text("name").notNull(),
  material: text("material").notNull(),
  colorHex: text("color_hex"),
  manufacturerLocalId: text("manufacturer_local_id"),
  weight: real("weight"),
  spoolWeight: real("spool_weight"),
  printTempMin: integer("print_temp_min"),
  printTempMax: integer("print_temp_max"),
  density: real("density"),
  comment: text("comment"),
  syncState: text("sync_state").notNull().default("synced"),
  lastModifiedAt: integer("last_modified_at").notNull(),
});

export const spools = sqliteTable("spools", {
  localId: text("local_id").primaryKey(),
  remoteId: integer("remote_id"),
  filamentLocalId: text("filament_local_id"),
  remainingWeight: real("remaining_weight"),
  initialWeight: real("initial_weight"),
  spoolWeight: real("spool_weight"),
  usedWeight: real("used_weight"),
  comment: text("comment"),
  /** 0 = false, 1 = true */
  archived: integer("archived").notNull().default(0),
  displayName: text("display_name"),
  qrCode: text("qr_code"),
  nfcTagId: text("nfc_tag_id"),
  lotNr: text("lot_nr"),
  lastUsed: text("last_used"),
  firstUsed: text("first_used"),
  registered: text("registered"),
  /** Local-only, never synced to Spoolman */
  isFavorite: integer("is_favorite").notNull().default(0),
  syncState: text("sync_state").notNull().default("synced"),
  /** JSON string: string[] of dirty field names */
  dirtyFields: text("dirty_fields"),
  localVersion: integer("local_version").notNull().default(1),
  remoteVersion: integer("remote_version"),
  lastModifiedAt: integer("last_modified_at").notNull(),
});

export const syncMeta = sqliteTable("sync_meta", {
  entityType: text("entity_type").primaryKey(),
  lastPullAt: integer("last_pull_at"),
  lastPushAt: integer("last_push_at"),
  serverUrl: text("server_url").notNull().default(""),
});

export const printerProfiles = sqliteTable("printer_profiles", {
  localId: text("local_id").primaryKey(),
  name: text("name").notNull(),
  nozzleDiameter: real("nozzle_diameter"),
  bedTemp: integer("bed_temp"),
  nozzleTemp: integer("nozzle_temp"),
  compatibleMaterials: text("compatible_materials"),
});

/**
 * Stores unresolved conflicts between local state and remote snapshots.
 * Written by SyncUseCase when a conflict is flagged.
 * Read by UI to show conflict indicators.
 * Resolved by Application Layer when the user makes a decision.
 */
export const conflictSnapshots = sqliteTable(
  "conflict_snapshots",
  {
    id: text("id").primaryKey(),
    /** "spool" | "filament" | "manufacturer" */
    entityType: text("entity_type").notNull(),
    localId: text("local_id").notNull(),
    /** JSON-serialized remote DTO at time of conflict */
    remoteSnapshotJson: text("remote_snapshot_json").notNull(),
    capturedAt: integer("captured_at").notNull(),
    /** null = open conflict (unresolved) */
    resolvedAt: integer("resolved_at"),
    /** "keep_local" | "accept_remote" | null */
    resolution: text("resolution"),
  },
  (t) => ({
    localEntityIdx: index("conflict_local_entity_idx").on(
      t.entityType,
      t.localId
    ),
    resolvedIdx: index("conflict_resolved_idx").on(t.resolvedAt),
  })
);

export type DbManufacturer = typeof manufacturers.$inferSelect;
export type InsertManufacturer = typeof manufacturers.$inferInsert;
export type DbFilament = typeof filaments.$inferSelect;
export type InsertFilament = typeof filaments.$inferInsert;
export type DbSpool = typeof spools.$inferSelect;
export type InsertSpool = typeof spools.$inferInsert;
export type DbSyncMeta = typeof syncMeta.$inferSelect;
export type DbConflictSnapshot = typeof conflictSnapshots.$inferSelect;
export type InsertConflictSnapshot = typeof conflictSnapshots.$inferInsert;
