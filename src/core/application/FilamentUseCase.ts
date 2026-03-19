/**
 * src/core/application/FilamentUseCase.ts
 *
 * Application layer for local filament edits.
 * Delegates to FilamentRepository via the IFilamentRepository port.
 * No DB imports — pure use-case logic.
 */
import { FilamentRepository } from "@/src/data/repositories/FilamentRepository";
import type { Filament, FilamentSpec } from "@/src/core/domain/filament";
import type { UpdateFilamentPatch } from "@/src/core/ports";
import { normalizeColor } from "./filament/ColorNormalizer";

/**
 * Material defaults applied when spec fields are absent.
 * Only suggested values — never forced on existing explicit data.
 */
const MATERIAL_SPEC_DEFAULTS: Record<
  string,
  Pick<FilamentSpec, "printTempCMin" | "printTempCMax" | "bedTempCMin" | "bedTempCMax">
> = {
  PLA:  { printTempCMin: 190, printTempCMax: 220, bedTempCMin: 50, bedTempCMax: 60 },
  PETG: { printTempCMin: 230, printTempCMax: 250, bedTempCMin: 70, bedTempCMax: 85 },
  ABS:  { printTempCMin: 240, printTempCMax: 260, bedTempCMin: 90, bedTempCMax: 110 },
  ASA:  { printTempCMin: 240, printTempCMax: 260, bedTempCMin: 90, bedTempCMax: 110 },
  TPU:  { printTempCMin: 210, printTempCMax: 230, bedTempCMin: 30, bedTempCMax: 60 },
};

const VALID_DIAMETERS = [1.75, 2.85];
const MIN_PLAUSIBLE_TEMP = 150;
const MAX_PLAUSIBLE_TEMP = 350;

export type FilamentSpecValidationError =
  | "DIAMETER_INVALID"
  | "PRINT_TEMP_MIN_GT_MAX"
  | "BED_TEMP_MIN_GT_MAX"
  | "PRINT_TEMP_OUT_OF_RANGE"
  | "BED_TEMP_OUT_OF_RANGE";

export interface FilamentSpecValidation {
  valid: boolean;
  errors: FilamentSpecValidationError[];
}

function validateSpec(spec: Partial<FilamentSpec>): FilamentSpecValidation {
  const errors: FilamentSpecValidationError[] = [];

  if (
    spec.diameterMm !== undefined &&
    !VALID_DIAMETERS.includes(spec.diameterMm)
  ) {
    errors.push("DIAMETER_INVALID");
  }

  if (
    spec.printTempCMin !== undefined &&
    (spec.printTempCMin < MIN_PLAUSIBLE_TEMP || spec.printTempCMin > MAX_PLAUSIBLE_TEMP)
  ) {
    errors.push("PRINT_TEMP_OUT_OF_RANGE");
  }
  if (
    spec.printTempCMax !== undefined &&
    (spec.printTempCMax < MIN_PLAUSIBLE_TEMP || spec.printTempCMax > MAX_PLAUSIBLE_TEMP)
  ) {
    errors.push("PRINT_TEMP_OUT_OF_RANGE");
  }

  if (
    spec.printTempCMin !== undefined &&
    spec.printTempCMax !== undefined &&
    spec.printTempCMin > spec.printTempCMax
  ) {
    errors.push("PRINT_TEMP_MIN_GT_MAX");
  }

  if (
    spec.bedTempCMin !== undefined &&
    spec.bedTempCMax !== undefined &&
    spec.bedTempCMin > spec.bedTempCMax
  ) {
    errors.push("BED_TEMP_MIN_GT_MAX");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Merge spec patch with material defaults.
 * Material defaults are ONLY applied when a field is explicitly absent (undefined)
 * in both the patch and the existing spec. Never overwrite explicit user values.
 */
function applyMaterialDefaults(
  material: string,
  specPatch: Partial<FilamentSpec>,
  existingSpec?: FilamentSpec
): Partial<FilamentSpec> {
  const defaults = MATERIAL_SPEC_DEFAULTS[material.toUpperCase()];
  if (!defaults) return specPatch;

  const result = { ...specPatch };

  if (result.printTempCMin === undefined && existingSpec?.printTempCMin === undefined) {
    result.printTempCMin = defaults.printTempCMin;
  }
  if (result.printTempCMax === undefined && existingSpec?.printTempCMax === undefined) {
    result.printTempCMax = defaults.printTempCMax;
  }
  if (result.bedTempCMin === undefined && existingSpec?.bedTempCMin === undefined) {
    result.bedTempCMin = defaults.bedTempCMin;
  }
  if (result.bedTempCMax === undefined && existingSpec?.bedTempCMax === undefined) {
    result.bedTempCMax = defaults.bedTempCMax;
  }

  return result;
}

export const FilamentUseCase = {
  /**
   * Apply a partial update to a locally-stored filament.
   * Marks the record dirty so SyncUseCase can push the change.
   *
   * When patch.colorInput is provided, ColorNormalizer runs and populates
   * colorNameRaw, colorNameNormalized, colorHexNormalized automatically.
   * The colorInput field is stripped before reaching the repository.
   *
   * Spec validation is performed before writing. Returns null if spec is invalid.
   * paidPrice, shop, and spec are local-only and never sent to Remote.
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

    if (rest.spec !== undefined) {
      const validation = validateSpec(rest.spec);
      if (!validation.valid) return null;
    }

    return FilamentRepository.updateLocal(localId, rest);
  },

  /**
   * Validate a FilamentSpec patch without writing anything.
   * Useful for real-time form validation in the UI.
   */
  validateSpec,

  /**
   * Apply material-based defaults to an empty or partial spec.
   * Call this in the UI when the user picks a material but hasn't set any temp values.
   */
  applyMaterialDefaults,
};
