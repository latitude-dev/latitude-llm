import { type InvalidFeatureFlagIdentifierError, validateFeatureFlagIdentifier } from "@domain/feature-flags"
import type { RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { AdminFeatureFlagRepository } from "./feature-flag-repository.ts"

export interface AdminDeleteFeatureFlagInput {
  readonly identifier: string
}

export type AdminDeleteFeatureFlagError = InvalidFeatureFlagIdentifierError | RepositoryError

export const deleteFeatureFlagUseCase = Effect.fn("admin.featureFlags.delete")(function* (
  input: AdminDeleteFeatureFlagInput,
) {
  const identifier = yield* validateFeatureFlagIdentifier(input.identifier)
  const repo = yield* AdminFeatureFlagRepository
  yield* repo.delete(identifier)
}) satisfies (
  input: AdminDeleteFeatureFlagInput,
) => Effect.Effect<void, AdminDeleteFeatureFlagError, AdminFeatureFlagRepository>
