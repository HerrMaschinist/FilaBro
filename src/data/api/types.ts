/**
 * Spoolman REST API response types.
 * These represent what the server actually sends.
 * They are NOT domain models.
 */

export interface RemoteVendor {
  id: number;
  name: string;
  comment?: string;
}

export interface RemoteFilament {
  id: number;
  name: string;
  material: string;
  color_hex?: string;
  vendor?: RemoteVendor;
  /** Total filament weight in grams */
  weight?: number;
  /** Empty spool weight in grams */
  spool_weight?: number;
  comment?: string;
}

export interface RemoteSpool {
  id: number;
  filament: RemoteFilament;
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
}

export interface RemoteHealth {
  status: string;
  version?: string;
}

export interface SpoolPatchPayload {
  remaining_weight?: number;
}
