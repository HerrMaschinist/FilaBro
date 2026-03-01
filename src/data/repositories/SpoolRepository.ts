/**
 * SpoolRepository
 *
 * All DB access for Spool entities.
 * Uses getDb() exclusively — no Platform.OS checks, no null guards.
 * On web, getDb() returns a NullProxy → all queries resolve to [].
 *
 * Phase 3 changes:
 *   - Removed `upsertFromRemote()` — contained server-wins policy.
 *   - Added `applyRemoteSpoolUpdate()` — pure data write, called by Application Layer.
 *   - Added `insertSpoolFromRemote()` — insert unknown remote entity, no policy.
 *   - Added `setSyncState()` — explicit state control for Application Layer.
 *   - All conflict policy decisions belong in SyncUseCase, not here.
 */
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { spools, InsertSpool } from "../db/schema";
import type { Spool, SpoolView } from "../../domain/models";
import { FilamentRepository } from "./FilamentRepository";
import { ManufacturerRepository } from "./ManufacturerRepository";

function generateLocalId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

/**
 * Adapter-layer type that includes sync metadata.
 * Only returned by getDirty() and getRecordByLocalId().
 * Never passed to the UI or use-case layer as a Spool.
 */
export interface SpoolSyncRecord {
  localId: string;
  remoteId?: number;
  remainingWeight?: number;
  syncState: string;
  dirtyFields: string[];
  localVersion: number;
  remoteVersion?: number;
}

/** Maps a DB row to the clean domain Spool (no sync fields). */
function toSpool(row: typeof spools.$inferSelect): Spool {
  return {
    localId: row.localId,
    remoteId: row.remoteId ?? undefined,
    filamentLocalId: row.filamentLocalId ?? undefined,
    remainingWeight: row.remainingWeight ?? undefined,
    initialWeight: row.initialWeight ?? undefined,
    spoolWeight: row.spoolWeight ?? undefined,
    usedWeight: row.usedWeight ?? undefined,
    comment: row.comment ?? undefined,
    archived: row.archived === 1,
    displayName: row.displayName ?? undefined,
    qrCode: row.qrCode ?? undefined,
    nfcTagId: row.nfcTagId ?? undefined,
    lotNr: row.lotNr ?? undefined,
    lastUsed: row.lastUsed ?? undefined,
    firstUsed: row.firstUsed ?? undefined,
    registered: row.registered ?? undefined,
    isFavorite: row.isFavorite === 1,
    lastModifiedAt: row.lastModifiedAt,
  };
}

/** Maps a DB row to SpoolSyncRecord (includes sync metadata). */
function toSpoolSyncRecord(row: typeof spools.$inferSelect): SpoolSyncRecord {
  let dirtyFields: string[] = [];
  if (row.dirtyFields) {
    try {
      dirtyFields = JSON.parse(row.dirtyFields) as string[];
    } catch {
      dirtyFields = [];
    }
  }
  return {
    localId: row.localId,
    remoteId: row.remoteId ?? undefined,
    remainingWeight: row.remainingWeight ?? undefined,
    syncState: row.syncState,
    dirtyFields,
    localVersion: row.localVersion,
    remoteVersion: row.remoteVersion ?? undefined,
  };
}

