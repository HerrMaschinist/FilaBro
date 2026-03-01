/**
 * SyncService
 *
 * Adapter-layer orchestration for push operations.
 * Pull logic has moved to SyncUseCase (Application Layer) in Phase 3.
 *
 * Public API:
 *   pull(baseUrl)  — DEPRECATED: use SyncUseCase.pull() instead. Kept for reference.
 *   push(baseUrl)  — push all dirty local records to server, mark clean, close conflicts
 *   sync(baseUrl)  — push first, then pull (via SyncUseCase)
 *   pushOne(baseUrl, spoolLocalId) — push a single dirty spool
 *
 * Conflict strategy: See SyncUseCase for pull policy.
 *   Push: local always wins. After push succeeds, close any open conflict (keep_local).
 *
 * Phase 4:
 *   remaining_weight for the PATCH comes from spool_stats (current projection),
 *   falling back to SpoolSyncRecord.remainingWeight for pre-Phase-4 data.
 */
import { getDb } from "../db/client";
import { syncMeta } from "../db/schema";
import { eq } from "drizzle-orm";
import { ManufacturerRepository } from "../repositories/ManufacturerRepository";
import { FilamentRepository } from "../repositories/FilamentRepository";
import { SpoolRepository } from "../repositories/SpoolRepository";
import { SpoolStatsRepository } from "../repositories/SpoolStatsRepository";
import { ConflictSnapshotRepository } from "../repositories/ConflictSnapshotRepository";
import type { SpoolView } from "../../domain/models";
import * as SpoolmanClient from "../api/SpoolmanClient";

function log(msg: string, data?: unknown) {
  if (__DEV__) {
    data !== undefined
      ? console.log(`[SyncService] ${msg}`, data)
      : console.log(`[SyncService] ${msg}`);
  }
}

/**
 * Update sync metadata (last pull/push timestamp per entity type).
 * Exported so SyncUseCase can update meta after its own pull orchestration.
 */
