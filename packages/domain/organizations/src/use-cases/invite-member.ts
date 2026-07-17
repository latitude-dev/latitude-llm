import { OutboxEventWriter } from "@domain/events"
import { type OrganizationId, type RepositoryError, toRepositoryError, type UserId } from "@domain/shared"
import { Effect } from "effect"
import { createInvitation, type Invitation } from "../entities/invitation.ts"
import type { MembershipRole } from "../entities/membership.ts"
import {
  AlreadyInvitedError,
  AlreadyMemberError,
  CannotInviteAsOwnerError,
  InvitationLimitReachedError,
  MembershipNotFoundError,
} from "../errors.ts"
import { InvitationRepository } from "../ports/invitation-repository.ts"
import { MembershipRepository } from "../ports/membership-repository.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"

export interface InviteMemberInput {
  readonly organizationId: OrganizationId
  readonly email: string
  /**
   * Role to grant on acceptance. Defaults to `"member"`. `"owner"` is rejected
   * — minting a new owner happens only through the ownership-transfer flow,
   * which is intentionally web-only (see the plan's endpoint inventory).
   */
  readonly role?: MembershipRole
  /** User id of the caller — must already be a member of `organizationId`. */
  readonly inviterUserId: UserId
  /**
   * Display name for the invitation email's "<inviterName> invited you to..."
   * line. Callers should pass `"A teammate"` (or similar) when the name is
   * unset; we don't fetch it here so this use-case can stay free of a
   * `@domain/users` dependency.
   */
  readonly inviterName: string
  /**
   * Base URL of the web app, used to build the invitation accept URL the
   * recipient receives by email. Taken as input rather than read from env so
   * the use-case stays portable across processes.
   */
  readonly webUrl: string
}

/** Cap matching Better Auth's `invitationLimit` default. Pending invitations beyond this are rejected. */
export const PENDING_INVITATION_LIMIT = 100

/**
 * Creates an invitation row and emits the email + analytics outbox events the
 * existing email worker and analytics pipeline already consume from the web
 * path. Behaviorally mirrors `betterAuth.api.createInvitation` so the API and
 * web produce identical rows + side effects:
 *
 * 1. Inviter must already be a member of the org (defensive — the API auth
 *    layer enforces this too; the explicit check gives a clearer error).
 * 2. Owner role is rejected — `CannotInviteAsOwnerError`.
 * 3. Email must not already belong to an active member — `AlreadyMemberError`.
 * 4. Email must not already have a pending invitation — `AlreadyInvitedError`.
 *    (BA supports a `resend: true` flag that bumps the existing row's expiry;
 *    we don't expose that yet — re-inviting requires the cancel + re-invite flow.)
 * 5. Pending invitation count must be below {@link PENDING_INVITATION_LIMIT}.
 * 6. The org must exist (used to build the email payload).
 *
 * On success, writes the invitation row and emits two outbox events:
 *   - `InvitationEmailRequested` — picked up by the email worker.
 *   - `MemberInvited` — picked up by analytics.
 *
 * Owner-or-admin permission enforcement stays at the route layer (it has
 * access to `c.var.auth` and can run `isAdmin`). This use-case focuses on
 * the invitation lifecycle.
 */
export const inviteMemberUseCase = Effect.fn("organizations.inviteMember")(function* (input: InviteMemberInput) {
  yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("email", input.email)

  const role: MembershipRole = input.role ?? "member"
  if (role === "owner") {
    return yield* new CannotInviteAsOwnerError()
  }

  const membershipRepo = yield* MembershipRepository
  const organizationRepo = yield* OrganizationRepository
  const invitationRepo = yield* InvitationRepository
  const outboxEventWriter = yield* OutboxEventWriter

  yield* membershipRepo
    .findByOrganizationAndUser(input.organizationId, input.inviterUserId)
    .pipe(
      Effect.catchTag("NotFoundError", () => Effect.fail(new MembershipNotFoundError({ userId: input.inviterUserId }))),
    )

  const normalizedEmail = input.email.trim().toLowerCase()

  const isAlreadyMember = yield* membershipRepo.findMemberByEmail(normalizedEmail)
  if (isAlreadyMember) {
    return yield* new AlreadyMemberError({ email: normalizedEmail })
  }

  const pendingInvitations = yield* invitationRepo.listPending()

  if (pendingInvitations.some((inv) => inv.email.toLowerCase() === normalizedEmail)) {
    return yield* new AlreadyInvitedError({ email: normalizedEmail })
  }

  if (pendingInvitations.length >= PENDING_INVITATION_LIMIT) {
    return yield* new InvitationLimitReachedError({ limit: PENDING_INVITATION_LIMIT })
  }

  const organization = yield* organizationRepo.findById(input.organizationId)

  const invitation = createInvitation({
    organizationId: input.organizationId,
    email: normalizedEmail,
    role,
    inviterId: input.inviterUserId,
  })

  yield* invitationRepo.create(invitation)

  const invitationUrl = `${input.webUrl}/auth/invite?invitationId=${encodeURIComponent(invitation.id)}`

  yield* outboxEventWriter
    .write({
      eventName: "InvitationEmailRequested",
      aggregateType: "invitation",
      aggregateId: invitation.id,
      organizationId: "system",
      payload: {
        email: invitation.email,
        invitationUrl,
        organizationId: "system",
        organizationName: organization.name,
        inviterName: input.inviterName,
      },
    })
    .pipe(Effect.mapError((error): RepositoryError => toRepositoryError(error, "write InvitationEmailRequested")))

  yield* outboxEventWriter
    .write({
      eventName: "MemberInvited",
      aggregateType: "invitation",
      aggregateId: invitation.id,
      organizationId: "system",
      payload: {
        organizationId: "system",
        actorUserId: input.inviterUserId,
        email: invitation.email,
        role: invitation.role ?? "member",
      },
    })
    .pipe(Effect.mapError((error): RepositoryError => toRepositoryError(error, "write MemberInvited")))

  return invitation satisfies Invitation
})
