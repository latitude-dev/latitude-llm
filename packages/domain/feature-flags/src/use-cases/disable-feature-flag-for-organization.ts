import type { RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { FeatureFlagRepository } from "../ports/feature-flag-repository.ts"
import type { FeatureFlagId } from "../registry.ts"

export interface DisableFeatureFlagForOrganizationInput {
  readonly identifier: FeatureFlagId
}

export type DisableFeatureFlagForOrganizationError = RepositoryError

export const disableFeatureFlagForOrganizationUseCase = Effect.fn("featureFlags.disableForOrganization")(function* (
  input: DisableFeatureFlagForOrganizationInput,
) {
  const repo = yield* FeatureFlagRepository
  yield* repo.disableForOrganization(input.identifier)
}) satisfies (
  input: DisableFeatureFlagForOrganizationInput,
) => Effect.Effect<void, DisableFeatureFlagForOrganizationError, FeatureFlagRepository | SqlClient>
