import { createIdentityResolver } from "./IdentityResolver";
import { SqliteAliasRepository } from "@/src/data/identity/SqliteAliasRepository";
export const identityResolver = createIdentityResolver(SqliteAliasRepository);
