/**
 * SpoolRepository
 *
 * All DB access for Spool entities.
 * Uses getDb() exclusively — no Platform.OS checks, no null guards.
 * On web, getDb() returns a NullProxy → all queries resolve to [].
 *
 * Phase 5 changes:
 *   - getAllView() now uses a single LEFT JOIN query across spools, filaments,
 *     manufacturers, and spool_stats — eliminates the N+1 query pattern.
 *   - getByLocalIdView() likewise uses a single JOIN query.
 *   - getPagedView(offset, limit) — paged JOIN query for 1000+ spool scale.
 *   - countSpools() — COUNT(*) for pagination UI.
 *   - findByQrCode() / findByNfcTagId() — indexed single-row lookups.
 *   - insertManyFromRemote() — batch insert for sync pull optimisation.
 *   - getMapByRemoteIds() — batch SELECT → Map for O(1) lookup in SyncUseCase.
 *   - SpoolSyncRecord extended with identity-check fields so SyncUseCase no
 *     longer needs a second getByLocalId() call per spool.
 */
import { eq, inArray, desc, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { spools, filaments, manufacturers, spoolStats, InsertSpool } from "../db/schema";
import type { Spool, SpoolView } from "../../domain/models";
import type { Filament } from "../../domain/models";
import type { Manufacturer } from "../../domain/models";

function generateLocalId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

/** Chunk an array into sub-arrays of at most `size` elements. */
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/**
 * Adapter-layer type that includes sync metadata + all fields needed for
 * remote identity comparison. Only returned by getRecordByLocalId(),
 * getMapByRemoteIds(), and related adapter-layer methods.
 * Never passed to the UI or use-case layer as a Spool.
 */
export interface SpoolSyncRecord {
  localId: string;
  remoteId?: number;
  /** Legacy: remaining_weight from spools table — used for remote identity comparison only. */
  remainingWeight?: number;
  syncState: string;
  dirtyFields: string[];
  localVersion: number;
  remoteVersion?: number;
  /** All fields below are included for isSpoolRemoteIdentical — avoids second getByLocalId() call. */
  filamentLocalId?: string;
  initialWeight?: number;
  spoolWeight?: number;
  usedWeight?: number;
  comment?: string;
  archived: boolean;
  lotNr?: string;
  lastUsed?: string;
  firstUsed?: string;
  registered?: string;
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

/** Maps a DB row to SpoolSyncRecord (includes sync metadata + identity fields). */
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
    filamentLocalId: row.filamentLocalId ?? undefined,
    initialWeight: row.initialWeight ?? undefined,
    spoolWeight: row.spoolWeight ?? undefined,
    usedWeight: row.usedWeight ?? undefined,
    comment: row.comment ?? undefined,
    archived: row.archived === 1,
    lotNr: row.lotNr ?? undefined,
    lastUsed: row.lastUsed ?? undefined,
    firstUsed: row.firstUsed ?? undefined,
    registered: row.registered ?? undefined,
  };
}

// ─── JOIN query helpers ───────────────────────────────────────────────────────

