import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { manufacturers, InsertManufacturer } from "../db/schema";
import type { Manufacturer } from "../../domain/models";

function generateLocalId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/**
 * Internal row type that includes sync fields.
 * Used only within this file for operations that need syncState.
 * Never exposed through the public API.
 */
type ManufacturerRecord = Manufacturer & { syncState: string };

function toManufacturerRecord(
  row: typeof manufacturers.$inferSelect
): ManufacturerRecord {
  return {
    localId: row.localId,
    remoteId: row.remoteId ?? undefined,
    name: row.name,
    website: row.website ?? undefined,
    comment: row.comment ?? undefined,
    lastModifiedAt: row.lastModifiedAt,
    syncState: row.syncState,
  };
}

/** Maps a DB row to the clean domain Manufacturer (no sync fields). */
function toManufacturer(row: typeof manufacturers.$inferSelect): Manufacturer {
  return {
    localId: row.localId,
    remoteId: row.remoteId ?? undefined,
    name: row.name,
    website: row.website ?? undefined,
    comment: row.comment ?? undefined,
    lastModifiedAt: row.lastModifiedAt,
  };
}

export const ManufacturerRepository = {
  async getAll(): Promise<Manufacturer[]> {
    const rows = await getDb().select().from(manufacturers);
    return rows.map(toManufacturer);
  },

  async getByLocalId(localId: string): Promise<Manufacturer | null> {
    const rows = await getDb()
      .select()
      .from(manufacturers)
      .where(eq(manufacturers.localId, localId))
      .limit(1);
    return rows[0] ? toManufacturer(rows[0]) : null;
  },

  async getByRemoteId(remoteId: number): Promise<Manufacturer | null> {
    const rows = await getDb()
      .select()
      .from(manufacturers)
      .where(eq(manufacturers.remoteId, remoteId))
      .limit(1);
    return rows[0] ? toManufacturer(rows[0]) : null;
  },

  /** Returns minimal sync record for a manufacturer found by remoteId (adapter-layer use only). */
  async getRecordByRemoteId(
    remoteId: number
  ): Promise<{ localId: string; syncState: string } | null> {
    const rows = await getDb()
      .select()
      .from(manufacturers)
      .where(eq(manufacturers.remoteId, remoteId))
      .limit(1);
    if (!rows[0]) return null;
    return { localId: rows[0].localId, syncState: rows[0].syncState };
  },

  /**
   * Phase 5: batch pre-fetch sync records by remoteId.
   * Returns Map<remoteId, {localId, syncState}> for O(1) lookup in SyncUseCase.
   */
  async getMapByRemoteIds(
    remoteIds: number[]
  ): Promise<Map<number, { localId: string; syncState: string }>> {
    if (remoteIds.length === 0) return new Map();
    const result = new Map<number, { localId: string; syncState: string }>();
    for (const ch of chunk(remoteIds, 900)) {
      const rows = await getDb()
        .select({
          localId: manufacturers.localId,
          remoteId: manufacturers.remoteId,
          syncState: manufacturers.syncState,
        })
        .from(manufacturers)
        .where(inArray(manufacturers.remoteId, ch));
      for (const row of rows) {
        if (row.remoteId !== null && row.remoteId !== undefined) {
          result.set(row.remoteId, { localId: row.localId, syncState: row.syncState });
        }
      }
    }
    return result;
  },

  async createLocal(data: {
    name: string;
    website?: string;
    comment?: string;
  }): Promise<Manufacturer> {
    const now = Date.now();
    const localId = generateLocalId();
    const insert: InsertManufacturer = {
      localId,
      name: data.name,
      website: data.website ?? null,
      comment: data.comment ?? null,
      syncState: "dirty",
      lastModifiedAt: now,
    };
    await getDb().insert(manufacturers).values(insert);
    return toManufacturer(insert as typeof manufacturers.$inferSelect);
  },

  async updateLocal(
    localId: string,
    data: {
      name?: string;
      website?: string;
      comment?: string;
    }
  ): Promise<Manufacturer | null> {
    const rows = await getDb()
      .select()
      .from(manufacturers)
      .where(eq(manufacturers.localId, localId))
      .limit(1);
    if (!rows[0]) return null;

    const existing = toManufacturerRecord(rows[0]);
    const now = Date.now();
    const payload: Record<string, unknown> = { lastModifiedAt: now };

    if (existing.syncState === "synced") payload.syncState = "dirty";
    if (data.name !== undefined) payload.name = data.name;
    if (data.website !== undefined) payload.website = data.website;
    if (data.comment !== undefined) payload.comment = data.comment;

    await getDb()
      .update(manufacturers)
      .set(payload)
      .where(eq(manufacturers.localId, localId));

    return {
      localId: existing.localId,
      remoteId: existing.remoteId,
      name: data.name !== undefined ? data.name : existing.name,
      website:
        data.website !== undefined ? data.website || undefined : existing.website,
      comment:
        data.comment !== undefined ? data.comment || undefined : existing.comment,
      lastModifiedAt: now,
    };
  },

  /** Explicitly set sync state — called by Application Layer during conflict handling. */
  async setSyncState(localId: string, state: string): Promise<void> {
    await getDb()
      .update(manufacturers)
      .set({ syncState: state })
      .where(eq(manufacturers.localId, localId));
  },

  async deleteByLocalId(localId: string): Promise<boolean> {
    await getDb()
      .delete(manufacturers)
      .where(eq(manufacturers.localId, localId));
    return true;
  },

  async upsertFromRemote(data: {
    remoteId: number;
    name: string;
    website?: string;
    comment?: string;
  }): Promise<Manufacturer> {
    const now = Date.now();
    const existing = await this.getByRemoteId(data.remoteId);

    if (existing) {
      await getDb()
        .update(manufacturers)
        .set({
          name: data.name,
          website: data.website ?? null,
          comment: data.comment ?? null,
          syncState: "synced",
          lastModifiedAt: now,
        })
        .where(eq(manufacturers.localId, existing.localId));

      return {
        localId: existing.localId,
        remoteId: data.remoteId,
        name: data.name,
        website: data.website ?? undefined,
        comment: data.comment ?? undefined,
        lastModifiedAt: now,
      };
    }

    const localId = generateLocalId();
    const insert: InsertManufacturer = {
      localId,
      remoteId: data.remoteId,
      name: data.name,
      website: data.website ?? null,
      comment: data.comment ?? null,
      syncState: "synced",
      lastModifiedAt: now,
    };
    await getDb().insert(manufacturers).values(insert);
    return toManufacturer(insert as typeof manufacturers.$inferSelect);
  },

  /**
   * Phase 5: batch upsert manufacturers from remote.
   * Items with localId → UPDATE (existing records).
   * Items without localId → INSERT (new records, batch insert).
   * Replaces N individual upsertFromRemote() calls in SyncUseCase.
   */
  async upsertManyFromRemote(
    items: Array<{
      localId?: string;
      remoteId: number;
      name: string;
      website?: string;
      comment?: string;
    }>
  ): Promise<void> {
    if (items.length === 0) return;
    const now = Date.now();

    const toInsert = items.filter((i) => !i.localId);
    const toUpdate = items.filter((i) => !!i.localId) as Array<{
      localId: string;
      remoteId: number;
      name: string;
      website?: string;
      comment?: string;
    }>;

    if (toInsert.length > 0) {
      for (const ch of chunk(toInsert, 50)) {
        await getDb()
          .insert(manufacturers)
          .values(
            ch.map((i) => ({
              localId: generateLocalId(),
              remoteId: i.remoteId,
              name: i.name,
              website: i.website ?? null,
              comment: i.comment ?? null,
              syncState: "synced",
              lastModifiedAt: now,
            }))
          );
      }
    }

    for (const item of toUpdate) {
      await getDb()
        .update(manufacturers)
        .set({
          name: item.name,
          website: item.website ?? null,
          comment: item.comment ?? null,
          syncState: "synced",
          lastModifiedAt: now,
        })
        .where(eq(manufacturers.localId, item.localId));
    }
  },

  async deleteAll(): Promise<void> {
    await getDb().delete(manufacturers);
  },
};
