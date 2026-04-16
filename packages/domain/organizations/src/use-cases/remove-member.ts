import type { MembershipId } from "@domain/shared"
import { Effect } from "effect"
import { CannotRemoveSelfError, MembershipNotFoundError } from "../errors.ts"
import { MembershipRepository } from "../ports/membership-repository.ts"

export interface RemoveMemberInput {
  readonly membershipId: MembershipId
  readonly requestingUserId: string
}

export const removeMemberUseCase = (input: RemoveMemberInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("membershipId", input.membershipId)

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
  }).pipe(Effect.withSpan("organizations.removeMember"))
