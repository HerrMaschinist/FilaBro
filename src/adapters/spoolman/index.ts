/**
 * src/adapters/spoolman/index.ts
 *
 * Phase 1: Re-exports the existing Spoolman HTTP client.
 * This is the concrete implementation of IExternalFilamentSystemPort.
 *
 * Future phases will add a mapper.ts here that converts
 * Spoolman DTOs to domain types, keeping domain clean of API shapes.
 */
export * as SpoolmanClient from "@/src/data/api/SpoolmanClient";
