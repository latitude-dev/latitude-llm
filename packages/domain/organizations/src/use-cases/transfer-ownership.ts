import type { OrganizationId, UserId } from "@domain/shared"
import { Effect } from "effect"
import type { Membership } from "../entities/membership.ts"
import {
  CannotTransferToNonMemberError,
  CannotTransferToSelfError,
  MembershipNotFoundError,
  NotOwnerError,
} from "../errors.ts"
import { MembershipRepository } from "../ports/membership-repository.ts"

export interface TransferOwnershipInput {
  readonly organizationId: OrganizationId
  readonly currentOwnerUserId: UserId
  readonly newOwnerUserId: UserId
}

export const transferOwnershipUseCase = Effect.fn("organizations.transferOwnership")(function* (
  input: TransferOwnershipInput,
) {
  yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("newOwnerUserId", input.newOwnerUserId)

  const repository = yield* MembershipRepository

  // Check if current owner is actually the owner
  const currentOwnerMembership = yield* repository
    .findByOrganizationAndUser(input.organizationId, input.currentOwnerUserId)
    .pipe(
      Effect.catchTag("NotFoundError", () =>
        Effect.fail(new MembershipNotFoundError({ userId: input.currentOwnerUserId })),
      ),
    )

  if (currentOwnerMembership.role !== "owner") {
    return yield* new NotOwnerError({ userId: input.currentOwnerUserId })
  }

  // Cannot transfer to self
  if (input.currentOwnerUserId === input.newOwnerUserId) {
    return yield* new CannotTransferToSelfError({ userId: input.currentOwnerUserId })
  }

  // Find target member's membership
  const newOwnerMembership = yield* repository
    .findByOrganizationAndUser(input.organizationId, input.newOwnerUserId)
    .pipe(
      Effect.catchTag("NotFoundError", () =>
        Effect.fail(new CannotTransferToNonMemberError({ userId: input.newOwnerUserId })),
      ),
    )

  // Swap roles: current owner becomes admin, new owner becomes owner
  const updatedCurrentOwnerMembership: Membership = {
    ...currentOwnerMembership,
    role: "admin",
  }

  const updatedNewOwnerMembership: Membership = {
    ...newOwnerMembership,
    role: "owner",
  }

  // Save both memberships
  yield* repository.save(updatedCurrentOwnerMembership)
  yield* repository.save(updatedNewOwnerMembership)

  return { success: true }
})
