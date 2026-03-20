/**
 * src/data/repositories/PrinterRepository.ts
 *
 * CRUD repository for local printer_profiles table.
 * No sync — printer profiles are local-only.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { printerProfiles } from "../db/schema";
import type { PrinterProfile } from "../../domain/models";

export interface PrinterProfileData {
  name: string;
  nozzleDiameter?: number;
  bedTemp?: number;
  nozzleTemp?: number;
  compatibleMaterials?: string;
}

function generateLocalId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function toModel(row: typeof printerProfiles.$inferSelect): PrinterProfile {
  return {
    localId: row.localId,
    name: row.name,
    nozzleDiameter: row.nozzleDiameter ?? undefined,
    bedTemp: row.bedTemp ?? undefined,
    nozzleTemp: row.nozzleTemp ?? undefined,
    compatibleMaterials: row.compatibleMaterials ?? undefined,
  };
}

export const PrinterRepository = {
  async getAll(): Promise<PrinterProfile[]> {
    const rows = await getDb()
      .select()
      .from(printerProfiles)
      .orderBy(printerProfiles.name);
    return rows.map(toModel);
  },

  async getByLocalId(localId: string): Promise<PrinterProfile | null> {
    const rows = await getDb()
      .select()
      .from(printerProfiles)
      .where(eq(printerProfiles.localId, localId))
      .limit(1);
    return rows[0] ? toModel(rows[0]) : null;
  },

  async insert(data: PrinterProfileData): Promise<PrinterProfile> {
    const localId = generateLocalId();
    await getDb()
      .insert(printerProfiles)
      .values({
        localId,
        name: data.name,
        nozzleDiameter: data.nozzleDiameter ?? null,
        bedTemp: data.bedTemp ?? null,
        nozzleTemp: data.nozzleTemp ?? null,
        compatibleMaterials: data.compatibleMaterials ?? null,
      });
    return {
      localId,
      name: data.name,
      nozzleDiameter: data.nozzleDiameter,
      bedTemp: data.bedTemp,
      nozzleTemp: data.nozzleTemp,
      compatibleMaterials: data.compatibleMaterials,
    };
  },

  async update(localId: string, data: PrinterProfileData): Promise<void> {
    await getDb()
      .update(printerProfiles)
      .set({
        name: data.name,
        nozzleDiameter: data.nozzleDiameter ?? null,
        bedTemp: data.bedTemp ?? null,
        nozzleTemp: data.nozzleTemp ?? null,
        compatibleMaterials: data.compatibleMaterials ?? null,
      })
      .where(eq(printerProfiles.localId, localId));
  },

  async remove(localId: string): Promise<void> {
    await getDb()
      .delete(printerProfiles)
      .where(eq(printerProfiles.localId, localId));
  },
};
