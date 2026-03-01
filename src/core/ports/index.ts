/**
 * src/core/ports/index.ts
 *
 * Phase 1: Port interfaces (contracts only, no implementation).
 * All types reference existing src/domain/models.ts to avoid duplication
 * in this phase. Later phases will migrate domain types to src/core/domain/.
 *
 * Naming: I-prefix denotes an interface (port contract).
 */

import type {
  Spool,
  SpoolView,
  Filament,
  Manufacturer,
} from "@/src/domain/models";

// ─── Infrastructure Utilities ─────────────────────────────────────────────────

export interface IClock {
  now(): number;
}

export interface IIdGenerator {
  generate(): string;
}

// ─── Spool Repository ─────────────────────────────────────────────────────────

export interface CreateSpoolInput {
  filamentLocalId: string;
  remainingWeight?: number;
  initialWeight?: number;
  spoolWeight?: number;
  comment?: string;
  displayName?: string;
  lotNr?: string;
  qrCode?: string;
  nfcTagId?: string;
}

export interface UpsertSpoolFromRemoteInput {
  remoteId: number;
  filamentLocalId?: string;
  remainingWeight?: number;
  initialWeight?: number;
  spoolWeight?: number;
  usedWeight?: number;
  comment?: string;
  archived?: boolean;
  lotNr?: string;
  lastUsed?: string;
  firstUsed?: string;
  registered?: string;
}

export interface ISpoolRepository {
  getAll(): Promise<Spool[]>;
  getAllView(): Promise<SpoolView[]>;
  getByLocalId(localId: string): Promise<Spool | null>;
  getByLocalIdView(localId: string): Promise<SpoolView | null>;
  getByRemoteId(remoteId: number): Promise<Spool | null>;
  getDirty(): Promise<Spool[]>;
  createLocal(data: CreateSpoolInput): Promise<Spool>;
  upsertFromRemote(data: UpsertSpoolFromRemoteInput): Promise<Spool>;
  updateRemainingWeight(localId: string, grams: number): Promise<Spool | null>;
  setFavorite(localId: string, isFavorite: boolean): Promise<void>;
  markSynced(localId: string): Promise<void>;
  deleteByLocalId(localId: string): Promise<boolean>;
  deleteAll(): Promise<void>;
}

// ─── Filament Repository ──────────────────────────────────────────────────────

export interface CreateFilamentInput {
  name: string;
  material: string;
  colorHex?: string;
  manufacturerLocalId?: string;
  weight?: number;
  spoolWeight?: number;
  comment?: string;
}

export interface UpsertFilamentFromRemoteInput {
  remoteId: number;
  name: string;
  material: string;
  colorHex?: string;
  manufacturerLocalId?: string;
  weight?: number;
  spoolWeight?: number;
  comment?: string;
}

export interface IFilamentRepository {
  getAll(): Promise<Filament[]>;
  getByLocalId(localId: string): Promise<Filament | null>;
  getByRemoteId(remoteId: number): Promise<Filament | null>;
  createLocal(data: CreateFilamentInput): Promise<Filament>;
  upsertFromRemote(data: UpsertFilamentFromRemoteInput): Promise<Filament>;
  deleteByLocalId(localId: string): Promise<boolean>;
  deleteAll(): Promise<void>;
}

// ─── Manufacturer Repository ──────────────────────────────────────────────────

export interface CreateManufacturerInput {
  name: string;
  website?: string;
  comment?: string;
}

export interface UpsertManufacturerFromRemoteInput {
  remoteId: number;
  name: string;
  website?: string;
  comment?: string;
}

export interface IManufacturerRepository {
  getAll(): Promise<Manufacturer[]>;
  getByLocalId(localId: string): Promise<Manufacturer | null>;
  getByRemoteId(remoteId: number): Promise<Manufacturer | null>;
  createLocal(data: CreateManufacturerInput): Promise<Manufacturer>;
  upsertFromRemote(data: UpsertManufacturerFromRemoteInput): Promise<Manufacturer>;
  deleteByLocalId(localId: string): Promise<boolean>;
  deleteAll(): Promise<void>;
}

// ─── Sync Meta Repository ─────────────────────────────────────────────────────

export type SyncEntityType = "spool" | "filament" | "manufacturer";

export interface SyncMetaRecord {
  entityType: SyncEntityType;
  lastPullAt?: number;
  lastPushAt?: number;
  serverUrl: string;
}

export interface ISyncMetaRepository {
  get(entityType: SyncEntityType): Promise<SyncMetaRecord | null>;
  upsert(
    entityType: SyncEntityType,
    field: "lastPullAt" | "lastPushAt",
    serverUrl: string
  ): Promise<void>;
}

// ─── External Filament System Port (Spoolman adapter contract) ────────────────

export interface RemoteVendorDTO {
  id: number;
  name: string;
  comment?: string;
}

export interface RemoteFilamentDTO {
  id: number;
  name: string;
  material: string;
  color_hex?: string;
  vendor?: RemoteVendorDTO;
  weight?: number;
  spool_weight?: number;
  comment?: string;
}

export interface RemoteSpoolDTO {
  id: number;
  filament: RemoteFilamentDTO;
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

export interface SpoolPatchDTO {
  remaining_weight?: number;
}

export interface IExternalFilamentSystemPort {
  healthCheck(baseUrl: string): Promise<{ status: string }>;
  getSpools(baseUrl: string): Promise<RemoteSpoolDTO[]>;
  getFilaments(baseUrl: string): Promise<RemoteFilamentDTO[]>;
  getVendors(baseUrl: string): Promise<RemoteVendorDTO[]>;
  patchSpool(baseUrl: string, remoteId: number, patch: SpoolPatchDTO): Promise<void>;
}

// ─── Sync Result ──────────────────────────────────────────────────────────────

export interface SyncResult {
  pulled: number;
  pushed: number;
  conflicts: number;
  errors: string[];
}
