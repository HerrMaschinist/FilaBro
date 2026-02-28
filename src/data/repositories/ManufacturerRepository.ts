/**
 * ManufacturerRepository
 *
 * All DB access for Manufacturer entities.
 * Uses getDb() exclusively — no Platform.OS checks, no null guards.
 * On web, getDb() returns a NullProxy → all queries resolve to [].
 */
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

  async upsertFromRemote(data: {
    remoteId: number;
    name: string;
    comment?: string;
  }): Promise<Manufacturer> {
    const now = Date.now();
    const existing = await this.getByRemoteId(data.remoteId);

    if (existing) {
      await getDb()
        .update(manufacturers)
        .set({
          name: data.name,
          comment: data.comment ?? null,
          syncState: "synced",
          lastModifiedAt: now,
        })
        .where(eq(manufacturers.localId, existing.localId));
      return {
        ...existing,
        name: data.name,
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