const JOIN_SELECT = {
  s_localId: spools.localId,
  s_remoteId: spools.remoteId,
  s_filamentLocalId: spools.filamentLocalId,
  s_remainingWeight: spools.remainingWeight,
  s_initialWeight: spools.initialWeight,
  s_spoolWeight: spools.spoolWeight,
  s_usedWeight: spools.usedWeight,
  s_comment: spools.comment,
  s_archived: spools.archived,
  s_displayName: spools.displayName,
  s_qrCode: spools.qrCode,
  s_nfcTagId: spools.nfcTagId,
  s_lotNr: spools.lotNr,
  s_lastUsed: spools.lastUsed,
  s_firstUsed: spools.firstUsed,
  s_registered: spools.registered,
  s_isFavorite: spools.isFavorite,
  s_lastModifiedAt: spools.lastModifiedAt,
  f_localId: filaments.localId,
  f_remoteId: filaments.remoteId,
  f_name: filaments.name,
  f_material: filaments.material,
  f_colorNameRaw: filaments.colorNameRaw,
  f_colorNameNormalized: filaments.colorNameNormalized,
  f_colorHexNormalized: filaments.colorHexNormalized,
  f_colorHex: filaments.colorHex,
  f_manufacturerLocalId: filaments.manufacturerLocalId,
  f_weight: filaments.weight,
  f_spoolWeight: filaments.spoolWeight,
  f_printTempMin: filaments.printTempMin,
  f_printTempMax: filaments.printTempMax,
  f_density: filaments.density,
  f_comment: filaments.comment,
  f_paidPrice: filaments.paidPrice,
  f_shop: filaments.shop,
  f_diameterMm: filaments.diameterMm,
  f_printTempCMin: filaments.printTempCMin,
  f_printTempCMax: filaments.printTempCMax,
  f_bedTempCMin: filaments.bedTempCMin,
  f_bedTempCMax: filaments.bedTempCMax,
  f_lastModifiedAt: filaments.lastModifiedAt,
  m_localId: manufacturers.localId,
  m_remoteId: manufacturers.remoteId,
  m_name: manufacturers.name,
  m_website: manufacturers.website,
  m_comment: manufacturers.comment,
  m_lastModifiedAt: manufacturers.lastModifiedAt,
  ss_remainingWeight: spoolStats.remainingWeight,
} as const;

type JoinRow = {
  s_localId: string;
  s_remoteId: number | null;
  s_filamentLocalId: string | null;
  s_remainingWeight: number | null;
  s_initialWeight: number | null;
  s_spoolWeight: number | null;
  s_usedWeight: number | null;
  s_comment: string | null;
  s_archived: number;
  s_displayName: string | null;
  s_qrCode: string | null;
  s_nfcTagId: string | null;
  s_lotNr: string | null;
  s_lastUsed: string | null;
  s_firstUsed: string | null;
  s_registered: string | null;
  s_isFavorite: number;
  s_lastModifiedAt: number;
  f_localId: string | null;
  f_remoteId: number | null;
  f_name: string | null;
  f_material: string | null;
  f_colorNameRaw: string | null;
  f_colorNameNormalized: string | null;
  f_colorHexNormalized: string | null;
  f_colorHex: string | null;
  f_manufacturerLocalId: string | null;
  f_weight: number | null;
  f_spoolWeight: number | null;
  f_printTempMin: number | null;
  f_printTempMax: number | null;
  f_density: number | null;
  f_comment: string | null;
  f_paidPrice: number | null;
  f_shop: string | null;
  f_diameterMm: number | null;
  f_printTempCMin: number | null;
  f_printTempCMax: number | null;
  f_bedTempCMin: number | null;
  f_bedTempCMax: number | null;
  f_lastModifiedAt: number | null;
  m_localId: string | null;
  m_remoteId: number | null;
  m_name: string | null;
  m_website: string | null;
  m_comment: string | null;
  m_lastModifiedAt: number | null;
  ss_remainingWeight: number | null;
};

function buildJoinQuery() {
  return getDb()
    .select(JOIN_SELECT)
    .from(spools)
    .leftJoin(filaments, eq(spools.filamentLocalId, filaments.localId))
    .leftJoin(manufacturers, eq(filaments.manufacturerLocalId, manufacturers.localId))
    .leftJoin(spoolStats, eq(spools.localId, spoolStats.spoolLocalId));
}

