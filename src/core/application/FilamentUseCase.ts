/**
 * src/core/application/FilamentUseCase.ts
 *
 * Application layer for local filament edits.
 * Delegates to FilamentRepository via the IFilamentRepository port.
 * No DB imports — pure use-case logic.
 */
import { FilamentRepository } from "@/src/data/repositories/FilamentRepository";
import type { Filament } from "@/src/core/domain/filament";
import type { UpdateFilamentPatch } from "@/src/core/ports";
import { normalizeColor } from "./filament/ColorNormalizer";

export const FilamentUseCase = {
  /**
   * Apply a partial update to a locally-stored filament.
   * Marks the record dirty so SyncUseCase can push the change.
   *
   * When patch.colorInput is provided, ColorNormalizer runs and populates
   * colorNameRaw, colorNameNormalized, colorHexNormalized automatically.
   * The colorInput field is stripped before reaching the repository.
   *
   * paidPrice, shop, and spec are local-only and never sent to Spoolman.
   * Returns the updated Filament, or null if no record was found.
   */
  async updateFilament(
    localId: string,
    patch: UpdateFilamentPatch
  ): Promise<Filament | null> {
    const { colorInput, ...rest } = patch;

    if (colorInput !== undefined) {
      const normalized = normalizeColor(colorInput);
      rest.colorNameRaw = normalized.colorNameRaw;
      rest.colorNameNormalized = normalized.colorNameNormalized;
      rest.colorHexNormalized = normalized.colorHexNormalized;
    }

    return FilamentRepository.updateLocal(localId, rest);
  },
};
