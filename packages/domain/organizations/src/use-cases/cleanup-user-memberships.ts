import type { OrganizationId, RepositoryError, SqlClient } from "@domain/shared"
import type { Effect } from "effect"
import { Effect as E } from "effect"
import { MembershipRepository } from "../ports/membership-repository.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"

export interface CleanupUserMembershipsInput {
  readonly userId: string
}

/**
 * Removes a user's org memberships ahead of account deletion. Organizations the
 * user was the sole member of are deleted outright; their ids are returned so
 * the caller can tear down org-scoped data (e.g. projects) that has no FK to
 * the org and would otherwise be orphaned.
 */
export const cleanupUserMembershipsUseCase = (
  input: CleanupUserMembershipsInput,
): Effect.Effect<
  readonly OrganizationId[],
  RepositoryError,
  MembershipRepository | OrganizationRepository | SqlClient
> =>
  E.gen(function* () {
    yield* E.annotateCurrentSpan("userId", input.userId)

    const membershipRepo = yield* MembershipRepository
    const orgRepo = yield* OrganizationRepository

    const memberships = yield* membershipRepo.listByUserId(input.userId)
    const deletedOrganizationIds: OrganizationId[] = []

    for (const membership of memberships) {
      const orgMembers = yield* membershipRepo.listByOrganizationId(membership.organizationId)

      if (orgMembers.length === 1) {
        // User is the sole member — delete the organization (cascades to membership)
        yield* orgRepo.delete(membership.organizationId)
        deletedOrganizationIds.push(membership.organizationId)
      } else {
        yield* membershipRepo.delete(membership.id)
      }
    }

    return deletedOrganizationIds
  }).pipe(E.withSpan("organizations.cleanupUserMemberships"))
