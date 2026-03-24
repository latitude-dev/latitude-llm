import type { RepositoryError } from "@domain/shared"
import type { Effect } from "effect"
import { Effect as E } from "effect"
import { MembershipRepository } from "../ports/membership-repository.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"

export interface CleanupUserMembershipsInput {
  readonly userId: string
}

export const cleanupUserMembershipsUseCase = (
  input: CleanupUserMembershipsInput,
): Effect.Effect<void, RepositoryError, MembershipRepository | OrganizationRepository> =>
  E.gen(function* () {
    const membershipRepo = yield* MembershipRepository
    const orgRepo = yield* OrganizationRepository

    const memberships = yield* membershipRepo.findByUserId(input.userId)

    for (const membership of memberships) {
      const orgMembers = yield* membershipRepo.findByOrganizationId(membership.organizationId)

      if (orgMembers.length === 1) {
        // User is the sole member — delete the organization (cascades to membership)
        yield* orgRepo.delete(membership.organizationId)
      } else {
        yield* membershipRepo.delete(membership.id)

        // Clear creator reference if this user created the org
        const org = yield* orgRepo
          .findById(membership.organizationId)
          .pipe(E.catchTag("NotFoundError", () => E.succeed(null)))
        if (org && org.creatorId === input.userId) {
          yield* orgRepo.save({ ...org, creatorId: null, updatedAt: new Date() })
        }
      }
    }
  })
