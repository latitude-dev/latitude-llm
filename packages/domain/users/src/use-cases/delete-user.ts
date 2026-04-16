import { cleanupUserMembershipsUseCase } from "@domain/organizations"
import { Effect } from "effect"
import { UserRepository } from "../ports/user-repository.ts"

export interface DeleteUserInput {
  readonly userId: string
}

export const deleteUserUseCase = (input: DeleteUserInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("userId", input.userId)

    // Clean up memberships and sole-member organizations
    yield* cleanupUserMembershipsUseCase({ userId: input.userId })

    // Delete the user record (cascades to sessions, accounts)
    const userRepo = yield* UserRepository
    yield* userRepo.delete(input.userId)
  }).pipe(Effect.withSpan("users.deleteUser"))
