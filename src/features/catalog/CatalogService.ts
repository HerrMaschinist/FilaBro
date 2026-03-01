import { ManufacturerRepository } from "@/src/data/repositories/ManufacturerRepository";
import { FilamentRepository } from "@/src/data/repositories/FilamentRepository";
import { SpoolRepository } from "@/src/data/repositories/SpoolRepository";
import { SpoolStatsRepository } from "@/src/data/repositories/SpoolStatsRepository";
import { isPersistenceEnabled } from "@/src/data/db/client";
import type { Manufacturer, Filament, Spool } from "@/src/domain/models";

export const MATERIALS = [
  "PLA",
  "PETG",
  "ABS",
  "TPU",
  "ASA",
  "PA",
  "PC",
  "PVA",
  "HIPS",
  "PP",
] as const;

export const CatalogService = {
  async loadManufacturers(): Promise<Manufacturer[]> {
    if (!isPersistenceEnabled) return [];
    return ManufacturerRepository.getAll();
  },

  async loadFilaments(): Promise<Filament[]> {
    if (!isPersistenceEnabled) return [];
    return FilamentRepository.getAll();
  },

  async createManufacturer(data: {
    name: string;
    website?: string;
    comment?: string;
  }): Promise<Manufacturer> {
    if (!isPersistenceEnabled) throw new Error("PERSISTENCE_DISABLED");
    return ManufacturerRepository.createLocal(data);
  },

  async createFilament(data: {
    name: string;
    material: string;
    colorHex?: string;
    manufacturerLocalId?: string;
    weight?: number;
    spoolWeight?: number;
    comment?: string;
  }): Promise<Filament> {
    if (!isPersistenceEnabled) throw new Error("PERSISTENCE_DISABLED");
    return FilamentRepository.createLocal(data);
  },

  async createSpool(data: {
    filamentLocalId: string;
    remainingWeight?: number;
    initialWeight?: number;
    spoolWeight?: number;
    comment?: string;
    displayName?: string;
    lotNr?: string;
  }): Promise<Spool> {
    if (!isPersistenceEnabled) throw new Error("PERSISTENCE_DISABLED");
    const spool = await SpoolRepository.createLocal(data);
    // Phase 4: seed spool_stats with initial remaining weight so view queries
    // immediately return the correct value without waiting for a usage event.
    const initialRemaining = spool.remainingWeight ?? spool.initialWeight;
    if (initialRemaining !== undefined) {
      await SpoolStatsRepository.upsertRemainingWeight(
        spool.localId,
        initialRemaining,
        spool.lastModifiedAt
      );
    }
    return spool;
  },

  async deleteManufacturer(localId: string): Promise<boolean> {
    if (!isPersistenceEnabled) throw new Error("PERSISTENCE_DISABLED");
    return ManufacturerRepository.deleteByLocalId(localId);
  },

  async deleteFilament(localId: string): Promise<boolean> {
    if (!isPersistenceEnabled) throw new Error("PERSISTENCE_DISABLED");
    return FilamentRepository.deleteByLocalId(localId);
  },

  async deleteSpool(localId: string): Promise<boolean> {
    if (!isPersistenceEnabled) throw new Error("PERSISTENCE_DISABLED");
    return SpoolRepository.deleteByLocalId(localId);
  },
};
