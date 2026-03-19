import csv
import sqlite3
from pathlib import Path

CSV_PATH = Path(__file__).parent / "filament_master_v2.csv"
DB_PATH = Path(__file__).parent.parent / "assets" / "filabase_catalog.db"

conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

c.executescript("""
CREATE TABLE IF NOT EXISTS filabase_entries (
  canonical_key TEXT PRIMARY KEY,
  brand_name TEXT,
  filament_name TEXT,
  material TEXT,
  variant_name TEXT,
  color_hex TEXT,
  diameter_mm REAL,
  net_filament_weight_g REAL,
  gtin TEXT,
  scan_status TEXT,
  tare_weight_g REAL,
  temperature_nozzle_min_c REAL,
  temperature_nozzle_max_c REAL,
  temperature_bed_min_c REAL,
  temperature_bed_max_c REAL,
  finish TEXT,
  transparency TEXT,
  special_traits TEXT,
  confidence TEXT,
  needs_review INTEGER
);
CREATE INDEX IF NOT EXISTS idx_gtin ON filabase_entries(gtin);
CREATE INDEX IF NOT EXISTS idx_brand ON filabase_entries(brand_name);
CREATE INDEX IF NOT EXISTS idx_material ON filabase_entries(material);
CREATE INDEX IF NOT EXISTS idx_color ON filabase_entries(color_hex);
""")

def safe_float(val):
    try: return float(val) if val and val.strip() else None
    except: return None

def safe_int(val):
    try: return int(val.strip().lower() in ("true","1","yes")) if val else 0
    except: return 0

count = 0
with open(CSV_PATH, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        c.execute("""
            INSERT OR IGNORE INTO filabase_entries VALUES (
              ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
            )
        """, (
            row.get("canonical_key",""),
            row.get("brand_name",""),
            row.get("filament_name",""),
            row.get("material",""),
            row.get("variant_name",""),
            row.get("color_hex","") or None,
            safe_float(row.get("diameter_mm")),
            safe_float(row.get("net_filament_weight_g")),
            row.get("gtin","") or None,
            row.get("scan_status",""),
            safe_float(row.get("tare_weight_g")),
            safe_float(row.get("temperature_nozzle_min_c")),
            safe_float(row.get("temperature_nozzle_max_c")),
            safe_float(row.get("temperature_bed_min_c")),
            safe_float(row.get("temperature_bed_max_c")),
            row.get("finish","") or None,
            row.get("transparency","") or None,
            row.get("special_traits","") or None,
            row.get("confidence",""),
            safe_int(row.get("needs_review")),
        ))
        count += 1

conn.commit()
conn.close()
print(f"Importiert: {count} Einträge")
print(f"DB-Größe: {DB_PATH.stat().st_size // 1024} KB")
