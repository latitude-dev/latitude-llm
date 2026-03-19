import type { RepositoryError } from "@domain/shared"
import { Data, Effect } from "effect"
import { MembershipRepository } from "../ports/membership-repository.ts"

export interface RemoveMemberInput {
  readonly membershipId: string
  readonly requestingUserId: string
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

export type RemoveMemberError = RepositoryError | MembershipNotFoundError | CannotRemoveSelfError

export const removeMemberUseCase = (input: RemoveMemberInput) =>
  Effect.gen(function* () {
    const repository = yield* MembershipRepository

    const membership = yield* repository
      .findById(input.membershipId)
      .pipe(
        Effect.catchTag("NotFoundError", () =>
          Effect.fail(new MembershipNotFoundError({ membershipId: input.membershipId })),
        ),
      )

    if (membership.userId === input.requestingUserId) {
      return yield* new CannotRemoveSelfError({ userId: input.requestingUserId })
    }

    yield* repository.delete(input.membershipId)
  })
