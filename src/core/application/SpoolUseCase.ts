/**
 * src/core/application/SpoolUseCase.ts
 *
 * Phase 1: Application layer wrapper for spool-specific mutations
 * that AppContext invokes directly on SpoolRepository.
 *
 * Delegates entirely to the existing repository — no logic change.
 * AppContext imports this instead of SpoolRepository directly.
 *
 * Future phases will implement proper business rules here
 * (e.g. usage event recording, conflict checks before writes).
 */
import { SpoolRepository } from "@/src/data/repositories/SpoolRepository";
import type { Spool, SpoolView } from "@/src/domain/models";

export const SpoolUseCase = {
  /**
   * Update remaining weight on a spool and mark it as pending_push.
   */
  async updateRemainingWeight(
    localId: string,
    grams: number
  ): Promise<Spool | null> {
    return SpoolRepository.updateRemainingWeight(localId, grams);
  },

  /**
   * Toggle the local-only favorite flag on a spool.
   */
  async setFavorite(localId: string, isFavorite: boolean): Promise<void> {
    return SpoolRepository.setFavorite(localId, isFavorite);
  },

  /**
   * Get a single spool with its hydrated filament/manufacturer.
   */
  async getByLocalIdView(localId: string): Promise<SpoolView | null> {
    return SpoolRepository.getByLocalIdView(localId);
  },
};
