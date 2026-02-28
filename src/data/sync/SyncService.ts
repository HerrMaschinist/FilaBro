/**
 * SyncService
 *
 * Orchestrates all data synchronization between the local SQLite DB
 * and the remote Spoolman server.
 *
 * Public API:
 *   pull(baseUrl)  — fetch all remote data, merge into local DB
 *   push(baseUrl)  — push all dirty local records to server, mark clean
 *   sync(baseUrl)  — push first (preserve local changes), then pull
 *   pushOne(baseUrl, spoolLocalId) — push a single dirty spool
 *
 * Conflict strategy: server wins on all synced fields.
 *   isFavorite is always local-only and never overwritten.
 *   See SpoolRepository.upsertFromRemote for full explanation.
 */
import { getDb } from "../db/client";
import { syncMeta } from "../db/schema";
import { eq } from "drizzle-orm";
import { ManufacturerRepository } from "../repositories/ManufacturerRepository";
import { FilamentRepository } from "../repositories/FilamentRepository";
import { SpoolRepository } from "../repositories/SpoolRepository";
import type { SpoolView } from "../../domain/models";
import * as SpoolmanClient from "../api/SpoolmanClient";

function log(msg: string, data?: unknown) {
  if (__DEV__) {
    data !== undefined
      ? console.log(`[SyncService] ${msg}`, data)
      : console.log(`[SyncService] ${msg}`);
  }
}

async function updateSyncMeta(
  entityType: "spool" | "filament" | "manufacturer",
  field: "lastPullAt" | "lastPushAt",
  baseUrl: string
): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const existing = await db
    .select()
    .from(syncMeta)
    .where(eq(syncMeta.entityType, entityType))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(syncMeta).values({
      entityType,
      serverUrl: baseUrl,
      lastPullAt: field === "lastPullAt" ? now : undefined,
      lastPushAt: field === "lastPushAt" ? now : undefined,
    });
  } else {
    await db
      .update(syncMeta)
      .set({
        serverUrl: baseUrl,
        ...(field === "lastPullAt" ? { lastPullAt: now } : { lastPushAt: now }),
      })
      .where(eq(syncMeta.entityType, entityType));
  }
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  conflicts: number;
  errors: string[];
}

/**
 * Pull all data from Spoolman.
 * Upserts manufacturers → filaments → spools (in dependency order).
 */
export async function pull(baseUrl: string): Promise<SyncResult> {
  const result: SyncResult = { pulled: 0, pushed: 0, conflicts: 0, errors: [] };
  log(`pull() started — server: ${baseUrl}`);

  try {
    // 1. Vendors / Manufacturers
    const remoteVendors = await SpoolmanClient.getVendors(baseUrl);
    for (const vendor of remoteVendors) {
      await ManufacturerRepository.upsertFromRemote({
        remoteId: vendor.id,
        name: vendor.name,
        comment: vendor.comment,
      });
    }
    await updateSyncMeta("manufacturer", "lastPullAt", baseUrl);
    log(`  manufacturers: ${remoteVendors.length} upserted`);

    // 2. Filaments
    const remoteFilaments = await SpoolmanClient.getFilaments(baseUrl);
    for (const rf of remoteFilaments) {
      let manufacturerLocalId: string | undefined;
      if (rf.vendor) {
        const mfr = await ManufacturerRepository.getByRemoteId(rf.vendor.id);
        manufacturerLocalId = mfr?.localId;
      }
      await FilamentRepository.upsertFromRemote({
        remoteId: rf.id,
        name: rf.name,
        material: rf.material,
        colorHex: rf.color_hex,
        manufacturerLocalId,
        weight: rf.weight,
        spoolWeight: rf.spool_weight,
        comment: rf.comment,
      });
    }
    await updateSyncMeta("filament", "lastPullAt", baseUrl);
    log(`  filaments: ${remoteFilaments.length} upserted`);

    // 3. Spools (with embedded filament from ?expand[]=filament)
    const remoteSpools = await SpoolmanClient.getSpools(baseUrl);
    for (const rs of remoteSpools) {
      let filamentLocalId: string | undefined;
      if (rs.filament) {
        const localFilament = await FilamentRepository.getByRemoteId(
          rs.filament.id
        );
        filamentLocalId = localFilament?.localId;
      }
      await SpoolRepository.upsertFromRemote({
        remoteId: rs.id,
        filamentLocalId,
        remainingWeight: rs.remaining_weight,
        initialWeight: rs.initial_weight,
        spoolWeight: rs.spool_weight,
        usedWeight: rs.used_weight,
        comment: rs.comment,
        archived: rs.archived,
        lotNr: rs.lot_nr,
        lastUsed: rs.last_used,
        firstUsed: rs.first_used,
        registered: rs.registered,
      });
      result.pulled++;
    }
    await updateSyncMeta("spool", "lastPullAt", baseUrl);
    log(`  spools: ${remoteSpools.length} upserted`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`pull() error: ${msg}`);
    result.errors.push(msg);
  }

  log(`pull() done — pulled ${result.pulled} spools`);
  return result;
}

