/**
 * src/domain/models.ts
 *
 * Phase 2 backward-compatibility shim.
 * All types are now defined in src/core/domain and src/core/domain/sync.
 * This file re-exports them so that existing imports continue to work
 * without modification until each file is migrated to import from
 * src/core/domain directly.
 *
 * Do NOT add new types here. Add them to src/core/domain/*.
 */

// Core domain entity types
export type { Manufacturer } from "@/src/core/domain/manufacturer";
export type { Filament } from "@/src/core/domain/filament";
export type { Spool, SpoolView } from "@/src/core/domain/spool";

// Sync state type (re-exported for adapter-layer backward compat)
export type { SyncState } from "@/src/core/domain/sync";

// Legacy types kept here; none are currently imported elsewhere.

export interface MaterialType {
  id: string;
  label: string;
}

export interface SyncMeta {
  entityType: "spool" | "filament" | "manufacturer";
  lastPullAt?: number;
  lastPushAt?: number;
  serverUrl: string;
}

export interface WidgetSnapshot {
  generatedAt: number;
  spools: Pick<
    import("@/src/core/domain/spool").SpoolView,
    "localId" | "remoteId" | "remainingWeight" | "initialWeight" | "isFavorite"
  >[];
}

export interface PrinterProfile {
  localId: string;
  name: string;
  nozzleDiameter?: number;
  bedTemp?: number;
  nozzleTemp?: number;
  compatibleMaterials?: string;
}
