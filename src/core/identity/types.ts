export type CodeType = "barcode" | "nfc" | "qr" | "uuid";
export type ResolveStatus = "exact" | "candidate" | "unknown" | "conflict";
export type ConfidenceLevel = "low" | "medium" | "high";

export interface Confidence {
  score: number; // 0-100
  level: ConfidenceLevel;
  reasons: string[];
}

export interface ScanAlias {
  id: string;
  rawCode: string;
  spoolLocalId: string;
  codeType: CodeType;
  confidence: number;
  confirmedByUser: boolean;
  createdAt: number;
  lastSeenAt: number;
}

export interface Candidate {
  spoolLocalId: string;
  confidence: Confidence;
  reasons: string[];
}

export interface ResolveResult {
  status: ResolveStatus;
  matchedSpoolId: string | null;
  candidates: Candidate[];
  reasons: string[];
  rawCode: string;
  codeType: CodeType;
}

export interface SpoolIdentity {
  localId: string;
  qrCode?: string;
  nfcTagId?: string;
  material?: string;
  weight?: number;
  displayName?: string;
}

export interface CatalogHint {
  material?: string;
  weightG?: number;
  brandName?: string;
}
