/**
 * src/core/application/ManufacturerUseCase.ts
 *
 * Phase 5.1A: Application layer for local manufacturer edits.
 * Delegates to ManufacturerRepository via the IManufacturerRepository port.
 * No DB imports — pure use-case logic.
 */
import { ManufacturerRepository } from "@/src/data/repositories/ManufacturerRepository";
import type { Manufacturer } from "@/src/core/domain/manufacturer";
import type { UpdateManufacturerPatch } from "@/src/core/ports";

export const ManufacturerUseCase = {
  /**
   * Apply a partial update to a locally-stored manufacturer.
   * Marks the record dirty so SyncUseCase can push the change.
   * Returns the updated Manufacturer, or null if no record was found.
   */
  async updateManufacturer(
    localId: string,
    patch: UpdateManufacturerPatch
  ): Promise<Manufacturer | null> {
    return ManufacturerRepository.updateLocal(localId, patch);
  },
};
