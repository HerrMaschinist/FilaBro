import type { ScanAlias } from "./types";

export interface IAliasRepository {
  findByRawCode(rawCode: string): ScanAlias[];
  findBySpoolLocalId(spoolLocalId: string): ScanAlias[];
  save(alias: Omit<ScanAlias, "id">): ScanAlias;
  confirm(id: string): void;
  updateLastSeen(id: string, lastSeenAt: number): void;
  deleteBySpoolLocalId(spoolLocalId: string): void;
}
