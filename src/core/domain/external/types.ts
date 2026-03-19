/**
 * src/core/domain/external/types.ts
 *
 * Models relationships between local entities and external systems.
 * Domain entities do NOT carry remoteId as a required field or identity.
 * External references are tracked separately per system.
 *
 * Currently only "filabase" and "filabase_legacy" are supported external systems.
 * Future: "bambu", "orca", etc.
 */

export type ExternalSystem = "filabase" | "filabase_legacy";

export type EntityType = "spool" | "filament" | "manufacturer";

/**
 * Links a local entity (by localId) to an external system's record (by remoteId).
 * The adapter stores this mapping in the DB alongside the entity.
 * The domain entity itself is unaware of the external system.
 */
export interface ExternalRef {
  localId: string;
  system: ExternalSystem;
  entityType: EntityType;
  remoteId: number;
}
