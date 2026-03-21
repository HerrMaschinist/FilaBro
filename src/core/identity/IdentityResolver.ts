import { IAliasRepository } from "./IAliasRepository";
import {
  CodeType,
  ResolveResult,
  SpoolIdentity,
  CatalogHint,
  Candidate,
  ScanAlias,
} from "./types";
import { ScoringEngine } from "./ScoringEngine";
import { ConflictDetector } from "./ConflictDetector";

function buildId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function createIdentityResolver(repo: IAliasRepository) {
  function learn(
    rawCode: string,
    codeType: CodeType,
    spoolLocalId: string,
    confidence: number,
    confirmedByUser: boolean
  ): void {
    const existing = repo.findByRawCode(rawCode).find(a => a.spoolLocalId === spoolLocalId);
    const now = Date.now();
    if (existing) {
      repo.updateLastSeen(existing.id, now);
      if (confirmedByUser && !existing.confirmedByUser) {
        repo.confirm(existing.id);
      }
    } else {
      repo.save({
        rawCode,
        spoolLocalId,
        codeType,
        confidence,
        confirmedByUser,
        createdAt: now,
        lastSeenAt: now,
      });
    }
  }

  function resolve(
    rawCode: string,
    codeType: CodeType,
    spools: SpoolIdentity[] = [],
    catalogLookup?: (gtin: string) => CatalogHint | null
  ): ResolveResult {
    const candidates: Candidate[] = [];

    // ── STUFE 1: Direkter Spulen-Treffer ────────────────────────────────────
    for (const spool of spools) {
      if (spool.qrCode && spool.qrCode === rawCode) {
        const conf = ScoringEngine.fromDirectMatch("qrCode");
        learn(rawCode, codeType, spool.localId, conf.score, true);
        return {
          status: "exact",
          matchedSpoolId: spool.localId,
          candidates: [{ spoolLocalId: spool.localId, confidence: conf, reasons: conf.reasons }],
          reasons: conf.reasons,
          rawCode,
          codeType,
        };
      }
      if (spool.nfcTagId && spool.nfcTagId === rawCode) {
        const conf = ScoringEngine.fromDirectMatch("nfcTagId");
        learn(rawCode, codeType, spool.localId, conf.score, true);
        return {
          status: "exact",
          matchedSpoolId: spool.localId,
          candidates: [{ spoolLocalId: spool.localId, confidence: conf, reasons: conf.reasons }],
          reasons: conf.reasons,
          rawCode,
          codeType,
        };
      }
    }

    // ── STUFE 2: Alias-Lookup ────────────────────────────────────────────────
    const aliases = repo.findByRawCode(rawCode);
    const now = Date.now();
    const MS_PER_DAY = 86400000;

    for (const alias of aliases) {
      const daysAgo = Math.round((now - alias.lastSeenAt) / MS_PER_DAY);
      const histConf = ScoringEngine.fromScanHistory(1, daysAgo);
      const score = alias.confirmedByUser ? Math.max(alias.confidence, histConf.score) : histConf.score;
      const reasons: string[] = alias.confirmedByUser
        ? ["Vom Nutzer bestätigt", ...histConf.reasons]
        : histConf.reasons;
      const confidence = { score, level: ScoringEngine.toLevel(score), reasons };
      candidates.push({ spoolLocalId: alias.spoolLocalId, confidence, reasons });
    }

    // ── STUFE 3: Katalog-Lookup ──────────────────────────────────────────────
    if (catalogLookup && codeType === "barcode") {
      const hint = catalogLookup(rawCode);
      if (hint) {
        for (const spool of spools) {
          const materialMatch = !!hint.material && !!spool.material &&
            hint.material.toLowerCase() === spool.material.toLowerCase();
          const weightMatch = !!hint.weightG && !!spool.weight &&
            Math.abs(hint.weightG - spool.weight) < 50;
          const conf = ScoringEngine.fromCatalogMatch(true, materialMatch, weightMatch);
          if (conf.score >= 40) {
            const existing = candidates.find(c => c.spoolLocalId === spool.localId);
            if (existing) {
              existing.confidence = ScoringEngine.merge(existing.confidence, conf);
              existing.reasons = existing.confidence.reasons;
            } else {
              candidates.push({ spoolLocalId: spool.localId, confidence: conf, reasons: conf.reasons });
            }
          }
        }
      }
    }

    // ── STUFE 4: Levenshtein-Ähnlichkeit ────────────────────────────────────
    const allKnownAliases: ScanAlias[] = [];
    for (const spool of spools) {
      const sa = repo.findBySpoolLocalId(spool.localId);
      allKnownAliases.push(...sa);
    }
    const seen = new Set<string>();
    for (const known of allKnownAliases) {
      if (known.rawCode === rawCode) continue;
      const key = known.spoolLocalId + "|" + known.rawCode;
      if (seen.has(key)) continue;
      seen.add(key);
      const maxLen = Math.max(rawCode.length, known.rawCode.length);
      const dist = ScoringEngine.levenshtein(rawCode, known.rawCode);
      const conf = ScoringEngine.fromLevenshtein(dist, maxLen);
      if (conf.score >= 30) {
        const existing = candidates.find(c => c.spoolLocalId === known.spoolLocalId);
        if (existing) {
          existing.confidence = ScoringEngine.merge(existing.confidence, conf);
          existing.reasons = existing.confidence.reasons;
        } else {
          candidates.push({ spoolLocalId: known.spoolLocalId, confidence: conf, reasons: conf.reasons });
        }
      }
    }

    // ── Sortieren ────────────────────────────────────────────────────────────
    candidates.sort((a, b) => b.confidence.score - a.confidence.score);

    if (candidates.length === 0) {
      return { status: "unknown", matchedSpoolId: null, candidates: [], reasons: ["Kein passender Code gefunden"], rawCode, codeType };
    }

    // ── Konflikt-Erkennung ───────────────────────────────────────────────────
    const conflict = ConflictDetector.detect(candidates);
    if (conflict) {
      return { status: "conflict", matchedSpoolId: null, candidates, reasons: [conflict], rawCode, codeType };
    }

    // ── Exact vs. Candidate ──────────────────────────────────────────────────
    const best = candidates[0];
    if (best.confidence.score >= 85 && candidates.filter(c => c.confidence.score >= 70).length === 1) {
      return { status: "exact", matchedSpoolId: best.spoolLocalId, candidates, reasons: best.reasons, rawCode, codeType };
    }

    return { status: "candidate", matchedSpoolId: null, candidates, reasons: best.reasons, rawCode, codeType };
  }

  return { resolve, learn };
}
