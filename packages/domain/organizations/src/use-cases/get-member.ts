import type { MembershipId } from "@domain/shared"
import { Effect } from "effect"
import { MembershipNotFoundError } from "../errors.ts"
import { MembershipRepository } from "../ports/membership-repository.ts"

export interface GetMemberInput {
  readonly membershipId: MembershipId
}

/**
 * Fetches a single member of the caller's organization, joined to the user
 * record so the response carries the same shape as items in `listMembers`.
 * Org scoping is enforced at the repository / RLS layer — the caller doesn't
 * need to pass `organizationId`.
 */
export const getMemberUseCase = Effect.fn("organizations.getMember")(function* (input: GetMemberInput) {
  yield* Effect.annotateCurrentSpan("membershipId", input.membershipId)

  const repository = yield* MembershipRepository
  return yield* repository
    .findByIdWithUser(input.membershipId)
    .pipe(
      Effect.catchTag("NotFoundError", () =>
        Effect.fail(new MembershipNotFoundError({ membershipId: input.membershipId })),
      ),
    )
})
