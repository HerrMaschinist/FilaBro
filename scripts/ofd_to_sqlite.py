"""
ofd_to_sqlite.py
Converts the Open Filament Database JSON tree into a single SQLite file.

Source:  C:/Users/Alex/Documents/Projekte/open-filament-database/data/
Output:  C:/Users/Alex/Documents/Projekte/FilaBro 3/assets/ofd_catalog.db

No external dependencies — only Python stdlib.
"""

import json
import os
import sqlite3
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────────
OFD_DATA  = Path("C:/Users/Alex/Documents/Projekte/open-filament-database/data")
OUTPUT_DB = Path("C:/Users/Alex/Documents/Projekte/FilaBro 3/assets/ofd_catalog.db")

# ── Schema ─────────────────────────────────────────────────────────────────────
DDL = """
CREATE TABLE IF NOT EXISTS brands (
    id      TEXT PRIMARY KEY,
    name    TEXT NOT NULL,
    website TEXT,
    origin  TEXT
);

CREATE TABLE IF NOT EXISTS filaments (
    id                 TEXT PRIMARY KEY,
    brand_id           TEXT NOT NULL REFERENCES brands(id),
    material           TEXT NOT NULL,
    name               TEXT NOT NULL,
    density            REAL,
    diameter_tolerance REAL,
    min_print_temp     INTEGER,
    max_print_temp     INTEGER,
    min_bed_temp       INTEGER,
    max_bed_temp       INTEGER
);

CREATE TABLE IF NOT EXISTS variants (
    id          TEXT PRIMARY KEY,
    filament_id TEXT NOT NULL REFERENCES filaments(id),
    brand_id    TEXT NOT NULL,
    name        TEXT NOT NULL,
    color_hex   TEXT,
    traits      TEXT
);

CREATE INDEX IF NOT EXISTS idx_variants_color    ON variants(color_hex);
CREATE INDEX IF NOT EXISTS idx_filaments_brand   ON filaments(brand_id);
CREATE INDEX IF NOT EXISTS idx_filaments_material ON filaments(material);
"""

# ── Helpers ────────────────────────────────────────────────────────────────────
def read_json(path: Path) -> dict | None:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def safe_int(val) -> int | None:
    try:
        return int(val) if val is not None else None
    except (ValueError, TypeError):
        return None


def safe_float(val) -> float | None:
    try:
        return float(val) if val is not None else None
    except (ValueError, TypeError):
        return None


def first_hex(color_hex) -> str | None:
    """variant.color_hex can be a string or a list — normalise to one #RRGGBB."""
    if color_hex is None:
        return None
    if isinstance(color_hex, list):
        return color_hex[0] if color_hex else None
    return str(color_hex)


# ── Main ───────────────────────────────────────────────────────────────────────
def main() -> None:
    OUTPUT_DB.parent.mkdir(parents=True, exist_ok=True)

    # Fresh database each run
    if OUTPUT_DB.exists():
        OUTPUT_DB.unlink()

    con = sqlite3.connect(OUTPUT_DB)
    con.executescript(DDL)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=NORMAL")

    n_brands = n_filaments = n_variants = 0
    errors = []

    brand_dirs = sorted(p for p in OFD_DATA.iterdir() if p.is_dir())

    for brand_dir in brand_dirs:
        # ── Brand ──────────────────────────────────────────────────────────────
        brand_json = read_json(brand_dir / "brand.json")
        if brand_json is None:
            continue

        brand_id = brand_json.get("id") or brand_dir.name
        con.execute(
            "INSERT OR IGNORE INTO brands (id, name, website, origin) VALUES (?,?,?,?)",
            (
                brand_id,
                brand_json.get("name", brand_id),
                brand_json.get("website"),
                brand_json.get("origin"),
            ),
        )
        n_brands += 1

        # ── Material folders (PLA, PETG, ABS, …) ──────────────────────────────
        for material_dir in sorted(p for p in brand_dir.iterdir() if p.is_dir()):
            material_slug = material_dir.name  # e.g. "PLA"

            # ── Filament folders inside material ───────────────────────────────
            for filament_dir in sorted(p for p in material_dir.iterdir() if p.is_dir()):
                filament_json = read_json(filament_dir / "filament.json")
                if filament_json is None:
                    continue

                filament_slug = filament_json.get("id") or filament_dir.name
                filament_id   = f"{brand_id}__{material_slug}__{filament_slug}"

                con.execute(
                    """INSERT OR IGNORE INTO filaments
                       (id, brand_id, material, name,
                        density, diameter_tolerance,
                        min_print_temp, max_print_temp,
                        min_bed_temp,   max_bed_temp)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (
                        filament_id,
                        brand_id,
                        material_slug,
                        filament_json.get("name", filament_slug),
                        safe_float(filament_json.get("density")),
                        safe_float(filament_json.get("diameter_tolerance")),
                        safe_int(filament_json.get("min_print_temperature")),
                        safe_int(filament_json.get("max_print_temperature")),
                        safe_int(filament_json.get("min_bed_temperature")),
                        safe_int(filament_json.get("max_bed_temperature")),
                    ),
                )
                n_filaments += 1

                # ── Variant folders inside filament ────────────────────────────
                for variant_dir in sorted(p for p in filament_dir.iterdir() if p.is_dir()):
                    variant_json = read_json(variant_dir / "variant.json")
                    if variant_json is None:
                        continue

                    variant_slug = variant_json.get("id") or variant_dir.name
                    variant_id   = f"{filament_id}__{variant_slug}"

                    traits = variant_json.get("traits")
                    traits_str = json.dumps(traits, separators=(",", ":")) if traits else None

                    con.execute(
                        """INSERT OR IGNORE INTO variants
                           (id, filament_id, brand_id, name, color_hex, traits)
                           VALUES (?,?,?,?,?,?)""",
                        (
                            variant_id,
                            filament_id,
                            brand_id,
                            variant_json.get("name", variant_slug),
                            first_hex(variant_json.get("color_hex")),
                            traits_str,
                        ),
                    )
                    n_variants += 1

        if n_brands % 50 == 0:
            print(f"  ... {n_brands} brands processed so far")
            con.commit()

    con.commit()
    con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    con.close()

    size_kb = OUTPUT_DB.stat().st_size // 1024
    print()
    print(f"Done.")
    print(f"  Brands:    {n_brands:,}")
    print(f"  Filaments: {n_filaments:,}")
    print(f"  Variants:  {n_variants:,}")
    print(f"  DB size:   {size_kb:,} KB  ({OUTPUT_DB})")

    if errors:
        print(f"\n  Errors ({len(errors)}):")
        for e in errors[:10]:
            print(f"    {e}")


if __name__ == "__main__":
    main()
