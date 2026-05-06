import type { RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { AdminFeatureFlagRepository } from "./feature-flag-repository.ts"
import type { AdminFeatureFlagSummary } from "./feature-flag-result.ts"

export const listFeatureFlagsUseCase = Effect.fn("admin.featureFlags.list")(function* () {
  const repo = yield* AdminFeatureFlagRepository
  return yield* repo.list()
}) satisfies () => Effect.Effect<readonly AdminFeatureFlagSummary[], RepositoryError, AdminFeatureFlagRepository>
