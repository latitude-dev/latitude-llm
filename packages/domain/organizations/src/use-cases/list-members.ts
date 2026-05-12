import type { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import type { Invitation } from "../entities/invitation.ts"
import { InvitationRepository } from "../ports/invitation-repository.ts"
import { MembershipRepository, type MemberWithUser } from "../ports/membership-repository.ts"

export interface ListMembersInput {
  readonly organizationId: OrganizationId
}

export interface ListMembersResult {
  readonly members: readonly MemberWithUser[]
  readonly invitations: readonly Invitation[]
}

/**
 * Returns the full membership view for an organization: confirmed members plus
 * pending invitations. Mirrors the web's `listMembers` server function — the
 * UI shows both kinds of rows in a single table, and the API matches.
 *
 * Pending invitations whose `email` already matches an active member's email
 * are dropped (e.g. someone accepted an invite that wasn't garbage-collected).
 * Comparison is case-insensitive to match Better Auth's invitation creation,
 * which lowercases the email on write.
 *
 * The route layer is responsible for merging the two arrays into a single
 * discriminated-union response shape; the use-case returns them separated so
 * future consumers (other apps, tests) can opt into whichever projection.
 */
export const listMembersUseCase = Effect.fn("organizations.listMembers")(function* (input: ListMembersInput) {
  yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)

  const membershipRepo = yield* MembershipRepository
  const invitationRepo = yield* InvitationRepository

  const members = yield* membershipRepo.listMembersWithUser(input.organizationId)
  const pendingInvitations = yield* invitationRepo.listPending()

  const activeEmails = new Set(members.map((m) => m.email.toLowerCase()))
  const invitations = pendingInvitations.filter((inv) => !activeEmails.has(inv.email.toLowerCase()))

  return { members, invitations } satisfies ListMembersResult
})
