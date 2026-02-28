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
    printTempMin: row.printTempMin ?? undefined,
    printTempMax: row.printTempMax ?? undefined,
    density: row.density ?? undefined,
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

  async createLocal(data: {
    name: string;
    material: string;
    colorHex?: string;
    manufacturerLocalId?: string;
    weight?: number;
    spoolWeight?: number;
    comment?: string;
  }): Promise<Filament> {
    const now = Date.now();
    const localId = generateLocalId();
    const insert: InsertFilament = {
      localId,
      name: data.name,
      material: data.material,
      colorHex: data.colorHex ?? null,
      manufacturerLocalId: data.manufacturerLocalId ?? null,
      weight: data.weight ?? null,
      spoolWeight: data.spoolWeight ?? null,
      comment: data.comment ?? null,
      syncState: "dirty",
      lastModifiedAt: now,
    };
    await getDb().insert(filaments).values(insert);
    return toFilament(insert as typeof filaments.$inferSelect);
  },

  async updateLocal(
    localId: string,
    data: {
      name?: string;
      material?: string;
      colorHex?: string;
      manufacturerLocalId?: string;
      weight?: number;
      spoolWeight?: number;
      comment?: string;
    }
  ): Promise<Filament | null> {
    const existing = await this.getByLocalId(localId);
    if (!existing) return null;

    const now = Date.now();
    const payload: Record<string, unknown> = { lastModifiedAt: now };
    if (existing.syncState === "synced") payload.syncState = "dirty";

    if (data.name !== undefined) payload.name = data.name;
    if (data.material !== undefined) payload.material = data.material;
    if (data.colorHex !== undefined) payload.colorHex = data.colorHex;
    if (data.manufacturerLocalId !== undefined)
      payload.manufacturerLocalId = data.manufacturerLocalId;
    if (data.weight !== undefined) payload.weight = data.weight;
    if (data.spoolWeight !== undefined) payload.spoolWeight = data.spoolWeight;
    if (data.comment !== undefined) payload.comment = data.comment;

    await getDb()
      .update(filaments)
      .set(payload)
      .where(eq(filaments.localId, localId));

    return {
      ...existing,
      ...(data.name !== undefined && { name: data.name }),
      ...(data.material !== undefined && { material: data.material }),
      ...(data.colorHex !== undefined && {
        colorHex: data.colorHex || undefined,
      }),
      ...(data.manufacturerLocalId !== undefined && {
        manufacturerLocalId: data.manufacturerLocalId || undefined,
      }),
      ...(data.weight !== undefined && { weight: data.weight }),
      ...(data.spoolWeight !== undefined && { spoolWeight: data.spoolWeight }),
      ...(data.comment !== undefined && {
        comment: data.comment || undefined,
      }),
      syncState:
        existing.syncState === "synced" ? "dirty" : existing.syncState,
      lastModifiedAt: now,
    };
  },

  async deleteByLocalId(localId: string): Promise<boolean> {
    await getDb()
      .delete(filaments)
      .where(eq(filaments.localId, localId));
    return true;
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
