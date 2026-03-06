/**
 * src/adapters/spoolman/index.ts
 *
 * Concrete implementation of IExternalFilamentSystemPort backed by the
 * Spoolman REST API. This is the only place in the codebase that is
 * allowed to import SpoolmanClient directly.
 *
 * SyncUseCase depends on IExternalFilamentSystemPort, not on this file.
 * Swap this adapter for any other backend without touching the use case.
 */
import * as SpoolmanClient from "@/src/data/api/SpoolmanClient";
import type {
  IExternalFilamentSystemPort,
  RemoteSpoolDTO,
  RemoteFilamentDTO,
  RemoteVendorDTO,
  SpoolPatchDTO,
} from "@/src/core/ports/index";

export const SpoolmanAdapter: IExternalFilamentSystemPort = {
  async healthCheck(baseUrl: string): Promise<{ status: string }> {
    return SpoolmanClient.healthCheck(baseUrl);
  },

  async getVendors(baseUrl: string): Promise<RemoteVendorDTO[]> {
    return SpoolmanClient.getVendors(baseUrl) as Promise<RemoteVendorDTO[]>;
  },

  async getFilaments(baseUrl: string): Promise<RemoteFilamentDTO[]> {
    return SpoolmanClient.getFilaments(baseUrl) as Promise<RemoteFilamentDTO[]>;
  },

  async getSpools(baseUrl: string): Promise<RemoteSpoolDTO[]> {
    return SpoolmanClient.getSpools(baseUrl) as Promise<RemoteSpoolDTO[]>;
  },

  async patchSpool(
    baseUrl: string,
    remoteId: number,
    patch: SpoolPatchDTO
  ): Promise<void> {
    await SpoolmanClient.patchSpool(baseUrl, remoteId, patch);
  },
};
