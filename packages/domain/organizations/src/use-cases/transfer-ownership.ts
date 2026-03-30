import type { OrganizationId, RepositoryError, UserId } from "@domain/shared"
import { Data, Effect } from "effect"
import type { Membership } from "../entities/membership.ts"
import { MembershipRepository } from "../index.ts"

export interface TransferOwnershipInput {
  readonly organizationId: OrganizationId
  readonly currentOwnerUserId: UserId
  readonly newOwnerUserId: UserId
}

export class NotOwnerError extends Data.TaggedError("NotOwnerError")<{
  readonly userId: string
}> {
  readonly httpStatus = 403
  readonly httpMessage = "Only the organization owner can transfer ownership"
}

class MembershipNotFoundError extends Data.TaggedError("MembershipNotFoundError")<{
  readonly userId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Membership not found"
}

export class CannotTransferToSelfError extends Data.TaggedError("CannotTransferToSelfError")<{
  readonly userId: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "Cannot transfer ownership to yourself"
}

export class CannotTransferToNonMemberError extends Data.TaggedError("CannotTransferToNonMemberError")<{
  readonly userId: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "Can only transfer ownership to an existing member"
}

export type TransferOwnershipError =
  | RepositoryError
  | NotOwnerError
  | MembershipNotFoundError
  | CannotTransferToSelfError
  | CannotTransferToNonMemberError

export const transferOwnershipUseCase = (input: TransferOwnershipInput) =>
  Effect.gen(function* () {
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
