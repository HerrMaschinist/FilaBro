/**
 * src/core/application/SyncUseCase.ts
 *
 * Phase 3: Application layer that owns all sync orchestration logic.
 *
 * pull() — conflict-aware pull with LocalFirstResolver policy:
 *   - If local entity is clean (synced): accept_remote → applyRemoteUpdate
 *   - If local entity is dirty/pending_push and remote differs: flag_conflict → store snapshot
 *   - If remote is identical to local: no action (no spurious conflicts)
 *   - If entity not found locally: insert as synced
 *
 * push() — delegates to SyncService.push() which closes resolved conflicts on success.
 * sync() — push first (preserve local writes), then pull with conflict policy.
 *
 * Invariant: "Local changes are never implicitly overwritten by remote data."
 *
 * Phase 4 additions:
 *   - When accept_remote for a spool: upsert spool_stats with remote remainingWeight
 *     and append an adjustment UsageEvent with source="sync" for the audit trail.
 *   - When inserting a new remote spool: seed spool_stats with remote remainingWeight.
 *
 * Phase 5 optimizations (batch-first sync):
 *   - Pre-fetch all manufacturer/filament/spool records in bulk before the per-entity loop.
 *   - O(1) map lookups instead of O(N) individual SELECT queries.
 *   - Batch INSERT new spools via insertManyFromRemote().
 *   - Batch upsert new spool_stats via upsertManyRemainingWeights().
 *   - isSpoolRemoteIdentical() now accepts SpoolSyncRecord — avoids second getByLocalId().
 *   - Batch upsert manufacturers and filaments via upsertManyFromRemote().
 *   - Total queries: O(6) for the pull instead of O(5N).
 */
import * as SyncService from "@/src/data/sync/SyncService";
import { updateSyncMeta } from "@/src/data/sync/SyncService";
import type { SpoolView } from "@/src/domain/models";
import type { SyncResult } from "@/src/core/ports/index";
import { ManufacturerRepository } from "@/src/data/repositories/ManufacturerRepository";
import { FilamentRepository } from "@/src/data/repositories/FilamentRepository";
import { SpoolRepository } from "@/src/data/repositories/SpoolRepository";
import type { SpoolSyncRecord } from "@/src/data/repositories/SpoolRepository";
import { SpoolStatsRepository } from "@/src/data/repositories/SpoolStatsRepository";
import { UsageEventRepository } from "@/src/data/repositories/UsageEventRepository";
import { ConflictSnapshotRepository } from "@/src/data/repositories/ConflictSnapshotRepository";
import { defaultConflictResolver } from "./conflict/ConflictResolver";
import * as SpoolmanClient from "@/src/data/api/SpoolmanClient";

