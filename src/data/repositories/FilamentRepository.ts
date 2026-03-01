import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { filaments, InsertFilament } from "../db/schema";
import type { Filament } from "../../domain/models";

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
 * Never exposed through the public API — the public API returns Filament (no sync).
 */
type FilamentRecord = Filament & { syncState: string };

function toFilamentRecord(row: typeof filaments.$inferSelect): FilamentRecord {
  return {
    localId: row.localId,
    remoteId: row.remoteId ?? undefined,
    name: row.name,
    material: row.material,
    colorName: row.colorName ?? undefined,
    colorHex: row.colorHex ?? undefined,
    manufacturerLocalId: row.manufacturerLocalId ?? undefined,
    weight: row.weight ?? undefined,
    spoolWeight: row.spoolWeight ?? undefined,
    printTempMin: row.printTempMin ?? undefined,
    printTempMax: row.printTempMax ?? undefined,
    density: row.density ?? undefined,
    comment: row.comment ?? undefined,
    paidPrice: row.paidPrice ?? undefined,
    shop: row.shop ?? undefined,
    lastModifiedAt: row.lastModifiedAt,
    syncState: row.syncState,
  };
}

/** Maps a DB row to the clean domain Filament (no sync fields). */
function toFilament(row: typeof filaments.$inferSelect): Filament {
  return {
    localId: row.localId,
    remoteId: row.remoteId ?? undefined,
    name: row.name,
    material: row.material,
    colorName: row.colorName ?? undefined,
    colorHex: row.colorHex ?? undefined,
    manufacturerLocalId: row.manufacturerLocalId ?? undefined,
    weight: row.weight ?? undefined,
    spoolWeight: row.spoolWeight ?? undefined,
    printTempMin: row.printTempMin ?? undefined,
    printTempMax: row.printTempMax ?? undefined,
    density: row.density ?? undefined,
    comment: row.comment ?? undefined,
    paidPrice: row.paidPrice ?? undefined,
    shop: row.shop ?? undefined,
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

  /** Returns minimal sync record for a filament found by remoteId (adapter-layer use only). */
  async getRecordByRemoteId(
    remoteId: number
  ): Promise<{ localId: string; syncState: string } | null> {
    const rows = await getDb()
      .select()
      .from(filaments)
      .where(eq(filaments.remoteId, remoteId))
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
          localId: filaments.localId,
          remoteId: filaments.remoteId,
          syncState: filaments.syncState,
        })
        .from(filaments)
        .where(inArray(filaments.remoteId, ch));
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
    material: string;
    colorName?: string;
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
      colorName: data.colorName ?? null,
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
      colorName?: string;
      colorHex?: string;
      manufacturerLocalId?: string;
      weight?: number;
      spoolWeight?: number;
      comment?: string;
      paidPrice?: number;
      shop?: string;
    }
  ): Promise<Filament | null> {
    const rows = await getDb()
      .select()
      .from(filaments)
      .where(eq(filaments.localId, localId))
      .limit(1);
    if (!rows[0]) return null;

    const existing = toFilamentRecord(rows[0]);
    const now = Date.now();
    const payload: Record<string, unknown> = { lastModifiedAt: now };

    if (existing.syncState === "synced") payload.syncState = "dirty";
    if (data.name !== undefined) payload.name = data.name;
    if (data.material !== undefined) payload.material = data.material;
    if (data.colorName !== undefined) payload.colorName = data.colorName || null;
    if (data.colorHex !== undefined) payload.colorHex = data.colorHex || null;
    if (data.manufacturerLocalId !== undefined)
      payload.manufacturerLocalId = data.manufacturerLocalId;
    if (data.weight !== undefined) payload.weight = data.weight;
    if (data.spoolWeight !== undefined) payload.spoolWeight = data.spoolWeight;
    if (data.comment !== undefined) payload.comment = data.comment;
    if (data.paidPrice !== undefined) payload.paidPrice = data.paidPrice;
    if (data.shop !== undefined) payload.shop = data.shop || null;

    await getDb()
      .update(filaments)
      .set(payload)
      .where(eq(filaments.localId, localId));

    return {
      localId: existing.localId,
      remoteId: existing.remoteId,
      name: data.name !== undefined ? data.name : existing.name,
      material: data.material !== undefined ? data.material : existing.material,
      colorName:
        data.colorName !== undefined
          ? data.colorName || undefined
          : existing.colorName,
      colorHex:
        data.colorHex !== undefined
          ? data.colorHex || undefined
          : existing.colorHex,
      manufacturerLocalId:
        data.manufacturerLocalId !== undefined
          ? data.manufacturerLocalId || undefined
          : existing.manufacturerLocalId,
      weight: data.weight !== undefined ? data.weight : existing.weight,
      spoolWeight:
        data.spoolWeight !== undefined ? data.spoolWeight : existing.spoolWeight,
      comment:
        data.comment !== undefined ? data.comment || undefined : existing.comment,
      paidPrice:
        data.paidPrice !== undefined ? data.paidPrice : existing.paidPrice,
      shop:
        data.shop !== undefined ? data.shop || undefined : existing.shop,
      lastModifiedAt: now,
    };
  },

  /** Explicitly set sync state — called by Application Layer during conflict handling. */
  async setSyncState(localId: string, state: string): Promise<void> {
    await getDb()
      .update(filaments)
      .set({ syncState: state })
      .where(eq(filaments.localId, localId));
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
    const existing = await this.getByRemoteId(data.remoteId);

    if (existing) {
      await getDb()
        .update(filaments)
        .set({
          name: data.name,
          material: data.material,
          colorHex: data.colorHex ?? null,
          manufacturerLocalId: data.manufacturerLocalId ?? null,
          weight: data.weight ?? null,
          spoolWeight: data.spoolWeight ?? null,
          comment: data.comment ?? null,
          syncState: "synced",
          lastModifiedAt: now,
        })
        .where(eq(filaments.localId, existing.localId));

      return {
        localId: existing.localId,
        remoteId: data.remoteId,
        name: data.name,
        material: data.material,
        colorHex: data.colorHex ?? undefined,
        manufacturerLocalId: data.manufacturerLocalId ?? undefined,
        weight: data.weight ?? undefined,
        spoolWeight: data.spoolWeight ?? undefined,
        printTempMin: existing.printTempMin,
        printTempMax: existing.printTempMax,
        density: existing.density,
        comment: data.comment ?? undefined,
        lastModifiedAt: now,
      };
    }

    const localId = generateLocalId();
    const insert: InsertFilament = {
      localId,
      remoteId: data.remoteId,
      name: data.name,
      material: data.material,
      colorHex: data.colorHex ?? null,
      manufacturerLocalId: data.manufacturerLocalId ?? null,
      weight: data.weight ?? null,
      spoolWeight: data.spoolWeight ?? null,
      comment: data.comment ?? null,
      syncState: "synced",
      lastModifiedAt: now,
    };
    await getDb().insert(filaments).values(insert);
    return toFilament(insert as typeof filaments.$inferSelect);
  },

  /**
   * Phase 5: batch upsert filaments from remote.
   * Items with localId → UPDATE (existing records).
   * Items without localId → INSERT (new records, batch insert).
   * Replaces N individual upsertFromRemote() calls in SyncUseCase.
   */
  async upsertManyFromRemote(
    items: Array<{
      localId?: string;
      remoteId: number;
      name: string;
      material: string;
      colorHex?: string;
      manufacturerLocalId?: string;
      weight?: number;
      spoolWeight?: number;
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
      material: string;
      colorHex?: string;
      manufacturerLocalId?: string;
      weight?: number;
      spoolWeight?: number;
      comment?: string;
    }>;

    if (toInsert.length > 0) {
      for (const ch of chunk(toInsert, 50)) {
        await getDb()
          .insert(filaments)
          .values(
            ch.map((i) => ({
              localId: generateLocalId(),
              remoteId: i.remoteId,
              name: i.name,
              material: i.material,
              colorHex: i.colorHex ?? null,
              manufacturerLocalId: i.manufacturerLocalId ?? null,
              weight: i.weight ?? null,
              spoolWeight: i.spoolWeight ?? null,
              comment: i.comment ?? null,
              syncState: "synced",
              lastModifiedAt: now,
            }))
          );
      }
    }

    for (const item of toUpdate) {
      await getDb()
        .update(filaments)
        .set({
          name: item.name,
          material: item.material,
          colorHex: item.colorHex ?? null,
          manufacturerLocalId: item.manufacturerLocalId ?? null,
          weight: item.weight ?? null,
          spoolWeight: item.spoolWeight ?? null,
          comment: item.comment ?? null,
          syncState: "synced",
          lastModifiedAt: now,
        })
        .where(eq(filaments.localId, item.localId));
    }
  },

  async deleteAll(): Promise<void> {
    await getDb().delete(filaments);
  },
};
