/**
 * src/core/ports/index.ts
 *
 * Port interfaces (contracts only, no implementation).
 * All types come from src/core/domain — no infrastructure imports.
 */

import type { Spool, SpoolView } from "@/src/core/domain/spool";
import type { Filament, FilamentSpec } from "@/src/core/domain/filament";
import type { Manufacturer } from "@/src/core/domain/manufacturer";
import type { UsageEvent } from "@/src/core/domain/usage";

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

export interface UpdateSpoolPatch {
  displayName?: string;
  archived?: boolean;
  isFavorite?: boolean;
  qrCode?: string;
  nfcTagId?: string;
  lotNr?: string;
  spoolWeight?: number;
  initialWeight?: number;
  comment?: string;
}

export interface ISpoolRepository {
  getAll(): Promise<Spool[]>;
  /** JOIN-based — no N+1. Loads all spools with filament/manufacturer hydrated. */
  getAllView(): Promise<SpoolView[]>;
  /** Paged JOIN-based view. offset = page * pageSize. */
  getPagedView(offset: number, limit: number, includeArchived?: boolean): Promise<SpoolView[]>;
  /** Total count of spools — used with getPagedView for pagination. */
  countSpools(includeArchived?: boolean): Promise<number>;
  getByLocalId(localId: string): Promise<Spool | null>;
  getByLocalIdView(localId: string): Promise<SpoolView | null>;
  getByRemoteId(remoteId: number): Promise<Spool | null>;
  /** Indexed lookup by qr_code column. */
  findByQrCode(qr: string): Promise<SpoolView | null>;
  /** Indexed lookup by nfc_tag_id column. */
  findByNfcTagId(tagId: string): Promise<SpoolView | null>;
  createLocal(data: CreateSpoolInput): Promise<Spool>;
  upsertFromRemote(data: UpsertSpoolFromRemoteInput): Promise<Spool>;
  /** Apply a partial local edit. Marks record dirty and bumps localVersion. */
  updateLocal(localId: string, patch: UpdateSpoolPatch): Promise<Spool | null>;
  setFavorite(localId: string, isFavorite: boolean): Promise<void>;
  markSynced(localId: string): Promise<void>;
  deleteByLocalId(localId: string): Promise<boolean>;
  deleteAll(): Promise<void>;
}

// ─── Filament Repository ──────────────────────────────────────────────────────

export interface UpdateFilamentPatch {
  name?: string;
  material?: string;
  /** Single UI field. FilamentUseCase runs ColorNormalizer and populates the three color fields below. */
  colorInput?: string;
  /** Set by FilamentUseCase after normalization — raw user input. */
  colorNameRaw?: string;
  /** Set by FilamentUseCase after normalization — canonical English color name. */
  colorNameNormalized?: string;
  /** Set by FilamentUseCase after normalization — #RRGGBB. */
  colorHexNormalized?: string;
  /** Remote-sourced hex — written by sync, not by user edits. */
  colorHex?: string;
  manufacturerLocalId?: string;
  weight?: number;
  spoolWeight?: number;
  comment?: string;
  paidPrice?: number;
  shop?: string;
  spec?: Partial<FilamentSpec>;
}

export type { FilamentSpec };

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

export interface BatchUpsertFilamentInput extends UpsertFilamentFromRemoteInput {
  /** Present for existing records (UPDATE path); absent for new records (INSERT path). */
  localId?: string;
}

export interface IFilamentRepository {
  getAll(): Promise<Filament[]>;
  getByLocalId(localId: string): Promise<Filament | null>;
  getByRemoteId(remoteId: number): Promise<Filament | null>;
  /** Batch fetch: Map<remoteId, {localId, syncState}>. One query for all ids. */
  getMapByRemoteIds(remoteIds: number[]): Promise<Map<number, { localId: string; syncState: string }>>;
  createLocal(data: CreateFilamentInput): Promise<Filament>;
  /** Apply a partial local edit. Marks record dirty. paidPrice and shop are local-only. */
  updateLocal(localId: string, patch: UpdateFilamentPatch): Promise<Filament | null>;
  upsertFromRemote(data: UpsertFilamentFromRemoteInput): Promise<Filament>;
  /** Batch upsert: items with localId → UPDATE; items without → INSERT. One round-trip. */
  upsertManyFromRemote(items: BatchUpsertFilamentInput[]): Promise<void>;
  deleteByLocalId(localId: string): Promise<boolean>;
  deleteAll(): Promise<void>;
}

// ─── Manufacturer Repository ──────────────────────────────────────────────────

export interface UpdateManufacturerPatch {
  name?: string;
  website?: string;
  comment?: string;
}

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

export interface BatchUpsertManufacturerInput extends UpsertManufacturerFromRemoteInput {
  /** Present for existing records (UPDATE path); absent for new records (INSERT path). */
  localId?: string;
}

