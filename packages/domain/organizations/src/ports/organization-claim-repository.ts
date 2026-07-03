import type { RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { OrganizationClaim } from "../entities/organization-claim.ts"

export class OrganizationClaimRepository extends Context.Service<
  OrganizationClaimRepository,
  {
    save: (claim: OrganizationClaim) => Effect.Effect<void, RepositoryError, SqlClient>
    /** Look up a claim by token hash. Cross-org (admin client) — the org isn't known until found. */
    findByTokenHash: (tokenHash: string) => Effect.Effect<OrganizationClaim | null, RepositoryError, SqlClient>
    /** Stamp `claimed_at` by id (admin/cross-org). */
    markClaimed: (id: string, claimedAt: Date) => Effect.Effect<void, RepositoryError, SqlClient>
  }
>()("@domain/organizations/OrganizationClaimRepository") {}
