import { OutboxEventWriter } from "@domain/events"
import {
  type ConcurrentSqlTransactionError,
  type OrganizationId,
  type RepositoryError,
  SqlClient,
  toRepositoryError,
  type UserId,
} from "@domain/shared"
import { type CryptoError, hash } from "@repo/utils"
import { Effect } from "effect"
import { createMembership } from "../entities/membership.ts"
import {
  ClaimAlreadyUsedError,
  ClaimExpiredError,
  ClaimTokenInvalidError,
  OrganizationNotClaimableError,
} from "../errors.ts"
import { MembershipRepository } from "../ports/membership-repository.ts"
import { OrganizationClaimRepository } from "../ports/organization-claim-repository.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"

export interface ClaimOrganizationInput {
  readonly token: string
  readonly userId: UserId
}

export interface ClaimOrganizationResult {
  readonly organization: { readonly id: string; readonly slug: string }
}

export type ClaimOrganizationError =
  | RepositoryError
  | ConcurrentSqlTransactionError
  | CryptoError
  | ClaimTokenInvalidError
  | ClaimExpiredError
  | ClaimAlreadyUsedError
  | OrganizationNotClaimableError

// Makes the caller owner of the temp org, clears `expires_at`, consumes the claim.
// Runs under the admin client (RLS bypass) since the caller isn't a member yet.
export const claimOrganizationUseCase = Effect.fn("organizations.claimOrganization")(function* (
  input: ClaimOrganizationInput,
) {
  const sqlClient = yield* SqlClient
  const tokenHash = yield* hash(input.token)

  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const claimRepo = yield* OrganizationClaimRepository
      const organizationRepo = yield* OrganizationRepository
      const membershipRepo = yield* MembershipRepository
      const outboxEventWriter = yield* OutboxEventWriter

      const claim = yield* claimRepo.findByTokenHashForUpdate(tokenHash)
      if (!claim) return yield* new ClaimTokenInvalidError()
      if (claim.claimedAt !== null) return yield* new ClaimAlreadyUsedError()
      if (claim.expiresAt.getTime() <= Date.now()) return yield* new ClaimExpiredError()

      const organizationId = claim.organizationId as OrganizationId
      yield* Effect.annotateCurrentSpan("organization.id", organizationId)

      const organization = yield* organizationRepo
        .findById(organizationId)
        .pipe(Effect.catchTag("NotFoundError", () => Effect.fail(new OrganizationNotClaimableError())))

      // Only a still-pending temp org (expires_at set + future) is claimable.
      if (organization.expiresAt === null || organization.expiresAt.getTime() <= Date.now()) {
        return yield* new OrganizationNotClaimableError()
      }

      // Anti-theft: never adopt an org that already has anyone in it.
      const members = yield* membershipRepo.listByOrganizationId(organizationId)
      if (members.length > 0) return yield* new OrganizationNotClaimableError()

      yield* membershipRepo.save(createMembership({ organizationId, userId: input.userId, role: "owner" }))
      yield* organizationRepo.save({ ...organization, expiresAt: null })
      yield* claimRepo.markClaimed(claim.id, new Date())

      // Background sample-project seeding (domain-events worker) so the claimed org matches a normal one.
      yield* outboxEventWriter
        .write({
          eventName: "OrganizationClaimed",
          aggregateType: "organization",
          aggregateId: organizationId,
          organizationId,
          payload: { organizationId, ownerUserId: input.userId },
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "write")))

      return {
        organization: { id: organization.id as string, slug: organization.slug },
      } satisfies ClaimOrganizationResult
    }),
  )
})
