/**
 * src/adapters/filabase/index.ts
 *
 * Concrete implementation of IExternalFilamentSystemPort backed by the
 * FilaBase REST API (former Spoolman integration — legacy endpoint shape).
 *
 * This is the ONLY place in the codebase allowed to import FilaBaseClient
 * or reference legacy snake_case field names from the remote API.
 *
 * Responsibilities:
 *   - Call FilaBaseClient (raw HTTP)
 *   - Translate Legacy API shapes → backend-neutral port DTOs (camelCase)
 *   - Translate neutral patch DTOs → Legacy API payloads (snake_case)
 *
 * SyncUseCase depends on IExternalFilamentSystemPort, not on this file.
 * Swap this adapter for any other backend without touching the use case.
 */
import * as FilaBaseClient from "@/src/data/api/FilaBaseClient";
import type {
  IExternalFilamentSystemPort,
  RemoteManufacturerDTO,
  RemoteFilamentDTO,
  RemoteSpoolDTO,
  SpoolPatchDTO,
} from "@/src/core/ports/index";

export const FilaBaseAdapter: IExternalFilamentSystemPort = {
  async healthCheck(baseUrl: string): Promise<{ status: string }> {
    return FilaBaseClient.healthCheck(baseUrl);
  },

  async getManufacturers(baseUrl: string): Promise<RemoteManufacturerDTO[]> {
    const vendors = await FilaBaseClient.getVendors(baseUrl);
    return vendors.map((v) => ({
      id: v.id,
      name: v.name,
      comment: v.comment,
    }));
  },

  async getFilaments(baseUrl: string): Promise<RemoteFilamentDTO[]> {
    const filaments = await FilaBaseClient.getFilaments(baseUrl);
    return filaments.map((f) => ({
      id: f.id,
      name: f.name,
      material: f.material,
      colorHex: f.color_hex,
      manufacturer: f.vendor
        ? { id: f.vendor.id, name: f.vendor.name, comment: f.vendor.comment }
        : undefined,
      weight: f.weight,
      spoolWeight: f.spool_weight,
      comment: f.comment,
    }));
  },

  async getSpools(baseUrl: string): Promise<RemoteSpoolDTO[]> {
    const spools = await FilaBaseClient.getSpools(baseUrl);
    return spools.map((s) => ({
      id: s.id,
      filament: {
        id: s.filament.id,
        name: s.filament.name,
        material: s.filament.material,
        colorHex: s.filament.color_hex,
        manufacturer: s.filament.vendor
          ? {
              id: s.filament.vendor.id,
              name: s.filament.vendor.name,
              comment: s.filament.vendor.comment,
            }
          : undefined,
        weight: s.filament.weight,
        spoolWeight: s.filament.spool_weight,
        comment: s.filament.comment,
      },
      remainingWeight: s.remaining_weight,
      initialWeight: s.initial_weight,
      spoolWeight: s.spool_weight,
      usedWeight: s.used_weight,
      comment: s.comment,
      archived: s.archived,
      lotNumber: s.lot_nr,
      lastUsed: s.last_used,
      firstUsed: s.first_used,
      registeredAt: s.registered,
    }));
  },

  async patchSpool(
    baseUrl: string,
    remoteId: number,
    patch: SpoolPatchDTO
  ): Promise<void> {
    await FilaBaseClient.patchSpool(baseUrl, remoteId, {
      remaining_weight: patch.remainingWeight,
    });
  },
};
