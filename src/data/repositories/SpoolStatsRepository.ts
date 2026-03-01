/**
 * src/data/repositories/SpoolStatsRepository.ts
 *
 * Read/write for the spool_stats projection table.
 * Implements ISpoolStatsRepository from core/ports.
 *
 * spool_stats holds the projected remaining_weight per spool.
 * It is the single source of truth for remaining weight in Phase 4+.
 * The spools.remaining_weight column is kept for backward compatibility
 * and is only written during initial inserts or remote sync apply.
 */
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { spoolStats } from "../db/schema";
import type { ISpoolStatsRepository } from "../../core/ports";

export const SpoolStatsRepository: ISpoolStatsRepository = {
  async getRemainingWeight(spoolLocalId: string): Promise<number | undefined> {
    const rows = await getDb()
      .select()
      .from(spoolStats)
      .where(eq(spoolStats.spoolLocalId, spoolLocalId))
      .limit(1);
    const val = rows[0]?.remainingWeight;
    return val === null || val === undefined ? undefined : val;
  },

  async upsertRemainingWeight(
    spoolLocalId: string,
    remainingWeight: number,
    updatedAt: number
  ): Promise<void> {
    const rounded = Math.round(remainingWeight);
    await getDb()
      .insert(spoolStats)
      .values({
        spoolLocalId,
        remainingWeight: rounded,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: spoolStats.spoolLocalId,
        set: {
          remainingWeight: rounded,
          updatedAt,
        },
      });
  },

  async getBatchRemainingWeights(
    spoolLocalIds: string[]
  ): Promise<Map<string, number>> {
    if (spoolLocalIds.length === 0) return new Map();

    const rows = await getDb()
      .select()
      .from(spoolStats)
      .where(inArray(spoolStats.spoolLocalId, spoolLocalIds));

    const map = new Map<string, number>();
    for (const row of rows) {
      if (row.remainingWeight !== null && row.remainingWeight !== undefined) {
        map.set(row.spoolLocalId, row.remainingWeight);
      }
    }
    return map;
  },
};
