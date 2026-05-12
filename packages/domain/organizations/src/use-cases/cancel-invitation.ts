import type { InvitationId, UserId } from "@domain/shared"
import { Effect } from "effect"
import { InvitationNotFoundError, MembershipNotFoundError, NotAdminError } from "../errors.ts"
import { InvitationRepository } from "../ports/invitation-repository.ts"
import { MembershipRepository } from "../ports/membership-repository.ts"

export interface CancelInvitationInput {
  readonly invitationId: InvitationId
  /** User attempting to cancel. Must be a member of the invitation's org and have owner/admin role. */
  readonly requestingUserId: UserId
}

/**
 * Marks an invitation as `canceled`. Mirrors `betterAuth.api.cancelInvitation`
 * (BA 1.6.9, `plugins/organization/routes/crud-invites.mjs:359`):
 *
 * 1. The row stays in the table with `status = "canceled"` — accept links in
 *    already-sent emails resolve to a clear "no longer valid" state.
 * 2. The caller must be a member of the invitation's organization.
 * 3. The caller must have owner/admin role (BA's default `invitation:cancel`
 *    permission is owner+admin; we don't expose custom org-roles).
 *
 * Org scoping is enforced by the repository / RLS — callers don't pass the
 * `organizationId`; it's resolved from the invitation row's own column.
 */
export const cancelInvitationUseCase = Effect.fn("organizations.cancelInvitation")(function* (
  input: CancelInvitationInput,
) {
  yield* Effect.annotateCurrentSpan("invitationId", input.invitationId)

  const invitationRepo = yield* InvitationRepository
  const membershipRepo = yield* MembershipRepository

  const invitation = yield* invitationRepo
    .findById(input.invitationId)
    .pipe(
      Effect.catchTag("NotFoundError", () =>
        Effect.fail(new InvitationNotFoundError({ invitationId: input.invitationId })),
      ),
    )

  // Caller must be a member of the invitation's org.
  yield* membershipRepo
    .findByOrganizationAndUser(invitation.organizationId, input.requestingUserId)
    .pipe(
      Effect.catchTag("NotFoundError", () =>
        Effect.fail(new MembershipNotFoundError({ userId: input.requestingUserId })),
      ),
    )

  // …and must be admin or owner.
  const isAdmin = yield* membershipRepo.isAdmin(invitation.organizationId, input.requestingUserId)
  if (!isAdmin) {
    return yield* new NotAdminError({ userId: input.requestingUserId })
  }

  yield* invitationRepo.setStatus(input.invitationId, "canceled")
})
