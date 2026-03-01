/**
 * src/data/repositories/SpoolStatsRepository.ts
 *
 * Read/write for the spool_stats projection table.
 * Implements ISpoolStatsRepository from core/ports.
 *
 * Phase 5 addition:
 *   - upsertManyRemainingWeights() — batch upsert using SQLite INSERT OR REPLACE.
 *     Uses Drizzle's onConflictDoUpdate with sql`excluded.*` for an efficient
 *     single multi-row statement instead of N individual upserts.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { spoolStats } from "../db/schema";
import type { ISpoolStatsRepository } from "../../core/ports";

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

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

  /**
   * Phase 5: batch upsert remaining weights.
   * Uses multi-row INSERT OR REPLACE — one statement per chunk instead of N.
   */
  async upsertManyRemainingWeights(
    items: Array<{ spoolLocalId: string; remainingWeight: number; updatedAt: number }>
  ): Promise<void> {
    if (items.length === 0) return;
    for (const ch of chunk(items, 50)) {
      await getDb()
        .insert(spoolStats)
        .values(
          ch.map((item) => ({
            spoolLocalId: item.spoolLocalId,
            remainingWeight: Math.round(item.remainingWeight),
            updatedAt: item.updatedAt,
          }))
        )
        .onConflictDoUpdate({
          target: spoolStats.spoolLocalId,
          set: {
            remainingWeight: sql`excluded.remaining_weight`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
  },

  async getBatchRemainingWeights(
    spoolLocalIds: string[]
  ): Promise<Map<string, number>> {
    if (spoolLocalIds.length === 0) return new Map();

    const map = new Map<string, number>();
    for (const ch of chunk(spoolLocalIds, 900)) {
      const rows = await getDb()
        .select()
        .from(spoolStats)
        .where(inArray(spoolStats.spoolLocalId, ch));
      for (const row of rows) {
        if (row.remainingWeight !== null && row.remainingWeight !== undefined) {
          map.set(row.spoolLocalId, row.remainingWeight);
        }
      }
    }
    return map;
  },
};
