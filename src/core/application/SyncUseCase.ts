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
 */
import * as SyncService from "@/src/data/sync/SyncService";
import { updateSyncMeta } from "@/src/data/sync/SyncService";
import type { SpoolView } from "@/src/domain/models";
import type { SyncResult } from "@/src/core/ports/index";
import { ManufacturerRepository } from "@/src/data/repositories/ManufacturerRepository";
import { FilamentRepository } from "@/src/data/repositories/FilamentRepository";
import { SpoolRepository } from "@/src/data/repositories/SpoolRepository";
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
 * Only checks fields that Spoolman owns (never isFavorite, displayName, etc.)
 */
function isSpoolRemoteIdentical(
  local: import("@/src/domain/models").Spool,
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
 */
async function pullWithConflictPolicy(baseUrl: string): Promise<SyncResult> {
  const result: SyncResult = { pulled: 0, pushed: 0, conflicts: 0, errors: [] };
  const resolver = defaultConflictResolver;
  const now = Date.now();

  log(`pull() started — server: ${baseUrl}`);

  try {
    // ── 1. Manufacturers ──────────────────────────────────────────────────────
    const remoteVendors = await SpoolmanClient.getVendors(baseUrl);

    for (const vendor of remoteVendors) {
      const remoteSnapshot: Record<string, unknown> = {
        id: vendor.id,
        name: vendor.name,
        comment: vendor.comment,
      };

      const record = await ManufacturerRepository.getRecordByRemoteId(vendor.id);

      if (!record) {
        await ManufacturerRepository.upsertFromRemote({
          remoteId: vendor.id,
          name: vendor.name,
          comment: vendor.comment,
        });
      } else {
        const resolution = resolver.resolve(record.syncState, 0, remoteSnapshot);
        if (resolution === "accept_remote") {
          await ManufacturerRepository.upsertFromRemote({
            remoteId: vendor.id,
            name: vendor.name,
            comment: vendor.comment,
          });
        } else {
          // flag_conflict — preserve local, store snapshot
          await ConflictSnapshotRepository.upsertOpen(
            "manufacturer",
            record.localId,
            JSON.stringify(remoteSnapshot),
            now
          );
          await ManufacturerRepository.setSyncState(record.localId, "conflict");
          result.conflicts++;
          log(`  CONFLICT manufacturer localId=${record.localId}`);
        }
      }
    }

    await updateSyncMeta("manufacturer", "lastPullAt", baseUrl);
    log(`  manufacturers: ${remoteVendors.length} processed`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`  manufacturers error: ${msg}`);
    result.errors.push(`manufacturers: ${msg}`);
    // Continue with filaments and spools even if manufacturers fail
  }

  try {
    // ── 2. Filaments ──────────────────────────────────────────────────────────
    const remoteFilaments = await SpoolmanClient.getFilaments(baseUrl);

    for (const rf of remoteFilaments) {
      let manufacturerLocalId: string | undefined;
      if (rf.vendor) {
        const mfr = await ManufacturerRepository.getByRemoteId(rf.vendor.id);
        manufacturerLocalId = mfr?.localId;
      }

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

      const record = await FilamentRepository.getRecordByRemoteId(rf.id);

      if (!record) {
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
      } else {
        const resolution = resolver.resolve(record.syncState, 0, remoteSnapshot);
        if (resolution === "accept_remote") {
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
        } else {
          await ConflictSnapshotRepository.upsertOpen(
            "filament",
            record.localId,
            JSON.stringify(remoteSnapshot),
            now
          );
          await FilamentRepository.setSyncState(record.localId, "conflict");
          result.conflicts++;
          log(`  CONFLICT filament localId=${record.localId}`);
        }
      }
    }

    await updateSyncMeta("filament", "lastPullAt", baseUrl);
    log(`  filaments: ${remoteFilaments.length} processed`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`  filaments error: ${msg}`);
    result.errors.push(`filaments: ${msg}`);
  }

  try {
    // ── 3. Spools ─────────────────────────────────────────────────────────────
    const remoteSpools = await SpoolmanClient.getSpools(baseUrl);

    for (const rs of remoteSpools) {
      // Resolve filamentLocalId from the embedded filament's remoteId
      let filamentLocalId: string | undefined;
      if (rs.filament) {
        const localFilament = await FilamentRepository.getByRemoteId(rs.filament.id);
        filamentLocalId = localFilament?.localId;
      }

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

      const record = await SpoolRepository.getRecordByRemoteId(rs.id);

      if (!record) {
        // New entity — no local record, safe to insert
        const inserted = await SpoolRepository.insertSpoolFromRemote(remoteData);

        // Phase 4: seed spool_stats with remote remaining weight (audit trail: sync event)
        if (remoteData.remainingWeight !== undefined) {
          await SpoolStatsRepository.upsertRemainingWeight(
            inserted.localId,
            remoteData.remainingWeight,
            now
          );
          await UsageEventRepository.append({
            id: generateId(),
            spoolLocalId: inserted.localId,
            grams: Math.round(remoteData.remainingWeight),
            type: "adjustment",
            occurredAt: now,
            source: "sync",
            note: `Initial sync from Spoolman (remoteId=${rs.id})`,
          });
        }

        result.pulled++;
        log(`  INSERT spool remoteId=${rs.id}`);
        continue;
      }

      // Existing entity — apply conflict policy
      const localSpool = await SpoolRepository.getByLocalId(record.localId);

      // If remote is identical to local, no update needed regardless of sync state
      if (localSpool && isSpoolRemoteIdentical(localSpool, remoteData)) {
        log(`  SKIP spool remoteId=${rs.id} — remote identical to local`);
        result.pulled++;
        continue;
      }

      const remoteSnapshot: Record<string, unknown> = {
        ...remoteData,
        capturedAt: now,
      };

      const resolution = resolver.resolve(
        record.syncState,
        record.localVersion,
        remoteSnapshot
      );

      if (resolution === "accept_remote") {
        await SpoolRepository.applyRemoteSpoolUpdate(record.localId, remoteData);

        // Phase 4: update spool_stats with remote remaining weight + add audit event
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
        // flag_conflict — preserve local data, store snapshot for Application Layer decision
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

    await updateSyncMeta("spool", "lastPullAt", baseUrl);
    log(`  spools: ${remoteSpools.length} processed, ${result.conflicts} conflicts`);
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
