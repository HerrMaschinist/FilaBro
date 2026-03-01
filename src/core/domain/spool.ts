/**
 * src/core/domain/spool.ts
 *
 * Pure domain entity. No sync fields, no DB fields, no HTTP fields.
 * remoteId is optional and is NOT part of the entity's identity.
 * Identity is localId only.
 *
 * remainingWeight is a projected value. Phase 4 will replace the direct
 * mutation with an append-only UsageEvent model and compute this as a projection.
 */
import type { Filament } from "./filament";
import type { Manufacturer } from "./manufacturer";

export interface Spool {
  localId: string;
  remoteId?: number;
  filamentLocalId?: string;
  remainingWeight?: number;
  initialWeight?: number;
  spoolWeight?: number;
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
  isFavorite: boolean;
  lastModifiedAt: number;
}

/**
 * Read model: Spool with hydrated relationships for display.
 * Only used in UI and application read paths.
 */
export interface SpoolView extends Spool {
  filament?: Filament & { manufacturer?: Manufacturer };
}
