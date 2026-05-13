import {
  type FeatureFlagNotFoundError,
  type InvalidFeatureFlagIdentifierError,
  validateFeatureFlagIdentifier,
} from "@domain/feature-flags"
import type { RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { AdminFeatureFlagRepository } from "./feature-flag-repository.ts"

export interface AdminEnableFeatureFlagForAllInput {
  readonly identifier: string
}

export type AdminEnableFeatureFlagForAllError =
  | InvalidFeatureFlagIdentifierError
  | FeatureFlagNotFoundError
  | RepositoryError

export const enableFeatureFlagForAllUseCase = Effect.fn("admin.featureFlags.enableForAll")(function* (
  input: AdminEnableFeatureFlagForAllInput,
) {
  const identifier = yield* validateFeatureFlagIdentifier(input.identifier)
  const repo = yield* AdminFeatureFlagRepository
  yield* repo.enableForAll(identifier)
}) satisfies (
  input: AdminEnableFeatureFlagForAllInput,
) => Effect.Effect<void, AdminEnableFeatureFlagForAllError, AdminFeatureFlagRepository>
