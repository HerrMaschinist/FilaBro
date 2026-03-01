import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { manufacturers, InsertManufacturer } from "../db/schema";
import type { Manufacturer } from "../../domain/models";

function generateLocalId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
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
    // Query raw row to access syncState (not on domain Manufacturer)
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

  async deleteAll(): Promise<void> {
    await getDb().delete(manufacturers);
  },
};
