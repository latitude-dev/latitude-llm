import type { RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { FeatureFlagRepository } from "../ports/feature-flag-repository.ts"
import type { FeatureFlagId } from "../registry.ts"

export interface HasFeatureFlagInput {
  readonly identifier: FeatureFlagId
}

export const hasFeatureFlagUseCase = Effect.fn("featureFlags.hasFeatureFlag")(function* (input: HasFeatureFlagInput) {
  const repo = yield* FeatureFlagRepository
  return yield* repo.isEnabledForOrganization(input.identifier)
}) satisfies (input: HasFeatureFlagInput) => Effect.Effect<boolean, RepositoryError, FeatureFlagRepository | SqlClient>
