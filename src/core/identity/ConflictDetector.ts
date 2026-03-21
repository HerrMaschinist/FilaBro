import type { ScanAlias, Candidate } from "./types";

export interface ConflictResult {
  hasConflict: boolean;
  conflictingAliases: ScanAlias[];
  reason: string | null;
}

export const ConflictDetector = {
  check(rawCode: string, aliases: ScanAlias[]): ConflictResult {
    const confirmed = aliases.filter((a) => a.confirmedByUser);
    if (confirmed.length > 1) {
      return {
        hasConflict: true,
        conflictingAliases: confirmed,
        reason: `Code "${rawCode}" ist ${confirmed.length} verschiedenen Spulen zugeordnet.`,
      };
    }
    return { hasConflict: false, conflictingAliases: [], reason: null };
  },

  detect(candidates: Candidate[]): string | null {
    const highScorers = candidates.filter(c => c.confidence.score >= 70);
    if (highScorers.length >= 2) {
      return `Dieser Code könnte zu ${highScorers.length} verschiedenen Spulen gehören.`;
    }
    return null;
  },
};