/**
 * Push all dirty/pending_push spools to Spoolman.
 * Marks them as synced on success.
 * On failure, leaves them dirty for the next sync cycle.
 */
export async function push(baseUrl: string): Promise<SyncResult> {
  const result: SyncResult = { pulled: 0, pushed: 0, conflicts: 0, errors: [] };
  const dirtySpools = await SpoolRepository.getDirty();
  log(`push() — ${dirtySpools.length} dirty spools`);

  for (const spool of dirtySpools) {
    if (!spool.remoteId) {
      log(`  skip spool ${spool.localId} — no remoteId (local-only, not supported yet)`);
      continue;
    }

    const dirty: string[] = spool.dirtyFields
      ? (JSON.parse(spool.dirtyFields) as string[])
      : ["remaining_weight"];

    try {
      if (dirty.includes("remaining_weight") && spool.remainingWeight !== undefined) {
        log(`  PATCH spool remoteId=${spool.remoteId} remaining_weight=${spool.remainingWeight}`);
        await SpoolmanClient.patchSpool(baseUrl, spool.remoteId, {
          remaining_weight: spool.remainingWeight,
        });
      }
      await SpoolRepository.markSynced(spool.localId);
      result.pushed++;
      log(`  ✓ spool remoteId=${spool.remoteId} pushed`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`  ✗ spool remoteId=${spool.remoteId} push failed: ${msg}`);
      result.errors.push(`Spool ${spool.remoteId}: ${msg}`);
    }
  }

  if (result.pushed > 0) {
    await updateSyncMeta("spool", "lastPushAt", baseUrl);
  }

  log(`push() done — pushed ${result.pushed}, errors ${result.errors.length}`);
  return result;
}

/**
 * Push pending changes first, then pull fresh data.
 * This preserves local writes before overwriting with server state.
 */
export async function sync(baseUrl: string): Promise<SyncResult> {
  log(`sync() started`);
  const pushResult = await push(baseUrl);
  const pullResult = await pull(baseUrl);
  return {
    pulled: pullResult.pulled,
    pushed: pushResult.pushed,
    conflicts: pushResult.conflicts + pullResult.conflicts,
    errors: [...pushResult.errors, ...pullResult.errors],
  };
}

/**
 * Push a single spool by its localId.
 * Used for immediate save after weight update.
 */
export async function pushOne(
  baseUrl: string,
  localId: string
): Promise<void> {
  const spool = await SpoolRepository.getByLocalId(localId);
  if (!spool || !spool.remoteId) return;
  if (spool.syncState !== "pending_push" && spool.syncState !== "dirty") return;

  log(`pushOne remoteId=${spool.remoteId} remaining=${spool.remainingWeight}`);

  try {
    await SpoolmanClient.patchSpool(baseUrl, spool.remoteId, {
      remaining_weight: spool.remainingWeight,
    });
    await SpoolRepository.markSynced(spool.localId);
    log(`  ✓ pushOne done`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`  ✗ pushOne failed, will retry on next sync: ${msg}`);
    // Leave as dirty — next sync() will pick it up
  }
}

/**
 * Read sync metadata for all entity types.
 */
export async function getSyncMeta(): Promise<{
  lastPullAt: number | null;
  lastPushAt: number | null;
  dirtyCount: number;
}> {
  const db = getDb();
  const metaRows = await db
    .select()
    .from(syncMeta)
    .where(eq(syncMeta.entityType, "spool"));

  const dirty = await SpoolRepository.getDirty();

  return {
    lastPullAt: metaRows[0]?.lastPullAt ?? null,
    lastPushAt: metaRows[0]?.lastPushAt ?? null,
    dirtyCount: dirty.length,
  };
}

/**
 * Load all spools from local DB as SpoolView (with related filament/manufacturer).
 * Used by UI — no network call.
 */
export async function getLocalSpools(): Promise<SpoolView[]> {
  return SpoolRepository.getAllView();
}
