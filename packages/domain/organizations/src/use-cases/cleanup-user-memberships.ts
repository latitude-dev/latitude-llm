import type { RepositoryError, SqlClient } from "@domain/shared"
import type { Effect } from "effect"
import { Effect as E } from "effect"
import { MembershipRepository } from "../ports/membership-repository.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"

export interface CleanupUserMembershipsInput {
  readonly userId: string
}

export const cleanupUserMembershipsUseCase = (
  input: CleanupUserMembershipsInput,
): Effect.Effect<void, RepositoryError, MembershipRepository | OrganizationRepository | SqlClient> =>
  E.gen(function* () {
    yield* E.annotateCurrentSpan("userId", input.userId)

    const membershipRepo = yield* MembershipRepository
    const orgRepo = yield* OrganizationRepository

    const memberships = yield* membershipRepo.listByUserId(input.userId)

    for (const membership of memberships) {
      const orgMembers = yield* membershipRepo.listByOrganizationId(membership.organizationId)

      if (orgMembers.length === 1) {
        // User is the sole member — delete the organization (cascades to membership)
        yield* orgRepo.delete(membership.organizationId)
      } else {
        yield* membershipRepo.delete(membership.id)
      }
    }
  }).pipe(E.withSpan("organizations.cleanupUserMemberships"))
