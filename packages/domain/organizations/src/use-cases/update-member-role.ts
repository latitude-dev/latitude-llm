import type { OrganizationId, UserId } from "@domain/shared"
import { Effect } from "effect"
import type { Membership, MembershipRole } from "../entities/membership.ts"
import {
  CannotChangeOwnerRoleError,
  CannotChangeOwnRoleError,
  NotAdminError,
  TargetMembershipNotFoundError,
} from "../errors.ts"
import { MembershipRepository } from "../ports/membership-repository.ts"

export interface UpdateMemberRoleInput {
  readonly organizationId: OrganizationId
  readonly requestingUserId: UserId
  readonly targetUserId: UserId
  readonly newRole: MembershipRole
}

export const updateMemberRoleUseCase = Effect.fn(
  "organizations.updateMemberRole",
)(function* (input: UpdateMemberRoleInput) {
  yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("targetUserId", input.targetUserId)
  yield* Effect.annotateCurrentSpan("newRole", input.newRole)

  const repository = yield* MembershipRepository

  // Check if requesting user is an admin
  const isAdmin = yield* repository.isAdmin(input.organizationId, input.requestingUserId)
  if (!isAdmin) {
    return yield* new NotAdminError({ userId: input.requestingUserId })
  }

  // Cannot change your own role
  if (input.requestingUserId === input.targetUserId) {
    return yield* new CannotChangeOwnRoleError({ userId: input.requestingUserId })
  }

  // Find target member's membership
  const targetMembership = yield* repository
    .findByOrganizationAndUser(input.organizationId, input.targetUserId)
    .pipe(
      Effect.catchTag("NotFoundError", () =>
        Effect.fail(new TargetMembershipNotFoundError({ userId: input.targetUserId })),
      ),
    )

  // Cannot change owner's role directly
  if (targetMembership.role === "owner") {
    return yield* new CannotChangeOwnerRoleError({ userId: input.targetUserId })
  }

  // Update the role
  const updatedMembership: Membership = {
    ...targetMembership,
    role: input.newRole,
  }

  yield* repository.save(updatedMembership)

  return { success: true }
})
