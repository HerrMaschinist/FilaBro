/**
 * src/core/domain/filament.ts
 *
 * Pure domain entity. No sync fields, no DB fields, no HTTP fields.
 * remoteId is optional and is NOT part of the entity's identity.
 * Identity is localId only.
 */
export interface Filament {
  localId: string;
  remoteId?: number;
  name: string;
  material: string;
  colorHex?: string;
  manufacturerLocalId?: string;
  weight?: number;
  spoolWeight?: number;
  printTempMin?: number;
  printTempMax?: number;
  density?: number;
  comment?: string;
  /** Amount paid for this filament spool in the user's currency. Local-only, not synced to Spoolman. */
  paidPrice?: number;
  /** Shop or vendor where this filament was purchased. Local-only, not synced to Spoolman. */
  shop?: string;
  lastModifiedAt: number;
}
