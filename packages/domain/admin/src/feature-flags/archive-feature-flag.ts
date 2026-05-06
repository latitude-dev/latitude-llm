import {
  type FeatureFlagNotFoundError,
  type InvalidFeatureFlagIdentifierError,
  validateFeatureFlagIdentifier,
} from "@domain/feature-flags"
import type { RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { AdminFeatureFlagRepository } from "./feature-flag-repository.ts"

export interface AdminArchiveFeatureFlagInput {
  readonly identifier: string
}

export type AdminArchiveFeatureFlagError =
  | InvalidFeatureFlagIdentifierError
  | FeatureFlagNotFoundError
  | RepositoryError

export const archiveFeatureFlagUseCase = Effect.fn("admin.featureFlags.archive")(function* (
  input: AdminArchiveFeatureFlagInput,
) {
  const identifier = yield* validateFeatureFlagIdentifier(input.identifier)
  const repo = yield* AdminFeatureFlagRepository
  yield* repo.archive(identifier)
}) satisfies (
  input: AdminArchiveFeatureFlagInput,
) => Effect.Effect<void, AdminArchiveFeatureFlagError, AdminFeatureFlagRepository>
