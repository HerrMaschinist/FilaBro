/**
 * src/data/repositories/UsageEventRepository.ts
 *
 * Append-only event store for filament usage events.
 * Implements IUsageEventRepository from core/ports.
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
