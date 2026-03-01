/**
 * src/core/domain/manufacturer.ts
 *
 * Pure domain entity. No sync fields, no DB fields, no HTTP fields.
 * remoteId is optional and is NOT part of the entity's identity.
 * Identity is localId only.
 */
export interface Manufacturer {
  localId: string;
  remoteId?: number;
  name: string;
  website?: string;
  comment?: string;
  lastModifiedAt: number;
}
