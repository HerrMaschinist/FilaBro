/**
 * src/core/application/SpoolEditUseCase.ts
 *
 * Phase 5.1A: Application layer for local spool edits.
 * Delegates to SpoolRepository via the ISpoolRepository port.
 * No DB imports — pure use-case logic.
 *
 * Note: remainingWeight is intentionally excluded from the patch.
 * Weight changes must go through WeightUseCase to preserve the
 * append-only usage-event log (Phase 4 invariant).
 */
import { SpoolRepository } from "@/src/data/repositories/SpoolRepository";
import type { Spool } from "@/src/core/domain/spool";
import type { UpdateSpoolPatch } from "@/src/core/ports";

export const SpoolEditUseCase = {
  /**
   * Apply a partial update to a locally-stored spool.
   * Marks the record dirty and bumps localVersion so SyncUseCase can push it.
   * Returns the updated Spool, or null if no record was found.
   */
  async updateSpool(
    localId: string,
    patch: UpdateSpoolPatch
  ): Promise<Spool | null> {
    return SpoolRepository.updateLocal(localId, patch);
  },
};
