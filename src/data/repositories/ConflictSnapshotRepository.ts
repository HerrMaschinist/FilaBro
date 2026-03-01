/**
 * src/data/repositories/ConflictSnapshotRepository.ts
 *
 * Persistence for conflict snapshots.
 * Written by SyncUseCase when pull detects a conflict.
 * Read by UI to display conflict indicators and by push to close resolved conflicts.
 *
 * ConflictSnapshotRepository contains NO policy logic — it is pure data access.
 * The Application Layer (SyncUseCase) decides when to create, read, and resolve conflicts.
 */
import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import { conflictSnapshots } from "../db/schema";
import type { ConflictResolution } from "../../core/application/conflict/ConflictResolver";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

export type ConflictEntityType = "spool" | "filament" | "manufacturer";

export interface ConflictSnapshot {
  id: string;
  entityType: ConflictEntityType;
  localId: string;
  remoteSnapshotJson: string;
  capturedAt: number;
  resolvedAt?: number;
  resolution?: ConflictResolution;
}

function toSnapshot(row: typeof conflictSnapshots.$inferSelect): ConflictSnapshot {
  return {
    id: row.id,
    entityType: row.entityType as ConflictEntityType,
    localId: row.localId,
    remoteSnapshotJson: row.remoteSnapshotJson,
    capturedAt: row.capturedAt,
    resolvedAt: row.resolvedAt ?? undefined,
    resolution: row.resolution as ConflictResolution | undefined,
  };
}

export const ConflictSnapshotRepository = {
  /**
   * Create or update an open conflict snapshot for an entity.
   * If an open snapshot already exists for (entityType, localId), it is replaced.
   * Only one open conflict per entity is maintained.
   */
  async upsertOpen(
    entityType: ConflictEntityType,
    localId: string,
    remoteSnapshotJson: string,
    capturedAt: number
  ): Promise<ConflictSnapshot> {
    const db = getDb();

    // Close any existing open conflict for this entity before creating a new one
    const existing = await this.getOpenByEntity(entityType, localId);
    if (existing) {
      await db
        .delete(conflictSnapshots)
        .where(eq(conflictSnapshots.id, existing.id));
    }

    const id = generateId();
    const insert = {
      id,
      entityType,
      localId,
      remoteSnapshotJson,
      capturedAt,
      resolvedAt: null,
      resolution: null,
    };
    await db.insert(conflictSnapshots).values(insert);

    return {
      id,
      entityType,
      localId,
      remoteSnapshotJson,
      capturedAt,
    };
  },

  /**
   * Get the open (unresolved) conflict snapshot for a specific entity, if any.
   */
  async getOpenByEntity(
    entityType: ConflictEntityType,
    localId: string
  ): Promise<ConflictSnapshot | null> {
    const rows = await getDb()
      .select()
      .from(conflictSnapshots)
      .where(
        and(
          eq(conflictSnapshots.entityType, entityType),
          eq(conflictSnapshots.localId, localId),
          isNull(conflictSnapshots.resolvedAt)
        )
      )
      .limit(1);
    return rows[0] ? toSnapshot(rows[0]) : null;
  },

  /**
   * List all open conflict snapshots, optionally filtered by entity type.
   */
  async listOpen(entityType?: ConflictEntityType): Promise<ConflictSnapshot[]> {
    const db = getDb();
    if (entityType) {
      const rows = await db
        .select()
        .from(conflictSnapshots)
        .where(
          and(
            eq(conflictSnapshots.entityType, entityType),
            isNull(conflictSnapshots.resolvedAt)
          )
        );
      return rows.map(toSnapshot);
    }
    const rows = await db
      .select()
      .from(conflictSnapshots)
      .where(isNull(conflictSnapshots.resolvedAt));
    return rows.map(toSnapshot);
  },

  /**
   * Count all open (unresolved) conflict snapshots.
   */
  async countOpen(): Promise<number> {
    const rows = await getDb()
      .select()
      .from(conflictSnapshots)
      .where(isNull(conflictSnapshots.resolvedAt));
    return rows.length;
  },

  /**
   * Mark a conflict snapshot as resolved.
   * Called by push (resolution = "keep_local") or future conflict-resolution UI.
   */
  async resolve(
    id: string,
    resolution: ConflictResolution,
    resolvedAt: number
  ): Promise<void> {
    await getDb()
      .update(conflictSnapshots)
      .set({ resolution, resolvedAt })
      .where(eq(conflictSnapshots.id, id));
  },

  /**
   * Resolve any open conflict for an entity by its localId.
   * Convenience method used by push after successful sync.
   */
  async resolveByEntity(
    entityType: ConflictEntityType,
    localId: string,
    resolution: ConflictResolution,
    resolvedAt: number
  ): Promise<void> {
    const open = await this.getOpenByEntity(entityType, localId);
    if (!open) return;
    await this.resolve(open.id, resolution, resolvedAt);
  },
};
