import { getCatalogDb } from "@/src/data/db/catalog_client";

export interface CatalogVariant {
  id: string;
  filamentId: string;
  brandId: string;
  name: string;
  colorHex: string | null;
  traits: string | null;
}

export interface CatalogFilament {
  id: string;
  brandId: string;
  material: string;
  name: string;
  density: number | null;
  minPrintTemp: number | null;
  maxPrintTemp: number | null;
  minBedTemp: number | null;
  maxBedTemp: number | null;
}

export interface CatalogBrand {
  id: string;
  name: string;
  website: string | null;
  origin: string | null;
}

export interface CatalogSearchResult {
  variant: CatalogVariant;
  filament: CatalogFilament;
  brand: CatalogBrand;
}

export const CatalogRepository = {
  searchByColorHex(colorHex: string): CatalogSearchResult[] {
    const db = getCatalogDb();
    const rows = db.getAllSync<any>(
      `SELECT
        v.id as v_id, v.filament_id, v.brand_id as v_brand_id,
        v.name as v_name, v.color_hex, v.traits,
        f.id as f_id, f.brand_id as f_brand_id, f.material,
        f.name as f_name, f.density,
        f.min_print_temp, f.max_print_temp,
        f.min_bed_temp, f.max_bed_temp,
        b.id as b_id, b.name as b_name, b.website, b.origin
      FROM variants v
      JOIN filaments f ON v.filament_id = f.id
      JOIN brands b ON f.brand_id = b.id
      WHERE v.color_hex = ?`,
      [colorHex]
    );
    return rows.map(rowToSearchResult);
  },

  searchByName(query: string): CatalogSearchResult[] {
    const db = getCatalogDb();
    const like = `%${query}%`;
    const rows = db.getAllSync<any>(
      `SELECT
        v.id as v_id, v.filament_id, v.brand_id as v_brand_id,
        v.name as v_name, v.color_hex, v.traits,
        f.id as f_id, f.brand_id as f_brand_id, f.material,
        f.name as f_name, f.density,
        f.min_print_temp, f.max_print_temp,
        f.min_bed_temp, f.max_bed_temp,
        b.id as b_id, b.name as b_name, b.website, b.origin
      FROM variants v
      JOIN filaments f ON v.filament_id = f.id
      JOIN brands b ON f.brand_id = b.id
      WHERE v.name LIKE ? OR f.name LIKE ? OR b.name LIKE ?
      LIMIT 50`,
      [like, like, like]
    );
    return rows.map(rowToSearchResult);
  },

  getBrands(): CatalogBrand[] {
    const db = getCatalogDb();
    return db.getAllSync<CatalogBrand>(
      `SELECT id, name, website, origin FROM brands ORDER BY name`
    );
  },
};

function rowToSearchResult(row: any): CatalogSearchResult {
  return {
    variant: {
      id: row.v_id,
      filamentId: row.filament_id,
      brandId: row.v_brand_id,
      name: row.v_name,
      colorHex: row.color_hex,
      traits: row.traits,
    },
    filament: {
      id: row.f_id,
      brandId: row.f_brand_id,
      material: row.material,
      name: row.f_name,
      density: row.density,
      minPrintTemp: row.min_print_temp,
      maxPrintTemp: row.max_print_temp,
      minBedTemp: row.min_bed_temp,
      maxBedTemp: row.max_bed_temp,
    },
    brand: {
      id: row.b_id,
      name: row.b_name,
      website: row.website,
      origin: row.origin,
    },
  };
}
