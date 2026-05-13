import {
  type FeatureFlagNotFoundError,
  type InvalidFeatureFlagIdentifierError,
  validateFeatureFlagIdentifier,
} from "@domain/feature-flags"
import type { RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { AdminFeatureFlagRepository } from "./feature-flag-repository.ts"

export interface AdminUnarchiveFeatureFlagInput {
  readonly identifier: string
}

export type AdminUnarchiveFeatureFlagError =
  | InvalidFeatureFlagIdentifierError
  | FeatureFlagNotFoundError
  | RepositoryError

export const unarchiveFeatureFlagUseCase = Effect.fn("admin.featureFlags.unarchive")(function* (
  input: AdminUnarchiveFeatureFlagInput,
) {
  const identifier = yield* validateFeatureFlagIdentifier(input.identifier)
  const repo = yield* AdminFeatureFlagRepository
  yield* repo.unarchive(identifier)
}) satisfies (
  input: AdminUnarchiveFeatureFlagInput,
) => Effect.Effect<void, AdminUnarchiveFeatureFlagError, AdminFeatureFlagRepository>
