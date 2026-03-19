/**
 * SyncService
 *
 * Adapter-layer orchestration for push operations.
 * Pull logic has moved to SyncUseCase (Application Layer) in Phase 3.
 *
 * Public API:
 *   push(baseUrl, port)    — push all dirty local records to server, mark clean, close conflicts
 *   pushOne(baseUrl, localId, port) — push a single dirty spool
 *
 * Conflict strategy: See SyncUseCase for pull policy.
 *   Push: local always wins. After push succeeds, close any open conflict (keep_local).
 *
 * Phase 4:
 *   remaining_weight for the PATCH comes from spool_stats (current projection),
 *   falling back to SpoolSyncRecord.remainingWeight for pre-Phase-4 data.
 *
 * Phase 5/6:
 *   FilaBaseClient is no longer imported here. push() and pushOne() receive
 *   IExternalFilamentSystemPort from the caller so the transport is swappable.
 */
import { getDb } from "../db/client";
import { syncMeta } from "../db/schema";
import { eq } from "drizzle-orm";
import { SpoolRepository } from "../repositories/SpoolRepository";
import { SpoolStatsRepository } from "../repositories/SpoolStatsRepository";
import { ConflictSnapshotRepository } from "../repositories/ConflictSnapshotRepository";
import type { SpoolView } from "../../domain/models";
import type { IExternalFilamentSystemPort } from "../../core/ports/index";

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
 * Push all dirty/pending_push spools to the remote system via port.
 * Marks them as synced on success.
 * Closes any open conflict snapshot for successfully pushed spools (keep_local resolution).
 * On failure, leaves them dirty for the next sync cycle.
 *
 * Phase 4: remaining_weight is sourced from spool_stats first, then falls back
 * to SpoolSyncRecord.remainingWeight for backward compatibility with pre-Phase-4 data.
 */
export async function push(
  baseUrl: string,
  port: IExternalFilamentSystemPort
): Promise<SyncResult> {
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
          const payload = { remainingWeight: remainingToSend };
          console.log("[SYNC PUSH] sending", {
            remoteId: spool.remoteId,
            source: statsWeight !== undefined ? "spool_stats" : "spools_legacy",
            payload,
          });

          await port.patchSpool(baseUrl, spool.remoteId, payload);

          console.log("[SYNC PUSH] response", {
            remoteId: spool.remoteId,
            status: 200,
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
 * Push a single spool by its localId.
 * Used for immediate save after weight update.
 *
 * Phase 4: remaining_weight sourced from spool_stats first.
 */
export async function pushOne(
  baseUrl: string,
  localId: string,
  port: IExternalFilamentSystemPort
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

  const payload = { remainingWeight: remainingToSend };
  console.log("[SYNC PUSH] sending", {
    remoteId: record.remoteId,
    source: statsWeight !== undefined ? "spool_stats" : "spools_legacy",
    payload,
  });

  try {
    await port.patchSpool(baseUrl, record.remoteId, payload);

    console.log("[SYNC PUSH] response", {
      remoteId: record.remoteId,
      status: 200,
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
