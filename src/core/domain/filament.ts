/**
 * src/core/domain/filament.ts
 *
 * Pure domain entity. No sync fields, no DB fields, no HTTP fields.
 * remoteId is optional and is NOT part of the entity's identity.
 * Identity is localId only.
 */

/**
 * Local-only printing specification for a filament.
 * Never synced to Spoolman. Stored as flat columns in DB.
 */
export interface FilamentSpec {
  diameterMm?: number;
  printTempCMin?: number;
  printTempCMax?: number;
  bedTempCMin?: number;
  bedTempCMax?: number;
}

export interface Filament {
  localId: string;
  remoteId?: number;
  name: string;
  material: string;

  /**
   * Color fields — three levels of representation (all local-only except colorHex):
   *   colorNameRaw      — exactly what the user typed or selected
   *   colorNameNormalized — canonical English name (e.g. "Black", "Blue")
   *   colorHexNormalized — #RRGGBB from ColorNormalizer or user-entered hex
   *   colorHex          — Spoolman-sourced hex (synced from remote, not user-editable)
   */
  colorNameRaw?: string;
  colorNameNormalized?: string;
  colorHexNormalized?: string;
  colorHex?: string;

  manufacturerLocalId?: string;
  weight?: number;
  spoolWeight?: number;
  /** Spoolman-sourced print temperature range. Local spec overrides are in spec. */
  printTempMin?: number;
  printTempMax?: number;
  density?: number;
  comment?: string;
  /** Local-only spec: diameter and local temp overrides. Not synced to Spoolman. */
  spec?: FilamentSpec;
  /** Amount paid for this filament spool in the user's currency. Local-only. */
  paidPrice?: number;
  /** Shop or vendor where this filament was purchased. Local-only. */
  shop?: string;
  lastModifiedAt: number;
}
