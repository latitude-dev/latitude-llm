import type { OrganizationId, RepositoryError } from "@domain/shared"
import { type CryptoError, hash, randomToken } from "@repo/utils"
import { Effect } from "effect"
import { createOrganizationClaim } from "../entities/organization-claim.ts"
import { OrganizationClaimRepository } from "../ports/organization-claim-repository.ts"

/** Claim token length: a 64-char hex secret (256 bits of entropy). */
const CLAIM_TOKEN_LENGTH = 64

export interface GenerateOrganizationClaimInput {
  readonly organizationId: OrganizationId
  readonly email: string | null
  readonly expiresAt: Date
  readonly webUrl: string
}

export interface GenerateOrganizationClaimResult {
  readonly token: string
  readonly claimUrl: string
}

export type GenerateOrganizationClaimError = RepositoryError | CryptoError

// Mints a claim token + saves the claim (hash only); returns the token + claim URL.
// Runs within the caller's transaction/`SqlClient`; opens none of its own.
export const generateOrganizationClaimUseCase = Effect.fn("organizations.generateOrganizationClaim")(function* (
  input: GenerateOrganizationClaimInput,
) {
  const claimRepo = yield* OrganizationClaimRepository

  const token = randomToken(CLAIM_TOKEN_LENGTH)
  const tokenHash = yield* hash(token)

  yield* claimRepo.save(
    createOrganizationClaim({
      organizationId: input.organizationId,
      tokenHash,
      email: input.email,
      expiresAt: input.expiresAt,
    }),
  )

  const claimUrl = `${input.webUrl.replace(/\/+$/, "")}/claim/${token}`

  return { token, claimUrl } satisfies GenerateOrganizationClaimResult
})
