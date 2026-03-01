/**
 * src/data/repositories/UsageEventRepository.ts
 *
 * Append-only event store for filament usage events.
 * Implements IUsageEventRepository from core/ports.
 *
 * Phase 5 addition:
 *   - appendMany() — batch insert for sync operations.
 *
 * Rules:
 *   - Never updates or deletes events — only inserts.
 *   - grams is stored as INTEGER (rounded).
 *   - occurredAt is unix milliseconds.
 */
import { eq, gte, and } from "drizzle-orm";
import { getDb } from "../db/client";
import { usageEvents } from "../db/schema";
import type { UsageEvent } from "../../core/domain/usage";
import type { IUsageEventRepository } from "../../core/ports";

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function toUsageEvent(row: typeof usageEvents.$inferSelect): UsageEvent {
  return {
    id: row.id,
    spoolLocalId: row.spoolLocalId,
    grams: row.grams,
    type: row.type as UsageEvent["type"],
    occurredAt: row.occurredAt,
    source: row.source as UsageEvent["source"],
    note: row.note ?? undefined,
  };
}

export const UsageEventRepository: IUsageEventRepository = {
  async append(event: UsageEvent): Promise<void> {
    await getDb()
      .insert(usageEvents)
      .values({
        id: event.id,
        spoolLocalId: event.spoolLocalId,
        grams: Math.round(event.grams),
        type: event.type,
        occurredAt: event.occurredAt,
        source: event.source,
        note: event.note ?? null,
      });
  },

  /**
   * Phase 5: batch append events — used for sync pull of new spools.
   * Chunked to stay within SQLite's parameter limit.
   */
  async appendMany(events: UsageEvent[]): Promise<void> {
    if (events.length === 0) return;
    for (const ch of chunk(events, 50)) {
      await getDb()
        .insert(usageEvents)
        .values(
          ch.map((event) => ({
            id: event.id,
            spoolLocalId: event.spoolLocalId,
            grams: Math.round(event.grams),
            type: event.type,
            occurredAt: event.occurredAt,
            source: event.source,
            note: event.note ?? null,
          }))
        );
    }
  },

  async listBySpool(spoolLocalId: string): Promise<UsageEvent[]> {
    const rows = await getDb()
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.spoolLocalId, spoolLocalId))
      .orderBy(usageEvents.occurredAt);
    return rows.map(toUsageEvent);
  },

  async listBySpoolSince(
    spoolLocalId: string,
    sinceMs: number
  ): Promise<UsageEvent[]> {
    const rows = await getDb()
      .select()
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.spoolLocalId, spoolLocalId),
          gte(usageEvents.occurredAt, sinceMs)
        )
      )
      .orderBy(usageEvents.occurredAt);
    return rows.map(toUsageEvent);
  },
};
