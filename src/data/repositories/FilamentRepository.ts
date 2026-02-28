/**
 * FilamentRepository
 *
 * All DB access for Filament entities.
 * Uses getDb() exclusively — no Platform.OS checks, no null guards.
 * On web, getDb() returns a NullProxy → all queries resolve to [].
 */
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { filaments, InsertFilament } from "../db/schema";
import type { Filament } from "../../domain/models";

function generateLocalId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function toFilament(row: typeof filaments.$inferSelect): Filament {
  return {
    localId: row.localId,
    remoteId: row.remoteId ?? undefined,
    name: row.name,
    material: row.material,
    colorHex: row.colorHex ?? undefined,
    manufacturerLocalId: row.manufacturerLocalId ?? undefined,
    weight: row.weight ?? undefined,
    spoolWeight: row.spoolWeight ?? undefined,
    comment: row.comment ?? undefined,
    syncState: row.syncState as Filament["syncState"],
    lastModifiedAt: row.lastModifiedAt,
  };
}

export const FilamentRepository = {
  async getAll(): Promise<Filament[]> {
    const rows = await getDb().select().from(filaments);
    return rows.map(toFilament);
  },

  async getByLocalId(localId: string): Promise<Filament | null> {
    const rows = await getDb()
      .select()
      .from(filaments)
      .where(eq(filaments.localId, localId))
      .limit(1);
    return rows[0] ? toFilament(rows[0]) : null;
  },

  async getByRemoteId(remoteId: number): Promise<Filament | null> {
    const rows = await getDb()
      .select()
      .from(filaments)
      .where(eq(filaments.remoteId, remoteId))
      .limit(1);
    return rows[0] ? toFilament(rows[0]) : null;
  },

  async upsertFromRemote(data: {
    remoteId: number;
    name: string;
    material: string;
    colorHex?: string;
    manufacturerLocalId?: string;
    weight?: number;
    spoolWeight?: number;
    comment?: string;
  }): Promise<Filament> {
    const now = Date.now();
    const payload = {
      name: data.name,
      material: data.material,
      colorHex: data.colorHex ?? null,
      manufacturerLocalId: data.manufacturerLocalId ?? null,
      weight: data.weight ?? null,
      spoolWeight: data.spoolWeight ?? null,
      comment: data.comment ?? null,
      syncState: "synced" as const,
      lastModifiedAt: now,
    };

    const existing = await this.getByRemoteId(data.remoteId);

    if (existing) {
      await getDb()
        .update(filaments)
        .set(payload)
        .where(eq(filaments.localId, existing.localId));
      return { ...existing, ...payload };
    }

    const localId = generateLocalId();
    const insert: InsertFilament = {
      localId,
      remoteId: data.remoteId,
      ...payload,
    };
    await getDb().insert(filaments).values(insert);
    return toFilament(insert as typeof filaments.$inferSelect);
  },

  async deleteAll(): Promise<void> {
    await getDb().delete(filaments);
  },
};
