/**
 * src/core/application/SyncUseCase.ts
 *
 * Phase 1: Application layer wrapper over SyncService.
 * Delegates entirely to the existing service — no logic change.
 * AppContext imports this instead of SyncService directly.
 *
 * Future phases will absorb SyncService logic here and eliminate the service.
 */
import * as SyncService from "@/src/data/sync/SyncService";
import type { SpoolView } from "@/src/domain/models";
import type { SyncResult } from "@/src/core/ports/index";

export const SyncUseCase = {
  /**
   * Full sync: push local changes first, then pull remote.
   */
  async sync(serverUrl: string): Promise<SyncResult> {
    return SyncService.sync(serverUrl);
  },

  /**
   * Pull only: fetch all remote data and merge into local DB.
   */
  async pull(serverUrl: string): Promise<SyncResult> {
    return SyncService.pull(serverUrl);
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
};
