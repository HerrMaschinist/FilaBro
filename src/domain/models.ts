/**
 * Domain Layer — pure TypeScript interfaces.
 * No DB imports, no API imports. Only business types.
 */

export type SyncState = "synced" | "dirty" | "pending_push" | "conflict";

export interface Manufacturer {
  localId: string;
  remoteId?: number;
  name: string;
  website?: string;
  comment?: string;
  syncState: SyncState;
  lastModifiedAt: number; // unix ms
}

export interface MaterialType {
  id: string; // e.g. "PLA", "PETG", "ABS"
  label: string;
}

export interface Filament {
  localId: string;
  remoteId?: number;
  name: string;
  material: string;
  colorHex?: string;
  manufacturerLocalId?: string;
  /** Total weight of filament on a full spool in grams */
  weight?: number;
  /** Weight of empty spool in grams */
  spoolWeight?: number;
  printTempMin?: number;
  printTempMax?: number;
  density?: number;
  comment?: string;
  syncState: SyncState;
  lastModifiedAt: number; // unix ms
}

export interface Spool {
  localId: string;
  remoteId?: number;
  filamentLocalId?: string;
  /** Remaining filament weight in grams */
  remainingWeight?: number;
  /** Initial filament weight when spool was new */
  initialWeight?: number;
  /** Weight of empty spool */
  spoolWeight?: number;
  /** Used filament weight */
  usedWeight?: number;
  comment?: string;
  archived: boolean;
  displayName?: string;
  qrCode?: string;
  nfcTagId?: string;
  lotNr?: string;
  lastUsed?: string;
  firstUsed?: string;
  registered?: string;
  /** Local-only field, never sent to Spoolman */
  isFavorite: boolean;
  syncState: SyncState;
  /**
   * JSON-encoded string[] of field names that have local uncommitted changes.
   * Example: '["remaining_weight"]'
   */
  dirtyFields?: string;
  /** Incremented on every local write */
  localVersion: number;
  /** Last known remote version (Spoolman does not provide explicit versions,
   *  we use the server's last_modified as a proxy) */
  remoteVersion?: number;
  lastModifiedAt: number; // unix ms
}

/**
 * Spool with its hydrated Filament and Manufacturer relationships.
 * Used in UI layers.
 */
export interface SpoolView extends Spool {
  filament?: Filament & { manufacturer?: Manufacturer };
}

/**
 * Tracks when we last pulled/pushed each entity type.
 */
export interface SyncMeta {
  entityType: "spool" | "filament" | "manufacturer";
  lastPullAt?: number; // unix ms
  lastPushAt?: number; // unix ms
  serverUrl: string;
}

/**
 * Prepared for future native widget integration.
 * Widget reads a serialized snapshot of favorite spools.
 */
export interface WidgetSnapshot {
  generatedAt: number;
  spools: Pick<SpoolView, "localId" | "remoteId" | "remainingWeight" | "initialWeight" | "isFavorite">[];
}

/**
 * Optional: prepared for printer profiles feature.
 */
export interface PrinterProfile {
  localId: string;
  name: string;
  nozzleDiameter?: number;
  bedTemp?: number;
  nozzleTemp?: number;
  compatibleMaterials?: string; // JSON array string
}
