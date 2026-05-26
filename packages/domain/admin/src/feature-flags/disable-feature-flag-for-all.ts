import type { FeatureFlagId } from "@domain/feature-flags"
import type { RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { AdminFeatureFlagRepository } from "./feature-flag-repository.ts"

export interface AdminDisableFeatureFlagForAllInput {
  readonly identifier: FeatureFlagId
}

export type AdminDisableFeatureFlagForAllError = RepositoryError

export const disableFeatureFlagForAllUseCase = Effect.fn("admin.featureFlags.disableForAll")(function* (
  input: AdminDisableFeatureFlagForAllInput,
) {
  const repo = yield* AdminFeatureFlagRepository
  yield* repo.disableForAll(input.identifier)
}) satisfies (
  input: AdminDisableFeatureFlagForAllInput,
) => Effect.Effect<void, AdminDisableFeatureFlagForAllError, AdminFeatureFlagRepository>
