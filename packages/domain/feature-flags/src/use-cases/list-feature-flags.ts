import type { RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { FeatureFlag } from "../entities/feature-flag.ts"
import { FeatureFlagRepository } from "../ports/feature-flag-repository.ts"

export const listFeatureFlagsUseCase = Effect.fn("featureFlags.listFeatureFlags")(function* () {
  const repo = yield* FeatureFlagRepository
  return yield* repo.list()
}) satisfies () => Effect.Effect<readonly FeatureFlag[], RepositoryError, FeatureFlagRepository | SqlClient>