function rowToSpoolView(row: JoinRow): SpoolView {
  let manufacturer: Manufacturer | undefined;
  if (row.m_localId) {
    manufacturer = {
      localId: row.m_localId,
      remoteId: row.m_remoteId ?? undefined,
      name: row.m_name!,
      website: row.m_website ?? undefined,
      comment: row.m_comment ?? undefined,
      lastModifiedAt: row.m_lastModifiedAt!,
    };
  }

  let filament: (Filament & { manufacturer?: Manufacturer }) | undefined;
  if (row.f_localId) {
    const fSpec = {
      diameterMm: row.f_diameterMm ?? undefined,
      printTempCMin: row.f_printTempCMin ?? undefined,
      printTempCMax: row.f_printTempCMax ?? undefined,
      bedTempCMin: row.f_bedTempCMin ?? undefined,
      bedTempCMax: row.f_bedTempCMax ?? undefined,
    };
    const hasFSpec = Object.values(fSpec).some((v) => v !== undefined);
    filament = {
      localId: row.f_localId,
      remoteId: row.f_remoteId ?? undefined,
      name: row.f_name!,
      material: row.f_material!,
      colorNameRaw: row.f_colorNameRaw ?? undefined,
      colorNameNormalized: row.f_colorNameNormalized ?? undefined,
      colorHexNormalized: row.f_colorHexNormalized ?? undefined,
      colorHex: row.f_colorHex ?? undefined,
      manufacturerLocalId: row.f_manufacturerLocalId ?? undefined,
      weight: row.f_weight ?? undefined,
      spoolWeight: row.f_spoolWeight ?? undefined,
      printTempMin: row.f_printTempMin ?? undefined,
      printTempMax: row.f_printTempMax ?? undefined,
      density: row.f_density ?? undefined,
      comment: row.f_comment ?? undefined,
      paidPrice: row.f_paidPrice ?? undefined,
      shop: row.f_shop ?? undefined,
      spec: hasFSpec ? fSpec : undefined,
      lastModifiedAt: row.f_lastModifiedAt!,
      manufacturer,
    };
  }

  return {
    localId: row.s_localId,
    remoteId: row.s_remoteId ?? undefined,
    filamentLocalId: row.s_filamentLocalId ?? undefined,
    remainingWeight: row.ss_remainingWeight ?? row.s_remainingWeight ?? undefined,
    initialWeight: row.s_initialWeight ?? undefined,
    spoolWeight: row.s_spoolWeight ?? undefined,
    usedWeight: row.s_usedWeight ?? undefined,
    comment: row.s_comment ?? undefined,
    archived: row.s_archived === 1,
    displayName: row.s_displayName ?? undefined,
    qrCode: row.s_qrCode ?? undefined,
    nfcTagId: row.s_nfcTagId ?? undefined,
    lotNr: row.s_lotNr ?? undefined,
    lastUsed: row.s_lastUsed ?? undefined,
    firstUsed: row.s_firstUsed ?? undefined,
    registered: row.s_registered ?? undefined,
    isFavorite: row.s_isFavorite === 1,
    lastModifiedAt: row.s_lastModifiedAt,
    filament,
  };
}

// ─── Repository ───────────────────────────────────────────────────────────────

