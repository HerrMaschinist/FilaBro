/**
 * src/core/domain/index.ts
 *
 * Public API of the core domain layer.
 * Only pure business types — no sync, no DB, no HTTP, no native imports.
 */
export type { Manufacturer } from "./manufacturer";
export type { Filament } from "./filament";
export type { Spool, SpoolView } from "./spool";