export async function updateSyncMeta(
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
 * @deprecated Use SyncUseCase.pull() which applies the offline-first conflict policy.
 * Kept here for reference until Phase 4 eliminates SyncService entirely.
 */
export async function pull(baseUrl: string): Promise<SyncResult> {
  const result: SyncResult = { pulled: 0, pushed: 0, conflicts: 0, errors: [] };
  log(`pull() [DEPRECATED — use SyncUseCase.pull()] started — server: ${baseUrl}`);

  try {
    const remoteVendors = await SpoolmanClient.getVendors(baseUrl);
    for (const vendor of remoteVendors) {
      await ManufacturerRepository.upsertFromRemote({
        remoteId: vendor.id,
        name: vendor.name,
        comment: vendor.comment,
      });
    }
    await updateSyncMeta("manufacturer", "lastPullAt", baseUrl);

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

    const remoteSpools = await SpoolmanClient.getSpools(baseUrl);
    for (const rs of remoteSpools) {
      let filamentLocalId: string | undefined;
      if (rs.filament) {
        const localFilament = await FilamentRepository.getByRemoteId(rs.filament.id);
        filamentLocalId = localFilament?.localId;
      }
      const record = await SpoolRepository.getRecordByRemoteId(rs.id);
      if (!record) {
        await SpoolRepository.insertSpoolFromRemote({
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
      } else if (record.syncState === "synced") {
        await SpoolRepository.applyRemoteSpoolUpdate(record.localId, {
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
      }
      // dirty/pending_push: skip silently (use SyncUseCase.pull() for conflict handling)
      result.pulled++;
    }
    await updateSyncMeta("spool", "lastPullAt", baseUrl);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`pull() error: ${msg}`);
    result.errors.push(msg);
  }

  return result;
}

/**
 * Push all dirty/pending_push spools to Spoolman.
 * Marks them as synced on success.
 * Closes any open conflict snapshot for successfully pushed spools (keep_local resolution).
 * On failure, leaves them dirty for the next sync cycle.
 *
 * Phase 4: remaining_weight is sourced from spool_stats first, then falls back
 * to SpoolSyncRecord.remainingWeight for backward compatibility with pre-Phase-4 data.
 */
export async function push(baseUrl: string): Promise<SyncResult> {
  const result: SyncResult = { pulled: 0, pushed: 0, conflicts: 0, errors: [] };
  const dirtySpools = await SpoolRepository.getDirty();
  log(`push() — ${dirtySpools.length} dirty spools`);

  for (const spool of dirtySpools) {
    if (!spool.remoteId) {
      console.log("[SYNC PUSH] skip", {
        localId: spool.localId,
        remoteId: null,
        reason: "no_remote_id",
        syncState: spool.syncState,
        dirtyFields: spool.dirtyFields,
      });
      continue;
    }

    const dirty: string[] =
      spool.dirtyFields.length > 0 ? spool.dirtyFields : ["remaining_weight"];

    try {
      if (dirty.includes("remaining_weight")) {
        // Phase 4: prefer spool_stats over legacy spools.remaining_weight
        const statsWeight = await SpoolStatsRepository.getRemainingWeight(spool.localId);
        const remainingToSend = statsWeight ?? spool.remainingWeight;

        if (remainingToSend === undefined) {
          console.log("[SYNC PUSH] skip", {
            localId: spool.localId,
            remoteId: spool.remoteId,
            reason: "remaining_weight_undefined",
            syncState: spool.syncState,
            dirtyFields: dirty,
          });
        } else {
          const payload = { remaining_weight: remainingToSend };
          console.log("[SYNC PUSH] sending", {
            remoteId: spool.remoteId,
            source: statsWeight !== undefined ? "spool_stats" : "spools_legacy",
            payload,
          });

          const patchResp = await SpoolmanClient.patchSpool(
            baseUrl,
            spool.remoteId,
            payload
          );

          console.log("[SYNC PUSH] response", {
            remoteId: spool.remoteId,
            status: 200,
            remaining_weight: patchResp.remaining_weight,
            body: JSON.stringify(patchResp).slice(0, 400),
          });
        }
      } else {
        console.log("[SYNC PUSH] skip", {
          localId: spool.localId,
          remoteId: spool.remoteId,
          reason: "remaining_weight_not_in_dirty_fields",
          syncState: spool.syncState,
          dirtyFields: dirty,
        });
      }

      await SpoolRepository.markSynced(spool.localId);

      // Close any open conflict for this spool — local changes were pushed successfully
      await ConflictSnapshotRepository.resolveByEntity(
        "spool",
        spool.localId,
        "keep_local",
        Date.now()
      );

      result.pushed++;
      log(`  ✓ spool remoteId=${spool.remoteId} pushed`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log("[SYNC PUSH] response", {
        remoteId: spool.remoteId,
        status: "error",
        error: msg,
      });
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
 * Push pending changes first, then pull fresh data via SyncUseCase.
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
 *
 * Phase 4: remaining_weight sourced from spool_stats first.
 */
export async function pushOne(
  baseUrl: string,
  localId: string
): Promise<void> {
  const record = await SpoolRepository.getRecordByLocalId(localId);

  if (!record || !record.remoteId) {
    console.log("[SYNC PUSH] skip", {
      localId,
      remoteId: record?.remoteId ?? null,
      reason: !record ? "record_not_found" : "no_remote_id",
      syncState: record?.syncState,
      dirtyFields: record?.dirtyFields ?? [],
    });
    return;
  }

  if (record.syncState !== "pending_push" && record.syncState !== "dirty") {
    console.log("[SYNC PUSH] skip", {
      localId,
      remoteId: record.remoteId,
      reason: "sync_state_not_dirty",
      syncState: record.syncState,
      dirtyFields: record.dirtyFields,
    });
    return;
  }

  // Phase 4: prefer spool_stats projection over legacy column
  const statsWeight = await SpoolStatsRepository.getRemainingWeight(localId);
  const remainingToSend = statsWeight ?? record.remainingWeight;

  if (remainingToSend === undefined) {
    console.log("[SYNC PUSH] skip", {
      localId,
      remoteId: record.remoteId,
      reason: "remaining_weight_undefined",
      syncState: record.syncState,
      dirtyFields: record.dirtyFields,
    });
    return;
  }

  const payload = { remaining_weight: remainingToSend };
  console.log("[SYNC PUSH] sending", {
    remoteId: record.remoteId,
    source: statsWeight !== undefined ? "spool_stats" : "spools_legacy",
    payload,
  });

  try {
    const patchResp = await SpoolmanClient.patchSpool(
      baseUrl,
      record.remoteId,
      payload
    );

    console.log("[SYNC PUSH] response", {
      remoteId: record.remoteId,
      status: 200,
      remaining_weight: patchResp.remaining_weight,
      body: JSON.stringify(patchResp).slice(0, 400),
    });

    await SpoolRepository.markSynced(record.localId);

    // Close any open conflict — local was pushed successfully
    await ConflictSnapshotRepository.resolveByEntity(
      "spool",
      record.localId,
      "keep_local",
      Date.now()
    );

    log(`  ✓ pushOne done`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log("[SYNC PUSH] response", {
      remoteId: record.remoteId,
      status: "error",
      error: msg,
    });
    log(`  ✗ pushOne failed, will retry on next sync: ${msg}`);
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
