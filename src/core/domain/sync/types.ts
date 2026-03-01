/**
 * src/core/domain/sync/types.ts
 *
 * Sync technical structures, separated from domain entities.
 * Domain entities (Spool, Filament, Manufacturer) do NOT contain these fields.
 * Adapters track these fields in the DB and map them here.
 *
 * dirtyFields is string[] — JSON encoding/decoding is the adapter's responsibility.
 */

export type SyncState = "synced" | "dirty" | "pending_push" | "conflict";

export type DirtyFieldSet = string[];

export type SyncEntityType = "spool" | "filament" | "manufacturer";

export interface SyncRecord {
  localId: string;
  entityType: SyncEntityType;
  syncState: SyncState;
  /** Field names with uncommitted local changes. Decoded from JSON by the adapter. */
  dirtyFields: DirtyFieldSet;
  /** Incremented on every local write. */
  localVersion: number;
  /** Last known remote version (proxy: server's last_modified timestamp). */
  remoteVersion?: number;
}
