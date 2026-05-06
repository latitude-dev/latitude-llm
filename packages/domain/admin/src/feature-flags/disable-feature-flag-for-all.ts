import {
  type FeatureFlagNotFoundError,
  type InvalidFeatureFlagIdentifierError,
  validateFeatureFlagIdentifier,
} from "@domain/feature-flags"
import type { RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { AdminFeatureFlagRepository } from "./feature-flag-repository.ts"

export interface AdminDisableFeatureFlagForAllInput {
  readonly identifier: string
}

export type AdminDisableFeatureFlagForAllError =
  | InvalidFeatureFlagIdentifierError
  | FeatureFlagNotFoundError
  | RepositoryError

export const disableFeatureFlagForAllUseCase = Effect.fn("admin.featureFlags.disableForAll")(function* (
  input: AdminDisableFeatureFlagForAllInput,
) {
  const identifier = yield* validateFeatureFlagIdentifier(input.identifier)
  const repo = yield* AdminFeatureFlagRepository
  yield* repo.disableForAll(identifier)
}) satisfies (
  input: AdminDisableFeatureFlagForAllInput,
) => Effect.Effect<void, AdminDisableFeatureFlagForAllError, AdminFeatureFlagRepository>
