import type { RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { FeatureFlagNotFoundError, InvalidFeatureFlagIdentifierError } from "../errors.ts"
import { validateFeatureFlagIdentifier } from "../helpers.ts"
import { FeatureFlagRepository } from "../ports/feature-flag-repository.ts"

export interface ArchiveFeatureFlagInput {
  readonly identifier: string
}

export type ArchiveFeatureFlagError = InvalidFeatureFlagIdentifierError | FeatureFlagNotFoundError | RepositoryError

export const archiveFeatureFlagUseCase = Effect.fn("featureFlags.archiveFeatureFlag")(function* (
  input: ArchiveFeatureFlagInput,
) {
  const identifier = yield* validateFeatureFlagIdentifier(input.identifier)
  const repo = yield* FeatureFlagRepository
  yield* repo.archiveFeatureFlag(identifier)
}) satisfies (
  input: ArchiveFeatureFlagInput,
) => Effect.Effect<void, ArchiveFeatureFlagError, FeatureFlagRepository | SqlClient>
