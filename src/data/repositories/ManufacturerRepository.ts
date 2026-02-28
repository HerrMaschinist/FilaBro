import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { manufacturers, InsertManufacturer } from "../db/schema";
import type { Manufacturer } from "../../domain/models";

function generateLocalId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function toManufacturer(row: typeof manufacturers.$inferSelect): Manufacturer {
  return {
    localId: row.localId,
    remoteId: row.remoteId ?? undefined,
    name: row.name,
    website: row.website ?? undefined,
    comment: row.comment ?? undefined,
    syncState: row.syncState as Manufacturer["syncState"],
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
    const existing = await this.getByLocalId(localId);
    if (!existing) return null;

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
      ...existing,
      ...(data.name !== undefined && { name: data.name }),
      ...(data.website !== undefined && { website: data.website || undefined }),
      ...(data.comment !== undefined && { comment: data.comment || undefined }),
      syncState: existing.syncState === "synced" ? "dirty" : existing.syncState,
      lastModifiedAt: now,
    };
  },

  async deleteByLocalId(localId: string): Promise<boolean> {
    const result = await getDb()
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
        ...existing,
        name: data.name,
        website: data.website,
        comment: data.comment,
        syncState: "synced",
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
