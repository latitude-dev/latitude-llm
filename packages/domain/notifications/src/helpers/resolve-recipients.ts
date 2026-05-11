import { MembershipRepository } from "@domain/organizations"
import type { AlertIncidentKind } from "@domain/shared"
import { type OrganizationId, type ProjectId, type RepositoryError, type SqlClient, UserId } from "@domain/shared"
import { Effect } from "effect"

export interface ResolveRecipientsInput {
  readonly organizationId: OrganizationId
  /** Reserved for future per-(user, project) subscriptions; ignored in V1. */
  readonly projectId: ProjectId
  /** Reserved for future per-kind opt-out; ignored in V1. */
  readonly kind: AlertIncidentKind
}

/**
 * Resolve which users should receive a given notification. V1 = every member
 * of the organization. The shape takes `projectId` and `kind` so the call
 * sites stay stable when per-(user, project, kind) subscriptions land.
 */
export const resolveRecipients = (
  input: ResolveRecipientsInput,
): Effect.Effect<readonly UserId[], RepositoryError, SqlClient | MembershipRepository> =>
  Effect.gen(function* () {
    const memberships = yield* MembershipRepository
    const rows = yield* memberships.listByOrganizationId(input.organizationId)
    return rows.map((row) => UserId(row.userId))
  })
