import { defineError, type RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { MembershipRepository } from "../ports/membership-repository.ts"

export interface RemoveMemberInput {
  readonly membershipId: string
  readonly requestingUserId: string
}

export class MembershipNotFoundError extends defineError("MembershipNotFoundError", 404, "Membership not found")<{
  readonly membershipId: string
}> {}

export class CannotRemoveSelfError extends defineError(
  "CannotRemoveSelfError",
  400,
  "You cannot remove yourself from the workspace",
)<{
  readonly userId: string
}> {}

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
