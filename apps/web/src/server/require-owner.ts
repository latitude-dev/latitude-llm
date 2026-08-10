import { MembershipRepository } from "@domain/organizations"
import {
  ForbiddenError,
  type NotFoundError,
  type OrganizationId,
  type RepositoryError,
  type SqlClient,
} from "@domain/shared"
import { Effect } from "effect"

/**
 * Guards a write whose blast radius is the whole organization. Matches the policy
 * `updateOrganizationRedaction` already enforces for the organization redaction default.
 */
export const requireOrganizationOwner = (input: {
  readonly organizationId: OrganizationId
  readonly userId: string
  readonly what: string
}): Effect.Effect<void, ForbiddenError | NotFoundError | RepositoryError, MembershipRepository | SqlClient> =>
  Effect.gen(function* () {
    const memberships = yield* MembershipRepository
    const caller = yield* memberships.findByOrganizationAndUser(input.organizationId, input.userId)
    if (caller.role !== "owner") {
      return yield* new ForbiddenError({ message: `Only the organization owner can change ${input.what}` })
    }
  })
