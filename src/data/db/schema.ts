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
  /** Legacy color name field (v7). Superseded by colorNameRaw. Kept to avoid DROP. */
  colorName: text("color_name"),
  /** Spoolman-sourced hex — written by sync engine, not user edits. */
  colorHex: text("color_hex"),
  /** v8: Exactly what the user typed or selected. Local-only. */
  colorNameRaw: text("color_name_raw"),
  /** v8: Canonical English color name (e.g. "Black"). Local-only. */
  colorNameNormalized: text("color_name_norm"),
  /** v8: User-set #RRGGBB. Local-only. */
  colorHexNormalized: text("color_hex_norm"),
  manufacturerLocalId: text("manufacturer_local_id"),
  weight: real("weight"),
  spoolWeight: real("spool_weight"),
  printTempMin: integer("print_temp_min"),
  printTempMax: integer("print_temp_max"),
  density: real("density"),
  comment: text("comment"),
  /** Amount paid — local-only, never synced to Spoolman. */
  paidPrice: real("paid_price"),
  /** Shop/vendor name — local-only, never synced to Spoolman. */
  shop: text("shop"),
  /** v8: FilamentSpec fields — local-only. */
  diameterMm: real("diameter_mm"),
  printTempCMin: integer("print_temp_c_min"),
  printTempCMax: integer("print_temp_c_max"),
  bedTempCMin: integer("bed_temp_c_min"),
  bedTempCMax: integer("bed_temp_c_max"),
  syncState: text("sync_state").notNull().default("synced"),
  lastModifiedAt: integer("last_modified_at").notNull(),
});

export const spools = sqliteTable(
  "spools",
  {
    localId: text("local_id").primaryKey(),
    remoteId: integer("remote_id"),
    filamentLocalId: text("filament_local_id"),
    /**
     * Legacy column — initial or remote-sourced value.
     * Phase 4 source of truth for remaining weight is spool_stats.remaining_weight.
     * Do NOT write to this column for user-initiated weight changes.
     */
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
  },
  (t) => ({
    archivedIdx: index("idx_spools_archived").on(t.archived),
    filamentLocalIdIdx: index("idx_spools_filament_local_id").on(t.filamentLocalId),
    qrCodeIdx: index("idx_spools_qr_code").on(t.qrCode),
    nfcTagIdIdx: index("idx_spools_nfc_tag_id").on(t.nfcTagId),
    lastModifiedAtIdx: index("idx_spools_last_modified_at").on(t.lastModifiedAt),
  })
);

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

/**
 * Append-only log of filament usage events.
 * grams is always positive.
 *   type="consume"    → amount consumed; reduces remaining
 *   type="adjustment" → absolute new remaining weight; source of truth overwrite
 */
export const usageEvents = sqliteTable(
  "usage_events",
  {
    id: text("id").primaryKey(),
    spoolLocalId: text("spool_local_id").notNull(),
    /** Integer grams — stored as integer, read as integer. */
    grams: integer("grams").notNull(),
    type: text("type").notNull(),
    /** Unix milliseconds when the usage occurred. */
    occurredAt: integer("occurred_at").notNull(),
    source: text("source").notNull(),
    note: text("note"),
  },
  (t) => ({
    spoolTimeIdx: index("usage_events_spool_time_idx").on(
      t.spoolLocalId,
      t.occurredAt
    ),
    spoolIdx: index("usage_events_spool_idx").on(t.spoolLocalId),
  })
);

/**
 * Projection table — stores the current calculated remaining weight per spool.
 * Written by WeightUseCase and SyncUseCase, never by direct user edits to spools.
 * Reading this is always preferred over spools.remaining_weight.
 */
export const spoolStats = sqliteTable(
  "spool_stats",
  {
    spoolLocalId: text("spool_local_id").primaryKey(),
    /** Projected remaining weight in grams. Null until first usage event. */
    remainingWeight: integer("remaining_weight"),
    /** Unix milliseconds when this projection was last updated. */
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    updatedIdx: index("spool_stats_updated_idx").on(t.updatedAt),
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
export type DbUsageEvent = typeof usageEvents.$inferSelect;
export type InsertUsageEvent = typeof usageEvents.$inferInsert;
export type DbSpoolStats = typeof spoolStats.$inferSelect;
export type InsertSpoolStats = typeof spoolStats.$inferInsert;
