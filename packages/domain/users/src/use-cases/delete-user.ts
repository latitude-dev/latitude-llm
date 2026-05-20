import { cleanupUserMembershipsUseCase } from "@domain/organizations"
import { Effect } from "effect"
import { UserRepository } from "../ports/user-repository.ts"

export interface DeleteUserInput {
  readonly userId: string
}

export const deleteUserUseCase = Effect.fn("users.deleteUser")(function* (input: DeleteUserInput) {
  yield* Effect.annotateCurrentSpan("userId", input.userId)

  // Clean up memberships and sole-member organizations. The returned org ids
  // were deleted outright; their org-scoped data (projects) is torn down by the
  // caller, which can re-scope the SqlClient per organization.
  const deletedOrganizationIds = yield* cleanupUserMembershipsUseCase({ userId: input.userId })

  // Delete the user record (cascades to sessions, accounts)
  const userRepo = yield* UserRepository
  yield* userRepo.delete(input.userId)

  return { deletedOrganizationIds }
})
