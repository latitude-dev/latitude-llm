import type { OrganizationId, RepositoryError, UserId } from "@domain/shared"
import { Data, Effect } from "effect"
import type { Membership, MembershipRole } from "../entities/membership.ts"
import { MembershipRepository } from "../index.ts"

export interface UpdateMemberRoleInput {
  readonly organizationId: OrganizationId
  readonly requestingUserId: UserId
  readonly targetUserId: UserId
  readonly newRole: MembershipRole
}

export class NotAdminError extends Data.TaggedError("NotAdminError")<{
  readonly userId: string
}> {
  readonly httpStatus = 403
  readonly httpMessage = "Only admins can change member roles"
}

export class CannotChangeOwnerRoleError extends Data.TaggedError("CannotChangeOwnerRoleError")<{
  readonly userId: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "Cannot change the owner's role. Use ownership transfer instead."
}

export class CannotChangeOwnRoleError extends Data.TaggedError("CannotChangeOwnRoleError")<{
  readonly userId: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "You cannot change your own role"
}

class TargetMembershipNotFoundError extends Data.TaggedError("TargetMembershipNotFoundError")<{
  readonly userId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Target member not found"
}

export type UpdateMemberRoleError =
  | RepositoryError
  | NotAdminError
  | CannotChangeOwnerRoleError
  | CannotChangeOwnRoleError
  | TargetMembershipNotFoundError

export const updateMemberRoleUseCase = (input: UpdateMemberRoleInput) =>
  Effect.gen(function* () {
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
