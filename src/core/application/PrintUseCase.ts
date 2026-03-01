/**
 * src/core/application/PrintUseCase.ts
 *
 * Phase 5.3 — Consumption assistance use cases.
 *
 * All operations are offline-first and append-only.
 * Events are the source of truth. spool_stats is the projection.
 *
 * Public API:
 *   recordPrintStarted(spoolLocalId, estimatedGrams, note?)
 *     — Log print intent. Records a "print_started" event.
 *       Does NOT reduce remaining weight yet (optimistic record only).
 *
 *   recordPrintFinished(spoolLocalId, actualGrams, note?)
 *     — Log actual consumption after a print.
 *       Appends a "consume" event; reduces remaining by actualGrams.
 *
 *   recordConsumptionCorrection(spoolLocalId, measuredTotalGrams, emptySpoolGrams, note?)
 *     — Physical scale measurement correction.
 *       remaining = measuredTotalGrams − emptySpoolGrams (clamped to 0).
 *       Appends an "adjustment" event; sets remaining absolutely.
 *
 * Heuristic for correction:
 *   User weighs the full spool → inputs measured total weight.
 *   User knows (or inputs) the empty spool weight.
 *   remaining = measured − empty.
 *
 * Threshold warning:
 *   All methods return a { newRemaining, belowThreshold } result so the
 *   UI can display a low-filament warning without containing any logic.
 */
import { SpoolRepository } from "@/src/data/repositories/SpoolRepository";
import { SpoolStatsRepository } from "@/src/data/repositories/SpoolStatsRepository";
import { UsageEventRepository } from "@/src/data/repositories/UsageEventRepository";

const LOW_FILAMENT_THRESHOLD_GRAMS = 100;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

export interface PrintUseCaseResult {
  newRemaining: number;
  belowThreshold: boolean;
}

export const PrintUseCase = {
  /**
   * Record that a print has started (intent only, no weight reduction).
   * Records a "print_started" usage event for audit trail purposes.
   * Returns the current remaining weight and threshold status.
   */
  async recordPrintStarted(
    spoolLocalId: string,
    estimatedGrams: number,
    note?: string
  ): Promise<PrintUseCaseResult> {
    const now = Date.now();

    const [statsWeight, spool] = await Promise.all([
      SpoolStatsRepository.getRemainingWeight(spoolLocalId),
      SpoolRepository.getByLocalId(spoolLocalId),
    ]);

    if (!spool) throw new Error(`Spool ${spoolLocalId} not found`);

    const currentRemaining =
      statsWeight ?? spool.remainingWeight ?? spool.initialWeight ?? 0;

    await UsageEventRepository.append({
      id: generateId(),
      spoolLocalId,
      grams: Math.max(0, Math.round(estimatedGrams)),
      type: "print_started" as "consume",
      occurredAt: now,
      source: "manual",
      note,
    });

    return {
      newRemaining: currentRemaining,
      belowThreshold: currentRemaining < LOW_FILAMENT_THRESHOLD_GRAMS,
    };
  },

  /**
   * Record that a print has finished.
   * Appends a "consume" event; reduces remaining by actualGrams.
   */
  async recordPrintFinished(
    spoolLocalId: string,
    actualGrams: number,
    note?: string
  ): Promise<PrintUseCaseResult> {
    const now = Date.now();

    const [statsWeight, spool] = await Promise.all([
      SpoolStatsRepository.getRemainingWeight(spoolLocalId),
      SpoolRepository.getByLocalId(spoolLocalId),
    ]);

    if (!spool) throw new Error(`Spool ${spoolLocalId} not found`);

    const currentRemaining =
      statsWeight ?? spool.remainingWeight ?? spool.initialWeight ?? 0;

    const consumed = Math.max(0, Math.round(actualGrams));
    const newRemaining = Math.max(0, currentRemaining - consumed);

    await UsageEventRepository.append({
      id: generateId(),
      spoolLocalId,
      grams: consumed,
      type: "consume",
      occurredAt: now,
      source: "manual",
      note: note ?? "Print finished",
    });

    await SpoolStatsRepository.upsertRemainingWeight(spoolLocalId, newRemaining, now);
    await SpoolRepository.markWeightPendingPush(spoolLocalId, now);

    return {
      newRemaining,
      belowThreshold: newRemaining < LOW_FILAMENT_THRESHOLD_GRAMS,
    };
  },

  /**
   * Record a physical scale measurement correction.
   * remaining = measuredTotalGrams − emptySpoolGrams (clamped to 0).
   * Appends an "adjustment" event; sets remaining absolutely.
   */
  async recordConsumptionCorrection(
    spoolLocalId: string,
    measuredTotalGrams: number,
    emptySpoolGrams: number,
    note?: string
  ): Promise<PrintUseCaseResult> {
    const now = Date.now();

    const spool = await SpoolRepository.getByLocalId(spoolLocalId);
    if (!spool) throw new Error(`Spool ${spoolLocalId} not found`);

    const newRemaining = Math.max(
      0,
      Math.round(measuredTotalGrams - emptySpoolGrams)
    );

    await UsageEventRepository.append({
      id: generateId(),
      spoolLocalId,
      grams: newRemaining,
      type: "adjustment",
      occurredAt: now,
      source: "manual",
      note: note ?? `Scale correction: ${measuredTotalGrams}g − ${emptySpoolGrams}g = ${newRemaining}g`,
    });

    await SpoolStatsRepository.upsertRemainingWeight(spoolLocalId, newRemaining, now);
    await SpoolRepository.markWeightPendingPush(spoolLocalId, now);

    return {
      newRemaining,
      belowThreshold: newRemaining < LOW_FILAMENT_THRESHOLD_GRAMS,
    };
  },
};
