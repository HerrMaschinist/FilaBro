import { eq } from "drizzle-orm";
import { getDb } from "@/src/data/db/client";
import { scanAliases } from "@/src/data/db/schema";
import type { IAliasRepository } from "@/src/core/identity/IAliasRepository";
import type { ScanAlias, CodeType } from "@/src/core/identity/types";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function rowToAlias(row: typeof scanAliases.$inferSelect): ScanAlias {
  return {
    id: row.id,
    rawCode: row.rawCode,
    spoolLocalId: row.spoolLocalId,
    codeType: row.codeType as CodeType,
    confidence: row.confidence,
    confirmedByUser: row.confirmedByUser === 1,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
  };
}

export const SqliteAliasRepository: IAliasRepository = {
  findByRawCode(rawCode: string): ScanAlias[] {
    const rows = getDb()
      .select()
      .from(scanAliases)
      .where(eq(scanAliases.rawCode, rawCode))
      .all();
    return rows.map(rowToAlias);
  },

  findBySpoolLocalId(spoolLocalId: string): ScanAlias[] {
    const rows = getDb()
      .select()
      .from(scanAliases)
      .where(eq(scanAliases.spoolLocalId, spoolLocalId))
      .all();
    return rows.map(rowToAlias);
  },

  save(alias: Omit<ScanAlias, "id">): ScanAlias {
    const id = generateId();
    const insert: typeof scanAliases.$inferInsert = {
      id,
      rawCode: alias.rawCode,
      spoolLocalId: alias.spoolLocalId,
      codeType: alias.codeType,
      confidence: alias.confidence,
      confirmedByUser: alias.confirmedByUser ? 1 : 0,
      createdAt: alias.createdAt,
      lastSeenAt: alias.lastSeenAt,
    };
    getDb().insert(scanAliases).values(insert).run();
    return { ...alias, id };
  },

  confirm(id: string): void {
    getDb()
      .update(scanAliases)
      .set({ confirmedByUser: 1 })
      .where(eq(scanAliases.id, id))
      .run();
  },

  updateLastSeen(id: string, lastSeenAt: number): void {
    getDb()
      .update(scanAliases)
      .set({ lastSeenAt })
      .where(eq(scanAliases.id, id))
      .run();
  },

  deleteBySpoolLocalId(spoolLocalId: string): void {
    getDb()
      .delete(scanAliases)
      .where(eq(scanAliases.spoolLocalId, spoolLocalId))
      .run();
  },
};
