import {
  MembershipRepository,
  type MembershipRole,
  type Organization,
  OrganizationRepository,
} from "@domain/organizations"
import type { OrganizationId, UserId } from "@domain/shared"
import { Effect } from "effect"
import type { User } from "../entities/user.ts"
import { UserRepository } from "../ports/user-repository.ts"

export interface GetAccountInput {
  /** Organization the request is scoped to (the active org for OAuth, the org owning the API key otherwise). */
  readonly organizationId: OrganizationId
  /**
   * User on whose behalf the request was made, or `null` for API-key auth
   * (which has no real user). When `null`, the use-case skips the user +
   * membership lookups and returns `{ user: null, role: null, organization }`.
   */
  readonly userId: UserId | null
}

export interface GetAccountResult {
  readonly user: User | null
  readonly organization: Organization
  readonly role: MembershipRole | null
}

/**
 * Returns the caller's account snapshot — the organization the request is
 * scoped to plus, when the request is acting on behalf of a real user, the
 * user record and their role within that organization.
 *
 * Two shapes:
 *
 * - API-key auth (`userId === null`): `{ user: null, organization, role: null }`.
 *   API keys are organization-scoped and don't represent a specific user, so
 *   the user/role fields are omitted rather than fabricated.
 * - OAuth auth (`userId` set): `{ user, organization, role }`. The user is the
 *   one who completed the consent flow; `role` is their membership role in
 *   `organization`.
 */
export const getAccountUseCase = Effect.fn("users.getAccount")(function* (input: GetAccountInput) {
  yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("hasUser", input.userId !== null)

  const orgRepo = yield* OrganizationRepository
  const organization = yield* orgRepo.findById(input.organizationId)

  if (input.userId === null) {
    return { user: null, organization, role: null } satisfies GetAccountResult
  }

  const userRepo = yield* UserRepository
  const membershipRepo = yield* MembershipRepository
  const user = yield* userRepo.findById(input.userId)
  const membership = yield* membershipRepo.findByOrganizationAndUser(input.organizationId, input.userId)
  return { user, organization, role: membership.role } satisfies GetAccountResult
})
