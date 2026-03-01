/**
 * src/core/application/FilamentUseCase.ts
 *
 * Phase 5.1A: Application layer for local filament edits.
 * Delegates to FilamentRepository via the IFilamentRepository port.
 * No DB imports — pure use-case logic.
 */
import { FilamentRepository } from "@/src/data/repositories/FilamentRepository";
import type { Filament } from "@/src/core/domain/filament";
import type { UpdateFilamentPatch } from "@/src/core/ports";

export const FilamentUseCase = {
  /**
   * Apply a partial update to a locally-stored filament.
   * Marks the record dirty so SyncUseCase can push the change.
   * paidPrice and shop are local-only and are never sent to Spoolman.
   * Returns the updated Filament, or null if no record was found.
   */
  async updateFilament(
    localId: string,
    patch: UpdateFilamentPatch
  ): Promise<Filament | null> {
    return FilamentRepository.updateLocal(localId, patch);
  },
};
