import type { OrganizationId, RepositoryError } from "@domain/shared"
import { Data, Effect } from "effect"
import type { MembershipRepository } from "../ports/membership-repository.ts"

export interface RemoveMemberInput {
  readonly membershipId: string
  readonly requestingUserId: string
  readonly organizationId: OrganizationId
}

export class MembershipNotFoundError extends Data.TaggedError("MembershipNotFoundError")<{
  readonly membershipId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Membership not found"
}

export class CannotRemoveSelfError extends Data.TaggedError("CannotRemoveSelfError")<{
  readonly userId: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "You cannot remove yourself from the workspace"
}

export class MembershipOrganizationMismatchError extends Data.TaggedError("MembershipOrganizationMismatchError")<{
  readonly membershipId: string
}> {
  readonly httpStatus = 403
  readonly httpMessage = "Membership does not belong to this organization"
}

export type RemoveMemberError =
  | RepositoryError
  | MembershipNotFoundError
  | CannotRemoveSelfError
  | MembershipOrganizationMismatchError

export const removeMemberUseCase =
  (repository: MembershipRepository) =>
  (input: RemoveMemberInput): Effect.Effect<void, RemoveMemberError> => {
    return Effect.gen(function* () {
      const membership = yield* repository.findById(input.membershipId)

      if (!membership) {
        return yield* new MembershipNotFoundError({ membershipId: input.membershipId })
      }

      if (membership.userId === input.requestingUserId) {
        return yield* new CannotRemoveSelfError({ userId: input.requestingUserId })
      }

      if (membership.organizationId !== input.organizationId) {
        return yield* new MembershipOrganizationMismatchError({
          membershipId: input.membershipId,
        })
      }

      yield* repository.delete(input.membershipId)
    })
  }