export interface IManufacturerRepository {
  getAll(): Promise<Manufacturer[]>;
  getByLocalId(localId: string): Promise<Manufacturer | null>;
  getByRemoteId(remoteId: number): Promise<Manufacturer | null>;
  /** Batch fetch: Map<remoteId, {localId, syncState}>. One query for all ids. */
  getMapByRemoteIds(remoteIds: number[]): Promise<Map<number, { localId: string; syncState: string }>>;
  createLocal(data: CreateManufacturerInput): Promise<Manufacturer>;
  /** Apply a partial local edit. Marks record dirty. */
  updateLocal(localId: string, patch: UpdateManufacturerPatch): Promise<Manufacturer | null>;
  upsertFromRemote(data: UpsertManufacturerFromRemoteInput): Promise<Manufacturer>;
  /** Batch upsert: items with localId → UPDATE; items without → INSERT. */
  upsertManyFromRemote(items: BatchUpsertManufacturerInput[]): Promise<void>;
  deleteByLocalId(localId: string): Promise<boolean>;
  deleteAll(): Promise<void>;
}

// ─── Sync Meta Repository ─────────────────────────────────────────────────────

export type { SyncEntityType } from "@/src/core/domain/sync";

export interface ISyncMetaRepository {
  get(entityType: import("@/src/core/domain/sync").SyncEntityType): Promise<{
    lastPullAt?: number;
    lastPushAt?: number;
    serverUrl: string;
  } | null>;
  upsert(
    entityType: import("@/src/core/domain/sync").SyncEntityType,
    field: "lastPullAt" | "lastPushAt",
    serverUrl: string
  ): Promise<void>;
}

// ─── Usage Event Repository ───────────────────────────────────────────────────

export interface IUsageEventRepository {
  /** Append-only. Never modifies existing events. */
  append(event: UsageEvent): Promise<void>;
  /** Batch append. Never modifies existing events. */
  appendMany(events: UsageEvent[]): Promise<void>;
  /** All events for a spool, ordered by occurredAt ascending. */
  listBySpool(spoolLocalId: string): Promise<UsageEvent[]>;
  /** Events for a spool since a given timestamp (inclusive), ordered ascending. */
  listBySpoolSince(spoolLocalId: string, sinceMs: number): Promise<UsageEvent[]>;
}

// ─── Spool Stats Repository (Projection) ─────────────────────────────────────

export interface ISpoolStatsRepository {
  /**
   * Returns the projected remaining weight for a spool.
   * Returns undefined if no projection has been computed yet.
   */
  getRemainingWeight(spoolLocalId: string): Promise<number | undefined>;
  /**
   * Create or update the remaining weight projection for a spool.
   * updatedAt is the unix ms timestamp when this value was set.
   */
  upsertRemainingWeight(
    spoolLocalId: string,
    remainingWeight: number,
    updatedAt: number
  ): Promise<void>;
  /**
   * Batch upsert remaining weights. Efficient for sync operations.
   */
  upsertManyRemainingWeights(
    items: Array<{ spoolLocalId: string; remainingWeight: number; updatedAt: number }>
  ): Promise<void>;
  /**
   * Bulk-load remaining weights for a set of spoolLocalIds.
   * Returns a Map from localId to remainingWeight.
   */
  getBatchRemainingWeights(
    spoolLocalIds: string[]
  ): Promise<Map<string, number>>;
}

// ─── External Filament System Port — backend-neutral DTOs ────────────────────
//
// All field names are camelCase and carry no remote-specific naming.
// Concrete adapters (FilaBaseAdapter, future second backend adapters, …) are
// responsible for translating between their native API shape and these types.

export interface RemoteManufacturerDTO {
  id: number;
  name: string;
  comment?: string;
}

export interface RemoteFilamentDTO {
  id: number;
  name: string;
  material: string;
  colorHex?: string;
  manufacturer?: RemoteManufacturerDTO;
  weight?: number;
  spoolWeight?: number;
  comment?: string;
}

export interface RemoteSpoolDTO {
  id: number;
  filament: RemoteFilamentDTO;
  remainingWeight?: number;
  initialWeight?: number;
  spoolWeight?: number;
  usedWeight?: number;
  comment?: string;
  archived?: boolean;
  lotNumber?: string;
  lastUsed?: string;
  firstUsed?: string;
  registeredAt?: string;
}

export interface SpoolPatchDTO {
  remainingWeight?: number;
}

export interface IExternalFilamentSystemPort {
  healthCheck(baseUrl: string): Promise<{ status: string }>;
  getManufacturers(baseUrl: string): Promise<RemoteManufacturerDTO[]>;
  getFilaments(baseUrl: string): Promise<RemoteFilamentDTO[]>;
  getSpools(baseUrl: string): Promise<RemoteSpoolDTO[]>;
  patchSpool(baseUrl: string, remoteId: number, patch: SpoolPatchDTO): Promise<void>;
}

/** @deprecated Use RemoteManufacturerDTO */
export type RemoteVendorDTO = RemoteManufacturerDTO;

// ─── Sync Result ──────────────────────────────────────────────────────────────

export interface SyncResult {
  pulled: number;
  pushed: number;
  conflicts: number;
  errors: string[];
}
