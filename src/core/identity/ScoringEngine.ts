import { Confidence, ConfidenceLevel } from "./types";

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export const ScoringEngine = {
  toLevel(score: number): ConfidenceLevel {
    if (score >= 80) return "high";
    if (score >= 50) return "medium";
    return "low";
  },

  fromDirectMatch(matchType: "qrCode" | "nfcTagId" | "barcode"): Confidence {
    const map = {
      qrCode:   { score: 95, reason: "Direkter QR-Code-Treffer" },
      nfcTagId: { score: 98, reason: "Direkter NFC-Tag-Treffer" },
      barcode:  { score: 90, reason: "Direkter Barcode-Treffer" },
    };
    const { score, reason } = map[matchType];
    return { score, level: this.toLevel(score), reasons: [reason] };
  },

  fromCatalogMatch(hasGtin: boolean, materialMatch: boolean, weightMatch: boolean): Confidence {
    let score = 40;
    const reasons: string[] = [];
    if (hasGtin)       { score += 30; reasons.push("GTIN im Katalog gefunden"); }
    if (materialMatch) { score += 15; reasons.push("Material stimmt überein"); }
    if (weightMatch)   { score += 10; reasons.push("Gewicht stimmt überein"); }
    score = Math.min(score, 95);
    if (reasons.length === 0) reasons.push("Katalog-Treffer");
    return { score, level: this.toLevel(score), reasons };
  },

  fromScanHistory(scanCount: number, lastSeenDaysAgo: number): Confidence {
    let score = 30 + Math.min(scanCount * 5, 30) - Math.min(lastSeenDaysAgo * 2, 20);
    score = Math.max(0, Math.min(score, 60));
    return {
      score,
      level: this.toLevel(score),
      reasons: [`${scanCount}× gescannt, zuletzt vor ${lastSeenDaysAgo} Tag(en)`],
    };
  },

  fromLevenshtein(distance: number, maxLength: number): Confidence {
    const ratio = maxLength === 0 ? 0 : 1 - distance / maxLength;
    const score = Math.round(ratio * 60);
    const pct = Math.round(ratio * 100);
    return {
      score,
      level: score >= 45 ? "medium" : "low",
      reasons: [`Ähnlicher Code (Ähnlichkeit: ${pct}%)`],
    };
  },

  levenshtein,

  merge(a: Confidence, b: Confidence): Confidence {
    const score = Math.min(100, a.score + b.score);
    return { score, level: this.toLevel(score), reasons: [...a.reasons, ...b.reasons] };
  },
};
