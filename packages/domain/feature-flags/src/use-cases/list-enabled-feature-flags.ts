import type { RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { FeatureFlag } from "../entities/feature-flag.ts"
import { FeatureFlagRepository } from "../ports/feature-flag-repository.ts"

export const listEnabledFeatureFlagsUseCase = Effect.fn("featureFlags.listEnabledFeatureFlags")(function* () {
  const repo = yield* FeatureFlagRepository
  return yield* repo.listEnabledForOrganization()
}) satisfies () => Effect.Effect<readonly FeatureFlag[], RepositoryError, FeatureFlagRepository | SqlClient>