export const SpoolRepository = {
  async getAll(): Promise<Spool[]> {
    const rows = await getDb().select().from(spools);
    return rows.map(toSpool);
  },

  async getAllView(): Promise<SpoolView[]> {
    const allSpools = await this.getAll();
    const result: SpoolView[] = [];

    for (const spool of allSpools) {
      const view: SpoolView = { ...spool };
      if (spool.filamentLocalId) {
        const filament = await FilamentRepository.getByLocalId(
          spool.filamentLocalId
        );
        if (filament) {
          let manufacturer = undefined;
          if (filament.manufacturerLocalId) {
            manufacturer =
              (await ManufacturerRepository.getByLocalId(
                filament.manufacturerLocalId
              )) ?? undefined;
          }
          view.filament = { ...filament, manufacturer };
        }
      }
      result.push(view);
    }

    return result;
  },

  async getByLocalId(localId: string): Promise<Spool | null> {
    const rows = await getDb()
      .select()
      .from(spools)
      .where(eq(spools.localId, localId))
      .limit(1);
    return rows[0] ? toSpool(rows[0]) : null;
  },

  /** Returns the sync record for a spool (adapter-layer use only). */
  async getRecordByLocalId(localId: string): Promise<SpoolSyncRecord | null> {
    const rows = await getDb()
      .select()
      .from(spools)
      .where(eq(spools.localId, localId))
      .limit(1);
    return rows[0] ? toSpoolSyncRecord(rows[0]) : null;
  },

  async getByRemoteId(remoteId: number): Promise<Spool | null> {
    const rows = await getDb()
      .select()
      .from(spools)
      .where(eq(spools.remoteId, remoteId))
      .limit(1);
    return rows[0] ? toSpool(rows[0]) : null;
  },

  /** Returns the sync record for a spool found by remoteId (adapter-layer use only). */
  async getRecordByRemoteId(remoteId: number): Promise<SpoolSyncRecord | null> {
    const rows = await getDb()
      .select()
      .from(spools)
      .where(eq(spools.remoteId, remoteId))
      .limit(1);
    return rows[0] ? toSpoolSyncRecord(rows[0]) : null;
  },

  async getByLocalIdView(localId: string): Promise<SpoolView | null> {
    const spool = await this.getByLocalId(localId);
    if (!spool) return null;

    const view: SpoolView = { ...spool };
    if (spool.filamentLocalId) {
      const filament = await FilamentRepository.getByLocalId(
        spool.filamentLocalId
      );
      if (filament) {
        let manufacturer = undefined;
        if (filament.manufacturerLocalId) {
          manufacturer =
            (await ManufacturerRepository.getByLocalId(
              filament.manufacturerLocalId
            )) ?? undefined;
        }
        view.filament = { ...filament, manufacturer };
      }
    }
    return view;
  },

  /**
   * Returns all spools that need to be pushed to the server.
   * Returns SpoolSyncRecord (includes sync metadata) for adapter-layer use.
   */
  async getDirty(): Promise<SpoolSyncRecord[]> {
    const rows = await getDb()
      .select()
      .from(spools)
      .where(inArray(spools.syncState, ["dirty", "pending_push"]));
    return rows.map(toSpoolSyncRecord);
  },

  /**
   * Apply a remote update to an existing local spool.
   * Called by Application Layer ONLY when it has decided to accept_remote.
   * Does NOT check syncState — that decision belongs to the caller.
   */
  async applyRemoteSpoolUpdate(
    localId: string,
    data: {
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
  ): Promise<Spool | null> {
    const now = Date.now();

    const rows = await getDb()
      .select()
      .from(spools)
      .where(eq(spools.localId, localId))
      .limit(1);
    if (!rows[0]) return null;

    const existing = rows[0];

    await getDb()
      .update(spools)
      .set({
        remoteId: data.remoteId,
        filamentLocalId: data.filamentLocalId ?? null,
        remainingWeight: data.remainingWeight ?? null,
        initialWeight: data.initialWeight ?? null,
        spoolWeight: data.spoolWeight ?? null,
        usedWeight: data.usedWeight ?? null,
        comment: data.comment ?? null,
        archived: data.archived ? 1 : 0,
        lotNr: data.lotNr ?? null,
        lastUsed: data.lastUsed ?? null,
        firstUsed: data.firstUsed ?? null,
        registered: data.registered ?? null,
        syncState: "synced",
        dirtyFields: null,
        localVersion: existing.localVersion + 1,
        lastModifiedAt: now,
      })
      .where(eq(spools.localId, localId));

    return {
      localId,
      remoteId: data.remoteId,
      filamentLocalId: data.filamentLocalId ?? undefined,
      remainingWeight: data.remainingWeight ?? undefined,
      initialWeight: data.initialWeight ?? undefined,
      spoolWeight: data.spoolWeight ?? undefined,
      usedWeight: data.usedWeight ?? undefined,
      comment: data.comment ?? undefined,
      archived: !!data.archived,
      displayName: existing.displayName ?? undefined,
      qrCode: existing.qrCode ?? undefined,
      nfcTagId: existing.nfcTagId ?? undefined,
      lotNr: data.lotNr ?? undefined,
      lastUsed: data.lastUsed ?? undefined,
      firstUsed: data.firstUsed ?? undefined,
      registered: data.registered ?? undefined,
      isFavorite: existing.isFavorite === 1,
      lastModifiedAt: now,
    };
  },

  /**
   * Insert a spool received from remote that does not exist locally.
   * Assigns syncState = "synced" since the record is in sync with the server.
   */
  async insertSpoolFromRemote(data: {
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
  }): Promise<Spool> {
    const now = Date.now();
    const localId = generateLocalId();
    const insert: InsertSpool = {
      localId,
      remoteId: data.remoteId,
      filamentLocalId: data.filamentLocalId ?? null,
      remainingWeight: data.remainingWeight ?? null,
      initialWeight: data.initialWeight ?? null,
      spoolWeight: data.spoolWeight ?? null,
      usedWeight: data.usedWeight ?? null,
      comment: data.comment ?? null,
      archived: data.archived ? 1 : 0,
      lotNr: data.lotNr ?? null,
      lastUsed: data.lastUsed ?? null,
      firstUsed: data.firstUsed ?? null,
      registered: data.registered ?? null,
      isFavorite: 0,
      syncState: "synced",
      dirtyFields: null,
      localVersion: 1,
      lastModifiedAt: now,
    };
    await getDb().insert(spools).values(insert);
    return toSpool(insert as typeof spools.$inferSelect);
  },

  /**
   * Explicitly set the sync state of a spool.
   * Called by Application Layer after conflict detection or resolution.
   */
  async setSyncState(
    localId: string,
    state: string,
    dirtyFields?: string[],
    localVersion?: number
  ): Promise<void> {
    const payload: Record<string, unknown> = { syncState: state };
    if (dirtyFields !== undefined) {
      payload.dirtyFields = dirtyFields.length > 0
        ? JSON.stringify(dirtyFields)
        : null;
    }
    if (localVersion !== undefined) {
      payload.localVersion = localVersion;
    }
    await getDb()
      .update(spools)
      .set(payload)
      .where(eq(spools.localId, localId));
  },

  /**
   * Update remaining_weight locally and mark as pending_push.
   * Does NOT call the network — SyncService handles that.
   */
  async updateRemainingWeight(
    localId: string,
    remainingWeight: number
  ): Promise<Spool | null> {
    // Query raw row to access localVersion (not on domain Spool)
    const rows = await getDb()
      .select()
      .from(spools)
      .where(eq(spools.localId, localId))
      .limit(1);
    if (!rows[0]) return null;

    const existing = rows[0];
    const dirtyFields = JSON.stringify(["remaining_weight"]);
    const now = Date.now();

    await getDb()
      .update(spools)
      .set({
        remainingWeight,
        syncState: "pending_push",
        dirtyFields,
        localVersion: existing.localVersion + 1,
        lastModifiedAt: now,
      })
      .where(eq(spools.localId, localId));

    return {
      ...toSpool(existing),
      remainingWeight,
      lastModifiedAt: now,
    };
  },

  async setFavorite(localId: string, isFavorite: boolean): Promise<void> {
    await getDb()
      .update(spools)
      .set({ isFavorite: isFavorite ? 1 : 0 })
      .where(eq(spools.localId, localId));
  },

  async markSynced(localId: string): Promise<void> {
    await getDb()
      .update(spools)
      .set({ syncState: "synced", dirtyFields: null })
      .where(eq(spools.localId, localId));
  },

  async createLocal(data: {
    filamentLocalId: string;
    remainingWeight?: number;
    initialWeight?: number;
    spoolWeight?: number;
    comment?: string;
    displayName?: string;
    lotNr?: string;
    qrCode?: string;
    nfcTagId?: string;
  }): Promise<Spool> {
    const now = Date.now();
    const localId = generateLocalId();
    const insert: InsertSpool = {
      localId,
      filamentLocalId: data.filamentLocalId,
      remainingWeight: data.remainingWeight ?? data.initialWeight ?? null,
      initialWeight: data.initialWeight ?? null,
      spoolWeight: data.spoolWeight ?? null,
      usedWeight: 0,
      comment: data.comment ?? null,
      archived: 0,
      displayName: data.displayName ?? null,
      qrCode: data.qrCode ?? null,
      nfcTagId: data.nfcTagId ?? null,
      lotNr: data.lotNr ?? null,
      firstUsed: null,
      lastUsed: null,
      registered: new Date().toISOString(),
      isFavorite: 0,
      syncState: "dirty",
      dirtyFields: null,
      localVersion: 1,
      lastModifiedAt: now,
    };
    await getDb().insert(spools).values(insert);
    return toSpool(insert as typeof spools.$inferSelect);
  },

  async deleteByLocalId(localId: string): Promise<boolean> {
    await getDb()
      .delete(spools)
      .where(eq(spools.localId, localId));
    return true;
  },

  async deleteAll(): Promise<void> {
    await getDb().delete(spools);
  },
};
