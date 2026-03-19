/**
 * src/core/application/SpoolListUseCase.ts
 *
 * Phase 5 — Read-side use case for spool listing.
 *
 * Provides:
 *   - listSpoolsPage(page, pageSize) — paginated read, backed by JOIN query
 *   - getTotalSpoolCount()           — for pagination UI
 *   - findByQrCode(qr)              — indexed QR code lookup
 *   - findByNfcTagId(tagId)         — indexed NFC tag lookup
 *
 * All methods delegate directly to SpoolRepository which performs single
 * JOIN queries (no N+1). Suitable for 1000+ spools.
 */
import { SpoolRepository } from "@/src/data/repositories/SpoolRepository";
import type { SpoolView } from "@/src/core/domain/spool";

export const DEFAULT_PAGE_SIZE = 50;

export const SpoolListUseCase = {
  /**
   * Return one page of spools, ordered by lastModifiedAt DESC.
   * page is 0-indexed. pageSize defaults to 50.
   * excludes archived spools by default.
   */
  async listSpoolsPage(
    page: number,
    pageSize: number = DEFAULT_PAGE_SIZE,
    includeArchived = false
  ): Promise<SpoolView[]> {
    return SpoolRepository.getPagedView(page * pageSize, pageSize, includeArchived);
  },

  /**
   * Total number of non-archived spools.
   * Used to determine whether more pages exist.
   */
  async getTotalSpoolCount(includeArchived = false): Promise<number> {
    return SpoolRepository.countSpools(includeArchived);
  },

  /**
   * Find a spool by its stored qr_code value.
   * Returns null if not found or qr is empty.
   * Uses idx_spools_qr_code index.
   */
  async findByQrCode(qr: string): Promise<SpoolView | null> {
    if (!qr || !qr.trim()) return null;
    return SpoolRepository.findByQrCode(qr.trim());
  },

  /**
   * Find a spool by its stored nfc_tag_id value.
   * Returns null if not found or tagId is empty.
   * Uses idx_spools_nfc_tag_id index.
   */
  async findByNfcTagId(tagId: string): Promise<SpoolView | null> {
    if (!tagId || !tagId.trim()) return null;
    return SpoolRepository.findByNfcTagId(tagId.trim());
  },

  /**
   * Multi-match: return ALL spools with the given qr_code.
   * Scanner uses this to distinguish 0 / 1 / N results.
   * Existing findByQrCode() is not changed.
   */
  async findAllByQrCode(qr: string): Promise<SpoolView[]> {
    if (!qr || !qr.trim()) return [];
    return SpoolRepository.findAllByQrCode(qr.trim());
  },

  /**
   * Multi-match: return ALL spools with the given nfc_tag_id.
   */
  async findAllByNfcTagId(tagId: string): Promise<SpoolView[]> {
    if (!tagId || !tagId.trim()) return [];
    return SpoolRepository.findAllByNfcTagId(tagId.trim());
  },
};
