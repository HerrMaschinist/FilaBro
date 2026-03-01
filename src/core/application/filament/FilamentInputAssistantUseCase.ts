/**
 * src/core/application/filament/FilamentInputAssistantUseCase.ts
 *
 * Rule-based (no AI) filament product text parser.
 * Parses free-text product descriptions into structured suggestions.
 *
 * Input example:  "Maertz PLA Pro schwarz 1.75 1kg"
 * Output example: { manufacturer: "Maertz", material: "PLA", color: "schwarz",
 *                   diameter: 1.75, weight: 1000, confidence: 0.85 }
 *
 * Pure application layer — no infrastructure imports.
 * Results are SUGGESTIONS only and must never be written directly.
 */

export interface FilamentSuggestion {
  manufacturer?: string;
  material?: string;
  color?: string;
  diameter?: number;
  weightGrams?: number;
  confidence: number;
}

const KNOWN_MATERIALS = [
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
];

const KNOWN_DIAMETERS = [1.75, 2.85, 3.0];

const COLOR_ALIASES: Record<string, string> = {
  schwarz: "schwarz",
  black: "schwarz",
  weiß: "weiß",
  weiss: "weiß",
  white: "weiß",
  grau: "grau",
  gray: "grau",
  grey: "grau",
  rot: "rot",
  red: "rot",
  grün: "grün",
  grun: "grün",
  green: "grün",
  blau: "blau",
  blue: "blau",
  gelb: "gelb",
  yellow: "gelb",
  orange: "orange",
  lila: "lila",
  purple: "lila",
  violet: "lila",
  violett: "lila",
  pink: "pink",
  braun: "braun",
  brown: "braun",
  natural: "natural",
  natur: "natural",
  transparent: "transparent",
  clear: "transparent",
};

const HEX_RE = /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

/**
 * Parse a free-text filament product description.
 * Returns a FilamentSuggestion with a confidence score [0–1].
 * Caller must decide whether to use the suggestions; nothing is written.
 */
export function parseFilamentInput(input: string): FilamentSuggestion {
  if (!input.trim()) return { confidence: 0 };

  const tokens = input
    .trim()
    .split(/\s+/)
    .map((t) => t.toLowerCase());

  let material: string | undefined;
  let color: string | undefined;
  let diameter: number | undefined;
  let weightGrams: number | undefined;
  const manufacturerTokens: string[] = [];

  let matchCount = 0;
  const usedIndices = new Set<number>();

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const upper = token.toUpperCase();

    if (KNOWN_MATERIALS.includes(upper) && !material) {
      material = upper;
      usedIndices.add(i);
      matchCount++;
      continue;
    }

    const colorKey = token.replace(/[^a-züäöß]/g, "");
    if (COLOR_ALIASES[colorKey] && !color) {
      color = tokens[i];
      usedIndices.add(i);
      matchCount++;
      continue;
    }

    if (HEX_RE.test(token) && !color) {
      color = token.startsWith("#") ? token : `#${token}`;
      usedIndices.add(i);
      matchCount++;
      continue;
    }

    const diameterMatch = token.match(/^(\d+[.,]\d+)(mm)?$/);
    if (diameterMatch && !diameter) {
      const val = parseFloat(diameterMatch[1].replace(",", "."));
      const nearest = KNOWN_DIAMETERS.find((d) => Math.abs(d - val) < 0.1);
      if (nearest) {
        diameter = nearest;
        usedIndices.add(i);
        matchCount++;
        continue;
      }
    }

    const weightKgMatch = token.match(/^(\d+(?:[.,]\d+)?)\s*kg$/i);
    if (weightKgMatch && !weightGrams) {
      weightGrams = Math.round(parseFloat(weightKgMatch[1].replace(",", ".")) * 1000);
      usedIndices.add(i);
      matchCount++;
      continue;
    }

    const weightGMatch = token.match(/^(\d+)\s*g$/i);
    if (weightGMatch && !weightGrams) {
      weightGrams = parseInt(weightGMatch[1], 10);
      usedIndices.add(i);
      matchCount++;
      continue;
    }

    const bareKgMatch = token.match(/^(\d+)kg$/i);
    if (bareKgMatch && !weightGrams) {
      weightGrams = parseInt(bareKgMatch[1], 10) * 1000;
      usedIndices.add(i);
      matchCount++;
      continue;
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    if (!usedIndices.has(i) && tokens[i].length > 1) {
      const raw = input.trim().split(/\s+/)[i];
      if (raw && /^[A-ZÄÖÜ]/.test(raw)) {
        manufacturerTokens.push(raw);
      }
    }
  }

  const manufacturer =
    manufacturerTokens.length > 0 ? manufacturerTokens.join(" ") : undefined;

  const confidence =
    tokens.length === 0
      ? 0
      : Math.min(1, matchCount / Math.min(tokens.length, 4));

  return {
    manufacturer,
    material,
    color,
    diameter,
    weightGrams,
    confidence: Math.round(confidence * 100) / 100,
  };
}