export const SpoolRepository = {
  async getAll(): Promise<Spool[]> {
    const rows = await getDb().select().from(spools);
    return rows.map(toSpool);
  },

  /**
   * Returns all spools hydrated with filament/manufacturer data.
   * Phase 5: single LEFT JOIN query — O(1) queries instead of O(N).
   * remainingWeight prefers spool_stats projection over spools.remaining_weight.
   */
  async getAllView(): Promise<SpoolView[]> {
    const rows = await buildJoinQuery().orderBy(desc(spools.lastModifiedAt));
    return rows.map(rowToSpoolView);
  },

  /**
   * Paged version of getAllView.
   * Phase 5: for 1000+ spool scale — load one page at a time.
   * offset = page * pageSize, default order by lastModifiedAt DESC.
   */
  async getPagedView(
    offset: number,
    limit: number,
    includeArchived = false
  ): Promise<SpoolView[]> {
    const rows = includeArchived
      ? await buildJoinQuery()
          .orderBy(desc(spools.lastModifiedAt))
          .limit(limit)
          .offset(offset)
      : await buildJoinQuery()
          .where(eq(spools.archived, 0))
          .orderBy(desc(spools.lastModifiedAt))
          .limit(limit)
          .offset(offset);
    return rows.map(rowToSpoolView);
  },

  /**
   * Count total spools. Used with getPagedView for pagination.
   */
  async countSpools(includeArchived = false): Promise<number> {
    const rows = includeArchived
      ? await getDb().select({ n: sql<number>`count(*)` }).from(spools)
      : await getDb()
          .select({ n: sql<number>`count(*)` })
          .from(spools)
          .where(eq(spools.archived, 0));
    return Number(rows[0]?.n ?? 0);
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

  /**
   * Phase 5: batch pre-fetch sync records by remoteId.
   * Returns Map<remoteId, SpoolSyncRecord> for O(1) lookup in SyncUseCase.
   * Handles SQLite's 999-parameter limit via chunking.
   */
  async getMapByRemoteIds(
    remoteIds: number[]
  ): Promise<Map<number, SpoolSyncRecord>> {
    if (remoteIds.length === 0) return new Map();
    const result = new Map<number, SpoolSyncRecord>();
    for (const ch of chunk(remoteIds, 900)) {
      const rows = await getDb()
        .select()
        .from(spools)
        .where(inArray(spools.remoteId, ch));
      for (const row of rows) {
        if (row.remoteId !== null && row.remoteId !== undefined) {
          result.set(row.remoteId, toSpoolSyncRecord(row));
        }
      }
    }
    return result;
  },

  /**
   * Returns a single spool hydrated with filament/manufacturer data.
   * Phase 5: single JOIN query — no separate lookups.
   */
  async getByLocalIdView(localId: string): Promise<SpoolView | null> {
    const rows = await buildJoinQuery()
      .where(eq(spools.localId, localId))
      .limit(1);
    return rows[0] ? rowToSpoolView(rows[0] as JoinRow) : null;
  },

  /**
   * Phase 5: indexed lookup by qr_code column.
   * Uses idx_spools_qr_code index for O(log n).
   */
  async findByQrCode(qr: string): Promise<SpoolView | null> {
    const rows = await buildJoinQuery()
      .where(eq(spools.qrCode, qr))
      .limit(1);
    return rows[0] ? rowToSpoolView(rows[0] as JoinRow) : null;
  },

  /**
   * Phase 5: indexed lookup by nfc_tag_id column.
   * Uses idx_spools_nfc_tag_id index for O(log n).
   */
  async findByNfcTagId(tagId: string): Promise<SpoolView | null> {
    const rows = await buildJoinQuery()
      .where(eq(spools.nfcTagId, tagId))
      .limit(1);
    return rows[0] ? rowToSpoolView(rows[0] as JoinRow) : null;
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
   * Phase 5: batch insert spools received from remote.
   * Eliminates N individual insertSpoolFromRemote() calls in SyncUseCase.
   * Returns array of {localId, remoteId, remainingWeight} for spool_stats seeding.
   */
  async insertManyFromRemote(
    items: Array<{
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
    }>
  ): Promise<Array<{ localId: string; remoteId: number; remainingWeight?: number }>> {
    if (items.length === 0) return [];
    const now = Date.now();

    const inserts: InsertSpool[] = items.map((data) => ({
      localId: generateLocalId(),
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
    }));

    for (const ch of chunk(inserts, 50)) {
      await getDb().insert(spools).values(ch);
    }

    return inserts.map((i) => ({
      localId: i.localId,
      remoteId: i.remoteId!,
      remainingWeight: i.remainingWeight ?? undefined,
    }));
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
   * Mark a spool as pending_push for weight synchronisation.
   * Does NOT touch spools.remaining_weight — that column is a legacy/init field.
   * The actual remaining weight lives in spool_stats (SpoolStatsRepository).
   */
  async markWeightPendingPush(localId: string, now: number): Promise<void> {
    const rows = await getDb()
      .select()
      .from(spools)
      .where(eq(spools.localId, localId))
      .limit(1);
    if (!rows[0]) return;

    await getDb()
      .update(spools)
      .set({
        syncState: "pending_push",
        dirtyFields: JSON.stringify(["remaining_weight"]),
        localVersion: rows[0].localVersion + 1,
        lastModifiedAt: now,
      })
      .where(eq(spools.localId, localId));
  },

  /**
   * @deprecated Phase 4: use WeightUseCase.adjustRemaining() instead.
   */
  async updateRemainingWeight(
    localId: string,
    remainingWeight: number
  ): Promise<Spool | null> {
    const now = Date.now();
    await this.markWeightPendingPush(localId, now);

    const spool = await this.getByLocalId(localId);
    if (!spool) return null;
    return { ...spool, remainingWeight, lastModifiedAt: now };
  },

  async setFavorite(localId: string, isFavorite: boolean): Promise<void> {
    await getDb()
      .update(spools)
      .set({ isFavorite: isFavorite ? 1 : 0 })
      .where(eq(spools.localId, localId));
  },

  /**
   * Apply a partial update to a locally-created or locally-edited spool.
   * Marks the record dirty and bumps localVersion so SyncUseCase can push it.
   * remainingWeight is NOT part of this patch — use WeightUseCase for that.
   */
  async updateLocal(
    localId: string,
    data: {
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
  ): Promise<Spool | null> {
    const rows = await getDb()
      .select()
      .from(spools)
      .where(eq(spools.localId, localId))
      .limit(1);
    if (!rows[0]) return null;

    const existing = rows[0];
    const now = Date.now();
    const payload: Record<string, unknown> = {
      lastModifiedAt: now,
      localVersion: existing.localVersion + 1,
    };

    if (existing.syncState === "synced" || existing.syncState === "conflict") {
      payload.syncState = "dirty";
    }

    const changedFields: string[] = [];
    if (data.displayName !== undefined) {
      payload.displayName = data.displayName || null;
      changedFields.push("display_name");
    }
    if (data.archived !== undefined) {
      payload.archived = data.archived ? 1 : 0;
      changedFields.push("archived");
    }
    if (data.isFavorite !== undefined) {
      payload.isFavorite = data.isFavorite ? 1 : 0;
    }
    if (data.qrCode !== undefined) {
      payload.qrCode = data.qrCode || null;
      changedFields.push("qr_code");
    }
    if (data.nfcTagId !== undefined) {
      payload.nfcTagId = data.nfcTagId || null;
      changedFields.push("nfc_tag_id");
    }
    if (data.lotNr !== undefined) {
      payload.lotNr = data.lotNr || null;
      changedFields.push("lot_nr");
    }
    if (data.spoolWeight !== undefined) {
      payload.spoolWeight = data.spoolWeight;
      changedFields.push("spool_weight");
    }
    if (data.initialWeight !== undefined) {
      payload.initialWeight = data.initialWeight;
      changedFields.push("initial_weight");
    }
    if (data.comment !== undefined) {
      payload.comment = data.comment || null;
      changedFields.push("comment");
    }

    let existingDirtyFields: string[] = [];
    if (existing.dirtyFields) {
      try {
        existingDirtyFields = JSON.parse(existing.dirtyFields) as string[];
      } catch {
        existingDirtyFields = [];
      }
    }
    const mergedDirtyFields = Array.from(
      new Set([...existingDirtyFields, ...changedFields])
    );
    if (mergedDirtyFields.length > 0) {
      payload.dirtyFields = JSON.stringify(mergedDirtyFields);
    }

    await getDb()
      .update(spools)
      .set(payload)
      .where(eq(spools.localId, localId));

    return toSpool({
      ...existing,
      localVersion: existing.localVersion + 1,
      lastModifiedAt: now,
      displayName: data.displayName !== undefined ? (data.displayName || null) : existing.displayName,
      archived: data.archived !== undefined ? (data.archived ? 1 : 0) : existing.archived,
      isFavorite: data.isFavorite !== undefined ? (data.isFavorite ? 1 : 0) : existing.isFavorite,
      qrCode: data.qrCode !== undefined ? (data.qrCode || null) : existing.qrCode,
      nfcTagId: data.nfcTagId !== undefined ? (data.nfcTagId || null) : existing.nfcTagId,
      lotNr: data.lotNr !== undefined ? (data.lotNr || null) : existing.lotNr,
      spoolWeight: data.spoolWeight !== undefined ? data.spoolWeight : existing.spoolWeight,
      initialWeight: data.initialWeight !== undefined ? data.initialWeight : existing.initialWeight,
      comment: data.comment !== undefined ? (data.comment || null) : existing.comment,
    });
  },

  async markSynced(localId: string): Promise<void> {
    await getDb()
      .update(spools)
      .set({ syncState: "synced", dirtyFields: null })
      .where(eq(spools.localId, localId));
  },

  /**
   * Create a new spool locally.
   * Writes spools.remaining_weight as the initial value (migration/init path).
   * CatalogUseCase seeds spool_stats after this call.
   */
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
