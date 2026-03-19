import { getFilabaseDb } from "@/src/data/db/filabase_client";

export interface FilabaseEntry {
  canonicalKey: string;
  brandName: string;
  filamentName: string;
  material: string;
  variantName: string;
  colorHex: string | null;
  diameterMm: number | null;
  netFilamentWeightG: number | null;
  gtin: string | null;
  tareWeightG: number | null;
  temperatureNozzleMinC: number | null;
  temperatureNozzleMaxC: number | null;
  temperatureBedMinC: number | null;
  temperatureBedMaxC: number | null;
  finish: string | null;
  confidence: string;
}

export const FilabaseRepository = {
  findByGtin(gtin: string): FilabaseEntry | null {
    const db = getFilabaseDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM filabase_entries WHERE gtin = ? LIMIT 1`,
      [gtin]
    );
    if (rows.length === 0) return null;
    return rowToEntry(rows[0]);
  },

  searchByName(query: string): FilabaseEntry[] {
    const db = getFilabaseDb();
    const like = `%${query}%`;
    const rows = db.getAllSync<any>(
      `SELECT * FROM filabase_entries
       WHERE brand_name LIKE ? OR filament_name LIKE ? OR variant_name LIKE ?
       ORDER BY confidence DESC
       LIMIT 50`,
      [like, like, like]
    );
    return rows.map(rowToEntry);
  },

  findByColor(colorHex: string): FilabaseEntry[] {
    const db = getFilabaseDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM filabase_entries WHERE color_hex = ? LIMIT 20`,
      [colorHex]
    );
    return rows.map(rowToEntry);
  },
};

function rowToEntry(row: any): FilabaseEntry {
  return {
    canonicalKey: row.canonical_key,
    brandName: row.brand_name,
    filamentName: row.filament_name,
    material: row.material,
    variantName: row.variant_name,
    colorHex: row.color_hex,
    diameterMm: row.diameter_mm,
    netFilamentWeightG: row.net_filament_weight_g,
    gtin: row.gtin,
    tareWeightG: row.tare_weight_g,
    temperatureNozzleMinC: row.temperature_nozzle_min_c,
    temperatureNozzleMaxC: row.temperature_nozzle_max_c,
    temperatureBedMinC: row.temperature_bed_min_c,
    temperatureBedMaxC: row.temperature_bed_max_c,
    finish: row.finish,
    confidence: row.confidence,
  };
}
