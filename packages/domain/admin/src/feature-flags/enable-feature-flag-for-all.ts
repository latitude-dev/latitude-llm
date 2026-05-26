import type { FeatureFlagId } from "@domain/feature-flags"
import type { RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { AdminFeatureFlagRepository } from "./feature-flag-repository.ts"

export interface AdminEnableFeatureFlagForAllInput {
  readonly identifier: FeatureFlagId
}

export type AdminEnableFeatureFlagForAllError = RepositoryError

export const enableFeatureFlagForAllUseCase = Effect.fn("admin.featureFlags.enableForAll")(function* (
  input: AdminEnableFeatureFlagForAllInput,
) {
  const repo = yield* AdminFeatureFlagRepository
  yield* repo.enableForAll(input.identifier)
}) satisfies (
  input: AdminEnableFeatureFlagForAllInput,
) => Effect.Effect<void, AdminEnableFeatureFlagForAllError, AdminFeatureFlagRepository>
