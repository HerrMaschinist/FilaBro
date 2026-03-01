/**
 * src/adapters/sqlite/index.ts
 *
 * Phase 1: Re-exports existing SQLite repository implementations.
 * These are the concrete implementations of the ISpoolRepository,
 * IFilamentRepository, and IManufacturerRepository port contracts.
 *
 * Future phases will move the implementations directly into this adapter
 * and remove the src/data/repositories/ originals.
 */
export { SpoolRepository } from "@/src/data/repositories/SpoolRepository";
export { FilamentRepository } from "@/src/data/repositories/FilamentRepository";
export { ManufacturerRepository } from "@/src/data/repositories/ManufacturerRepository";
export { isPersistenceEnabled } from "@/src/data/db/client";
