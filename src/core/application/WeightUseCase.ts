/**
 * src/core/application/WeightUseCase.ts
 *
 * Phase 4: Application layer for all filament weight/usage operations.
 *
 * All weight changes are recorded as append-only UsageEvents.
 * The spool_stats projection is updated after every event.
 * spools.remaining_weight is never written for user-initiated changes
 * — only spool_stats.remaining_weight is the current truth.
 *
 * Public API:
 *   recordUsage(spoolLocalId, grams, source, note?)
 *     — Consume grams from spool. Appends a "consume" event.
 *       remaining = max(0, current - grams).
 *
 *   adjustRemaining(spoolLocalId, newRemaining, source, note?)
 *     — Set remaining weight absolutely. Appends an "adjustment" event.
 *       remaining = newRemaining (floor to 0).
 *
 * Both methods:
 *   1. Resolve current remaining from spool_stats → fallback to spools.remaining_weight
 *   2. Compute new remaining
 *   3. Append UsageEvent
 *   4. Upsert spool_stats
 *   5. Mark spool as pending_push (dirtyFields: ["remaining_weight"])
 */
import { SpoolRepository } from "@/src/data/repositories/SpoolRepository";
import { SpoolStatsRepository } from "@/src/data/repositories/SpoolStatsRepository";
import { UsageEventRepository } from "@/src/data/repositories/UsageEventRepository";
import type { UsageEventSource } from "@/src/core/domain/usage";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

export const WeightUseCase = {
  /**
   * Record filament consumption. Appends a "consume" UsageEvent.
   * remaining = max(0, current_remaining - grams)
   */
  async recordUsage(
    spoolLocalId: string,
    grams: number,
    source: UsageEventSource,
    note?: string
  ): Promise<void> {
    const now = Date.now();

    const [statsWeight, spool] = await Promise.all([
      SpoolStatsRepository.getRemainingWeight(spoolLocalId),
      SpoolRepository.getByLocalId(spoolLocalId),
    ]);

    if (!spool) return;

    const currentRemaining =
      statsWeight ??
      spool.remainingWeight ??
      spool.initialWeight ??
      0;

    const newRemaining = Math.max(0, currentRemaining - Math.round(grams));

    await UsageEventRepository.append({
      id: generateId(),
      spoolLocalId,
      grams: Math.round(grams),
      type: "consume",
      occurredAt: now,
      source,
      note,
    });

    await SpoolStatsRepository.upsertRemainingWeight(spoolLocalId, newRemaining, now);
    await SpoolRepository.markWeightPendingPush(spoolLocalId, now);
  },

  /**
   * Set remaining weight absolutely. Appends an "adjustment" UsageEvent.
   * grams in the event = newRemaining (the absolute target value, always positive).
   * remaining = max(0, newRemaining)
   */
  async adjustRemaining(
    spoolLocalId: string,
    newRemaining: number,
    source: UsageEventSource,
    note?: string
  ): Promise<void> {
    const now = Date.now();

    const spool = await SpoolRepository.getByLocalId(spoolLocalId);
    if (!spool) return;

    const clamped = Math.max(0, Math.round(newRemaining));

    await UsageEventRepository.append({
      id: generateId(),
      spoolLocalId,
      grams: clamped,
      type: "adjustment",
      occurredAt: now,
      source,
      note,
    });

    await SpoolStatsRepository.upsertRemainingWeight(spoolLocalId, clamped, now);
    await SpoolRepository.markWeightPendingPush(spoolLocalId, now);
  },
};
