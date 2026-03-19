/**
 * src/core/application/CatalogUseCase.ts
 *
 * Phase 1: Application layer wrapper over CatalogService.
 * Delegates entirely to the existing service — no logic change.
 * AppContext imports this instead of CatalogService directly.
 *
 * Future phases will move logic here and make CatalogService obsolete.
 */
import { CatalogService } from "@/src/features/catalog/CatalogService";
import type { Manufacturer, Filament, Spool } from "@/src/domain/models";

export interface CreateManufacturerInput {
  name: string;
  website?: string;
  comment?: string;
}

export interface CreateFilamentInput {
  name: string;
  material: string;
  /** Free-text color input (name or hex). CatalogService runs normalizer. */
  colorInput?: string;
  colorHex?: string;
  manufacturerLocalId?: string;
  weight?: number;
  spoolWeight?: number;
  comment?: string;
  spec?: Partial<import("@/src/core/domain/filament").FilamentSpec>;
}

export interface CreateSpoolInput {
  filamentLocalId: string;
  remainingWeight?: number;
  initialWeight?: number;
  spoolWeight?: number;
  comment?: string;
  displayName?: string;
  lotNr?: string;
  qrCode?: string;
  nfcTagId?: string;
}

export const CatalogUseCase = {
  async loadManufacturers(): Promise<Manufacturer[]> {
    return CatalogService.loadManufacturers();
  },

  async loadFilaments(): Promise<Filament[]> {
    return CatalogService.loadFilaments();
  },

  async createManufacturer(data: CreateManufacturerInput): Promise<Manufacturer> {
    return CatalogService.createManufacturer(data);
  },

  async createFilament(data: CreateFilamentInput): Promise<Filament> {
    return CatalogService.createFilament(data);
  },

  async createSpool(data: CreateSpoolInput): Promise<Spool> {
    return CatalogService.createSpool(data);
  },

  async deleteManufacturer(localId: string): Promise<boolean> {
    return CatalogService.deleteManufacturer(localId);
  },

  async deleteFilament(localId: string): Promise<boolean> {
    return CatalogService.deleteFilament(localId);
  },

  async deleteSpool(localId: string): Promise<boolean> {
    return CatalogService.deleteSpool(localId);
  },
};
