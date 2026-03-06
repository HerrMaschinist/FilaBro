/**
 * lib/spoolViewTypes.ts
 *
 * UI-layer view-model types for spools and filaments.
 * These types are app-internal and have no dependency on the Spoolman API.
 * They are produced by AppContext.toViewSpool() from domain SpoolView objects.
 *
 * Note on field names: camelCase domain fields are mapped to these at the
 * composition boundary (AppContext). No component below AppContext touches
 * raw API response shapes.
 */

export interface Vendor {
  id: number;
  name: string;
}

export interface Filament {
  id: number;
  name: string;
  material: string;
  /** App-internal: canonical color name (normalized). */
  color_name?: string;
  /** Hex color from remote source (no # prefix). */
  color_hex?: string;
  /** App-internal: user-set #RRGGBB from ColorNormalizer. */
  color_hex_normalized?: string;
  vendor?: Vendor;
  weight?: number;
  spool_weight?: number;
  comment?: string;
  /** Local-only: purchase price. */
  paid_price?: number;
  /** Local-only: shop/vendor name. */
  shop?: string;
}

export interface Spool {
  id: number;
  filament: Filament;
  remaining_weight?: number;
  initial_weight?: number;
  spool_weight?: number;
  used_weight?: number;
  comment?: string;
  archived?: boolean;
  lot_nr?: string;
  last_used?: string;
  first_used?: string;
  registered?: string;
  /** Bridge: SQLite local_id. */
  _localId?: string;
  /** Bridge: local filament_local_id. */
  _filamentLocalId?: string;
  /** Bridge: local display_name. */
  _displayName?: string;
  /** Bridge: local qr_code. */
  _qrCode?: string;
  /** Bridge: local nfc_tag_id. */
  _nfcTagId?: string;
  /** Bridge: local favorite state. */
  _isFavorite?: boolean;
}

export function getFilamentColor(spool: Spool): string {
  const normalized = spool.filament?.color_hex_normalized;
  if (normalized) return normalized.startsWith("#") ? normalized : `#${normalized}`;
  const hex = spool.filament?.color_hex;
  if (!hex) return "#888888";
  return hex.startsWith("#") ? hex : `#${hex}`;
}

export function getRemainingPercent(spool: Spool): number {
  const remaining = spool.remaining_weight ?? spool.initial_weight ?? 0;
  const total = spool.initial_weight ?? spool.filament?.weight ?? 1000;
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (remaining / total) * 100));
}

export function getDisplayName(spool: Spool): string {
  const filament = spool.filament;
  if (!filament) return `Spool #${spool.id}`;
  const parts: string[] = [];
  if (filament.vendor?.name) parts.push(filament.vendor.name);
  if (filament.name) parts.push(filament.name);
  if (parts.length === 0) return `Spool #${spool.id}`;
  return parts.join(" – ");
}