function log(msg: string) {
  if (__DEV__) console.log(`[SyncUseCase] ${msg}`);
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

// ─── Remote-to-local field comparison ────────────────────────────────────────

/**
 * Returns true if the remote update carries no meaningful change relative
 * to local stored values. When remote is identical, we skip the update
 * entirely — no conflict flag, no write, no version bump.
 *
 * Phase 5: accepts SpoolSyncRecord instead of Spool — no need for a second
 * getByLocalId() call since SpoolSyncRecord now includes all identity fields.
 *
 * Only checks fields that Spoolman owns (never isFavorite, displayName, etc.)
 */
function isSpoolRemoteIdentical(
  local: SpoolSyncRecord,
  remote: {
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
): boolean {
  return (
    local.filamentLocalId === remote.filamentLocalId &&
    local.remainingWeight === remote.remainingWeight &&
    local.initialWeight === remote.initialWeight &&
    local.spoolWeight === remote.spoolWeight &&
    local.usedWeight === remote.usedWeight &&
    local.comment === remote.comment &&
    local.archived === !!remote.archived &&
    local.lotNr === remote.lotNr &&
    local.lastUsed === remote.lastUsed &&
    local.firstUsed === remote.firstUsed &&
    local.registered === remote.registered
  );
}

// ─── Pull orchestration ───────────────────────────────────────────────────────

/**
 * Full conflict-aware pull from Spoolman.
 * Processes manufacturers → filaments → spools (in dependency order).
 *
 * Phase 5: Uses batch pre-fetch + batch upsert for each entity type.
 * Reduces total DB queries from O(5N) to O(6) for a full sync.
 */
async function pullWithConflictPolicy(baseUrl: string): Promise<SyncResult> {
  const result: SyncResult = { pulled: 0, pushed: 0, conflicts: 0, errors: [] };
  const resolver = defaultConflictResolver;
  const now = Date.now();

  log(`pull() started — server: ${baseUrl}`);

  // ── 1. Manufacturers ──────────────────────────────────────────────────────
  try {
    const remoteVendors = await SpoolmanClient.getVendors(baseUrl);

    // Phase 5: batch fetch all existing by remoteId → O(1) map lookup below
    const vendorRemoteIds = remoteVendors.map((v) => v.id);
    const existingMfrMap = await ManufacturerRepository.getMapByRemoteIds(vendorRemoteIds);

    const toUpsert: Array<{
      localId?: string;
      remoteId: number;
      name: string;
      website?: string;
      comment?: string;
    }> = [];

    for (const vendor of remoteVendors) {
      const remoteSnapshot: Record<string, unknown> = {
        id: vendor.id,
        name: vendor.name,
        comment: vendor.comment,
      };

      const existing = existingMfrMap.get(vendor.id);

      if (!existing) {
        toUpsert.push({ remoteId: vendor.id, name: vendor.name, comment: vendor.comment });
      } else {
        const resolution = resolver.resolve(existing.syncState, 0, remoteSnapshot);
        if (resolution === "accept_remote") {
          toUpsert.push({
            localId: existing.localId,
            remoteId: vendor.id,
            name: vendor.name,
            comment: vendor.comment,
          });
        } else {
          await ConflictSnapshotRepository.upsertOpen(
            "manufacturer",
            existing.localId,
            JSON.stringify(remoteSnapshot),
            now
          );
          await ManufacturerRepository.setSyncState(existing.localId, "conflict");
          result.conflicts++;
          log(`  CONFLICT manufacturer localId=${existing.localId}`);
        }
      }
    }

    // Phase 5: batch upsert — one INSERT for new, N individual UPDATEs for existing
    await ManufacturerRepository.upsertManyFromRemote(toUpsert);
    await updateSyncMeta("manufacturer", "lastPullAt", baseUrl);
    log(`  manufacturers: ${remoteVendors.length} processed (batch)`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`  manufacturers error: ${msg}`);
    result.errors.push(`manufacturers: ${msg}`);
  }

  // ── 2. Filaments ──────────────────────────────────────────────────────────
  try {
    const remoteFilaments = await SpoolmanClient.getFilaments(baseUrl);

    // Phase 5: batch pre-fetch manufacturer localIds for O(1) resolution
    const vendorRemoteIds = [
      ...new Set(
        remoteFilaments
          .filter((f) => f.vendor != null)
          .map((f) => f.vendor!.id)
      ),
    ];
    const mfrRemoteIdMap = await ManufacturerRepository.getMapByRemoteIds(vendorRemoteIds);

    // Phase 5: batch pre-fetch filament records
    const filamentRemoteIds = remoteFilaments.map((f) => f.id);
    const existingFilMap = await FilamentRepository.getMapByRemoteIds(filamentRemoteIds);

    const toUpsert: Array<{
      localId?: string;
      remoteId: number;
      name: string;
      material: string;
      colorHex?: string;
      manufacturerLocalId?: string;
      weight?: number;
      spoolWeight?: number;
      comment?: string;
    }> = [];

    for (const rf of remoteFilaments) {
      const manufacturerLocalId = rf.vendor
        ? mfrRemoteIdMap.get(rf.vendor.id)?.localId
        : undefined;

      const remoteSnapshot: Record<string, unknown> = {
        id: rf.id,
        name: rf.name,
        material: rf.material,
        colorHex: rf.color_hex,
        manufacturerLocalId,
        weight: rf.weight,
        spoolWeight: rf.spool_weight,
        comment: rf.comment,
      };

      const existing = existingFilMap.get(rf.id);

      if (!existing) {
        toUpsert.push({
          remoteId: rf.id,
          name: rf.name,
          material: rf.material,
          colorHex: rf.color_hex,
          manufacturerLocalId,
          weight: rf.weight,
          spoolWeight: rf.spool_weight,
          comment: rf.comment,
        });
      } else {
        const resolution = resolver.resolve(existing.syncState, 0, remoteSnapshot);
        if (resolution === "accept_remote") {
          toUpsert.push({
            localId: existing.localId,
            remoteId: rf.id,
            name: rf.name,
            material: rf.material,
            colorHex: rf.color_hex,
            manufacturerLocalId,
            weight: rf.weight,
            spoolWeight: rf.spool_weight,
            comment: rf.comment,
          });
        } else {
          await ConflictSnapshotRepository.upsertOpen(
            "filament",
            existing.localId,
            JSON.stringify(remoteSnapshot),
            now
          );
          await FilamentRepository.setSyncState(existing.localId, "conflict");
          result.conflicts++;
          log(`  CONFLICT filament localId=${existing.localId}`);
        }
      }
    }

    // Phase 5: batch upsert filaments
    await FilamentRepository.upsertManyFromRemote(toUpsert);
    await updateSyncMeta("filament", "lastPullAt", baseUrl);
    log(`  filaments: ${remoteFilaments.length} processed (batch)`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`  filaments error: ${msg}`);
    result.errors.push(`filaments: ${msg}`);
  }

  // ── 3. Spools ─────────────────────────────────────────────────────────────
  try {
    const remoteSpools = await SpoolmanClient.getSpools(baseUrl);

    // Phase 5: batch pre-fetch filament localIds for O(1) resolution
    const allFilamentRemoteIds = [
      ...new Set(
        remoteSpools
          .filter((s) => s.filament != null)
          .map((s) => s.filament!.id)
      ),
    ];
    const filRemoteIdMap = await FilamentRepository.getMapByRemoteIds(allFilamentRemoteIds);

    // Phase 5: batch pre-fetch all existing spool sync records
    const spoolRemoteIds = remoteSpools.map((s) => s.id);
    const existingSpoolMap = await SpoolRepository.getMapByRemoteIds(spoolRemoteIds);

    // Partition into new (batch insert) and existing (per-entity conflict check)
    const newSpoolItems: Array<{
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
    }> = [];

    for (const rs of remoteSpools) {
      const filamentLocalId = rs.filament
        ? filRemoteIdMap.get(rs.filament.id)?.localId
        : undefined;

      const remoteData = {
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
      };

      const record = existingSpoolMap.get(rs.id);

      if (!record) {
        newSpoolItems.push(remoteData);
        continue;
      }

      // Phase 5: isSpoolRemoteIdentical now uses SpoolSyncRecord — no extra getByLocalId()
      if (isSpoolRemoteIdentical(record, remoteData)) {
        log(`  SKIP spool remoteId=${rs.id} — remote identical to local`);
        result.pulled++;
        continue;
      }

      const remoteSnapshot: Record<string, unknown> = { ...remoteData, capturedAt: now };
      const resolution = resolver.resolve(
        record.syncState,
        record.localVersion,
        remoteSnapshot
      );

      if (resolution === "accept_remote") {
        await SpoolRepository.applyRemoteSpoolUpdate(record.localId, remoteData);

        if (remoteData.remainingWeight !== undefined) {
          await SpoolStatsRepository.upsertRemainingWeight(
            record.localId,
            remoteData.remainingWeight,
            now
          );
          await UsageEventRepository.append({
            id: generateId(),
            spoolLocalId: record.localId,
            grams: Math.round(remoteData.remainingWeight),
            type: "adjustment",
            occurredAt: now,
            source: "sync",
            note: `Sync from Spoolman (remoteId=${rs.id}, remaining=${remoteData.remainingWeight}g)`,
          });
        }

        result.pulled++;
        log(`  ACCEPT spool remoteId=${rs.id}`);
      } else {
        await ConflictSnapshotRepository.upsertOpen(
          "spool",
          record.localId,
          JSON.stringify(remoteSnapshot),
          now
        );
        await SpoolRepository.setSyncState(record.localId, "conflict");
        result.conflicts++;
        log(`  CONFLICT spool remoteId=${rs.id} localId=${record.localId}`);
      }
    }

    // Phase 5: batch insert all new spools in one round-trip
    if (newSpoolItems.length > 0) {
      const inserted = await SpoolRepository.insertManyFromRemote(newSpoolItems);

      // Phase 5: batch seed spool_stats for all new spools
      const statsItems = inserted
        .filter((i) => i.remainingWeight !== undefined)
        .map((i) => ({
          spoolLocalId: i.localId,
          remainingWeight: i.remainingWeight!,
          updatedAt: now,
        }));

      if (statsItems.length > 0) {
        await SpoolStatsRepository.upsertManyRemainingWeights(statsItems);
      }

      // Append initial sync usage events (audit trail)
      for (const ins of inserted) {
        if (ins.remainingWeight !== undefined) {
          await UsageEventRepository.append({
            id: generateId(),
            spoolLocalId: ins.localId,
            grams: Math.round(ins.remainingWeight),
            type: "adjustment",
            occurredAt: now,
            source: "sync",
            note: `Initial sync from Spoolman (remoteId=${ins.remoteId})`,
          });
        }
      }

      result.pulled += inserted.length;
      log(`  INSERT ${inserted.length} new spools (batch)`);
    }

    await updateSyncMeta("spool", "lastPullAt", baseUrl);
    log(`  spools: ${remoteSpools.length} processed (batch), ${result.conflicts} conflicts`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`  spools error: ${msg}`);
    result.errors.push(`spools: ${msg}`);
  }

  log(`pull() done — pulled ${result.pulled}, conflicts ${result.conflicts}`);
  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const SyncUseCase = {
  /**
   * Full sync: push local changes first, then pull with conflict policy.
   */
  async sync(serverUrl: string): Promise<SyncResult> {
    const pushResult = await SyncService.push(serverUrl);
    const pullResult = await pullWithConflictPolicy(serverUrl);
    return {
      pulled: pullResult.pulled,
      pushed: pushResult.pushed,
      conflicts: pushResult.conflicts + pullResult.conflicts,
      errors: [...pushResult.errors, ...pullResult.errors],
    };
  },

  /**
   * Conflict-aware pull. Local changes are never overwritten.
   */
  async pull(serverUrl: string): Promise<SyncResult> {
    return pullWithConflictPolicy(serverUrl);
  },

  /**
   * Push only: send all dirty local records to the server.
   */
  async push(serverUrl: string): Promise<SyncResult> {
    return SyncService.push(serverUrl);
  },

  /**
   * Push a single spool by localId. Fire-and-forget safe.
   */
  async pushOne(serverUrl: string, spoolLocalId: string): Promise<void> {
    return SyncService.pushOne(serverUrl, spoolLocalId);
  },

  /**
   * Load all spools from local DB as SpoolView. No network call.
   * Phase 5: backed by JOIN query — O(1) DB queries.
   */
  async getLocalSpools(): Promise<SpoolView[]> {
    return SyncService.getLocalSpools();
  },

  /**
   * Read sync metadata (last pull/push timestamps, dirty count).
   */
  async getMeta(): Promise<{
    lastPullAt: number | null;
    lastPushAt: number | null;
    dirtyCount: number;
  }> {
    return SyncService.getSyncMeta();
  },

  /**
   * Count open (unresolved) conflict snapshots across all entity types.
   * Used by AppContext to surface a conflict indicator in the UI.
   */
  async getOpenConflictCount(): Promise<number> {
    return ConflictSnapshotRepository.countOpen();
  },
};
