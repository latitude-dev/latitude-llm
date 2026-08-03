import { isAdminRole, MembershipRepository, type MembershipRole } from "@domain/organizations"
import { type OrganizationId, type RepositoryError, type SqlClient, UserId } from "@domain/shared"
import { Effect } from "effect"

export interface ResolveAdminRecipientsInput {
  readonly organizationId: OrganizationId
}

/**
 * Owners and admins for org-scoped billing alerts. Members who cannot
 * change billing settings are excluded — they would only get noise.
 */
export const resolveAdminRecipients = (
  input: ResolveAdminRecipientsInput,
): Effect.Effect<readonly UserId[], RepositoryError, SqlClient | MembershipRepository> =>
  Effect.gen(function* () {
    const memberships = yield* MembershipRepository
    const rows = yield* memberships.listByOrganizationId(input.organizationId)
    return rows.filter((row) => isAdminRole(row.role as MembershipRole)).map((row) => UserId(row.userId))
  })
