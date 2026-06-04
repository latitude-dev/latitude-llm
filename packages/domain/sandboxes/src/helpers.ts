import { isSandbox, MembershipRepository, type Organization, OrganizationRepository } from "@domain/organizations"
import type { OrganizationId, UserId } from "@domain/shared"
import { Effect } from "effect"
import { NotSandboxError, SandboxAccessDeniedError, SandboxNotFoundError } from "./errors.ts"

/**
 * Resolve an existing sandbox org and authorize the actor against its *parent*
 * org membership — any member of the parent may manage its sandboxes. Shared by
 * the archive/reactivate/delete sandbox use-cases.
 */
export const loadAuthorizedSandboxOrg = (sandboxOrganizationId: OrganizationId, actorUserId: UserId) =>
  Effect.gen(function* () {
    const organizations = yield* OrganizationRepository
    const org: Organization = yield* organizations
      .findById(sandboxOrganizationId)
      .pipe(
        Effect.catchTag("NotFoundError", () =>
          Effect.fail(new SandboxNotFoundError({ organizationId: sandboxOrganizationId })),
        ),
      )

    if (!isSandbox(org)) {
      return yield* new NotSandboxError({ organizationId: sandboxOrganizationId })
    }
    const parentOrgId = org.parentOrgId

    const memberships = yield* MembershipRepository
    const isMember = yield* memberships.isMember(parentOrgId, actorUserId)
    if (!isMember) {
      return yield* new SandboxAccessDeniedError({ organizationId: parentOrgId, userId: actorUserId })
    }

    return { organization: org, parentOrgId }
  })
