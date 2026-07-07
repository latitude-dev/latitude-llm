import { Effect } from "effect"
import type { OrganizationClaim } from "../entities/organization-claim.ts"
import type { OrganizationClaimRepository } from "../ports/organization-claim-repository.ts"

type OrganizationClaimRepositoryShape = (typeof OrganizationClaimRepository)["Service"]

export const createFakeOrganizationClaimRepository = (overrides?: Partial<OrganizationClaimRepositoryShape>) => {
  const claims: OrganizationClaim[] = []

  const repository: OrganizationClaimRepositoryShape = {
    save: (claim) =>
      Effect.sync(() => {
        claims.push(claim)
      }),

    findByTokenHash: (tokenHash) => Effect.sync(() => claims.find((c) => c.tokenHash === tokenHash) ?? null),

    findByTokenHashForUpdate: (tokenHash) => Effect.sync(() => claims.find((c) => c.tokenHash === tokenHash) ?? null),

    markClaimed: (id, claimedAt) =>
      Effect.sync(() => {
        const claim = claims.find((c) => c.id === id)
        if (!claim || claim.claimedAt !== null) return false
        claim.claimedAt = claimedAt
        return true
      }),

    ...overrides,
  }

  return { repository, claims }
}
