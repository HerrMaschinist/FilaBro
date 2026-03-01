/**
 * src/core/application/conflict/ConflictResolver.ts
 *
 * Pure application-layer conflict policy.
 * No infrastructure imports — works with any entity type generically.
 *
 * ConflictResolution values:
 *   keep_local    — local wins, remote discarded. Push to server on next sync.
 *   accept_remote — remote wins, apply immediately. Only valid when local is clean.
 *   flag_conflict — cannot decide automatically. Persist snapshot, block remote apply.
 */

export type ConflictResolution = "keep_local" | "accept_remote" | "flag_conflict";

/**
 * remoteSnapshot is the raw remote DTO as a plain object.
 * The resolver never reads infrastructure-specific fields.
 */
export interface IConflictResolver {
  resolve(
    localSyncState: string,
    localVersion: number,
    remoteSnapshot: Record<string, unknown>
  ): ConflictResolution;
}

/**
 * LocalFirstResolver — the default strategy.
 *
 * Rule: if local has any uncommitted changes (dirty or pending_push),
 * always flag_conflict. Never silently accept remote data.
 * If local is clean (synced), accept_remote is safe.
 *
 * This implements the offline-first invariant:
 *   "Local changes are never implicitly overwritten by remote data."
 */
export class LocalFirstResolver implements IConflictResolver {
  resolve(
    localSyncState: string,
    _localVersion: number,
    _remoteSnapshot: Record<string, unknown>
  ): ConflictResolution {
    if (localSyncState === "dirty" || localSyncState === "pending_push") {
      return "flag_conflict";
    }
    return "accept_remote";
  }
}

export const defaultConflictResolver: IConflictResolver = new LocalFirstResolver();
