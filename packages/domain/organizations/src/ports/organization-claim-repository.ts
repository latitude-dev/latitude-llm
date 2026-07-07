import type { RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { OrganizationClaim } from "../entities/organization-claim.ts"

export class OrganizationClaimRepository extends Context.Service<
  OrganizationClaimRepository,
  {
    save: (claim: OrganizationClaim) => Effect.Effect<void, RepositoryError, SqlClient>
    /** Look up a claim by token hash. Cross-org (admin client) — the org isn't known until found. */
    findByTokenHash: (tokenHash: string) => Effect.Effect<OrganizationClaim | null, RepositoryError, SqlClient>
    /** Same as `findByTokenHash`, but row-locks the claim for redemption serialization. */
    findByTokenHashForUpdate: (tokenHash: string) => Effect.Effect<OrganizationClaim | null, RepositoryError, SqlClient>
    /** Stamp `claimed_at` when still pending. Returns false when another redeemer won the race. */
    markClaimed: (id: string, claimedAt: Date) => Effect.Effect<boolean, RepositoryError, SqlClient>
  }
>()("@domain/organizations/OrganizationClaimRepository") {}
