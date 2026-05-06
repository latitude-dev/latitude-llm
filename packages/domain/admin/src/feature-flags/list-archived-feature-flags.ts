import type { RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { AdminFeatureFlagRepository } from "./feature-flag-repository.ts"
import type { AdminFeatureFlagSummary } from "./feature-flag-result.ts"

export const listArchivedFeatureFlagsUseCase = Effect.fn("admin.featureFlags.listArchived")(function* () {
  const repo = yield* AdminFeatureFlagRepository
  return yield* repo.listArchived()
}) satisfies () => Effect.Effect<readonly AdminFeatureFlagSummary[], RepositoryError, AdminFeatureFlagRepository>
