import type { RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { normalizeFeatureFlagIdentifier } from "../helpers.ts"
import { FeatureFlagRepository } from "../ports/feature-flag-repository.ts"

export interface HasFeatureFlagInput {
  readonly identifier: string
}

export const hasFeatureFlagUseCase = Effect.fn("featureFlags.hasFeatureFlag")(function* (input: HasFeatureFlagInput) {
  const identifier = normalizeFeatureFlagIdentifier(input.identifier)
  if (identifier.length === 0) return false

  const repo = yield* FeatureFlagRepository
  return yield* repo.isEnabledForOrganization(identifier)
}) satisfies (input: HasFeatureFlagInput) => Effect.Effect<boolean, RepositoryError, FeatureFlagRepository | SqlClient>
