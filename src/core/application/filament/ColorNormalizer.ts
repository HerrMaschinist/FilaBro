/**
 * src/core/application/filament/ColorNormalizer.ts
 *
 * Pure application-layer utility. No infra imports.
 * Accepts user color input (free text or hex) and returns the three
 * canonical color fields used by the Filament domain.
 */

export interface NormalizedColor {
  colorNameRaw?: string;
  colorNameNormalized?: string;
  colorHexNormalized?: string;
}

type ColorAlias = { name: string; hex: string; aliases: string[] };

const COLOR_ALIASES: ColorAlias[] = [
  { name: "Black",       hex: "#000000", aliases: ["black", "schwarz"] },
  { name: "White",       hex: "#FFFFFF", aliases: ["white", "weiß", "weiss"] },
  { name: "Gray",        hex: "#808080", aliases: ["gray", "grey", "grau"] },
  { name: "Red",         hex: "#FF0000", aliases: ["red", "rot"] },
  { name: "Green",       hex: "#00FF00", aliases: ["green", "grün", "grun"] },
  { name: "Blue",        hex: "#0000FF", aliases: ["blue", "blau"] },
  { name: "Yellow",      hex: "#FFFF00", aliases: ["yellow", "gelb"] },
  { name: "Orange",      hex: "#FFA500", aliases: ["orange"] },
  { name: "Purple",      hex: "#800080", aliases: ["purple", "lila", "violet", "violett"] },
  { name: "Pink",        hex: "#FFC0CB", aliases: ["pink"] },
  { name: "Brown",       hex: "#8B4513", aliases: ["brown", "braun"] },
  { name: "Natural",     hex: "#FFF8EE", aliases: ["natural", "natur", "transparent", "clear"] },
];

const HEX_PATTERN = /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

function normalizeHexStr(raw: string): string {
  const stripped = raw.startsWith("#") ? raw.slice(1) : raw;
  if (stripped.length === 3) {
    const [r, g, b] = stripped;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return `#${stripped.toUpperCase()}`;
}

/**
 * Normalise a user-provided color input string.
 *
 * Rules (in order):
 *  1. If it matches a hex pattern (#RGB or #RRGGBB, optional #), return colorHexNormalized only.
 *  2. If it matches an alias (any language), return colorNameNormalized + colorHexNormalized.
 *  3. Otherwise set colorNameRaw = trimmed input. normalized fields stay undefined.
 */
export function normalizeColor(input: string): NormalizedColor {
  const trimmed = input.trim();
  if (!trimmed) return {};

  if (HEX_PATTERN.test(trimmed)) {
    return {
      colorNameRaw: trimmed,
      colorHexNormalized: normalizeHexStr(trimmed),
    };
  }

  const lower = trimmed.toLowerCase();
  for (const entry of COLOR_ALIASES) {
    if (entry.aliases.includes(lower)) {
      return {
        colorNameRaw: trimmed,
        colorNameNormalized: entry.name,
        colorHexNormalized: entry.hex,
      };
    }
  }

  return { colorNameRaw: trimmed };
}
