import type { NotFoundError, RepositoryError, UserId } from "@domain/shared"
import { Effect } from "effect"
import type { AdminUserDetails } from "./user-details.ts"
import { AdminUserRepository } from "./user-repository.ts"

export interface GetUserDetailsInput {
  readonly userId: UserId
}

export const getUserDetailsUseCase = (
  input: GetUserDetailsInput,
): Effect.Effect<AdminUserDetails, NotFoundError | RepositoryError, AdminUserRepository> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("admin.targetUserId", input.userId)
    const repo = yield* AdminUserRepository
    return yield* repo.findById(input.userId)
  }).pipe(Effect.withSpan("admin.getUserDetails"))
