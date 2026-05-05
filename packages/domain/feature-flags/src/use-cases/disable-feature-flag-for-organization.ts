import type { RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { InvalidFeatureFlagIdentifierError } from "../errors.ts"
import { validateFeatureFlagIdentifier } from "../helpers.ts"
import { FeatureFlagRepository } from "../ports/feature-flag-repository.ts"

export interface DisableFeatureFlagForOrganizationInput {
  readonly identifier: string
}

export type DisableFeatureFlagForOrganizationError = InvalidFeatureFlagIdentifierError | RepositoryError

export const disableFeatureFlagForOrganizationUseCase = Effect.fn("featureFlags.disableForOrganization")(function* (
  input: DisableFeatureFlagForOrganizationInput,
) {
  const identifier = yield* validateFeatureFlagIdentifier(input.identifier)
  const repo = yield* FeatureFlagRepository
  yield* repo.disableForOrganization(identifier)
}) satisfies (
  input: DisableFeatureFlagForOrganizationInput,
) => Effect.Effect<void, DisableFeatureFlagForOrganizationError, FeatureFlagRepository | SqlClient>
