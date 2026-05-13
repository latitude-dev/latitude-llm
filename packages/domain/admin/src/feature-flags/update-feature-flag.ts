import {
  type FeatureFlagNotFoundError,
  type InvalidFeatureFlagIdentifierError,
  validateFeatureFlagIdentifier,
} from "@domain/feature-flags"
import type { RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { AdminFeatureFlagRepository } from "./feature-flag-repository.ts"
import type { AdminFeatureFlagSummary } from "./feature-flag-result.ts"

export interface AdminUpdateFeatureFlagUseCaseInput {
  readonly identifier: string
  readonly name?: string | null
  readonly description?: string | null
}

export type AdminUpdateFeatureFlagError = InvalidFeatureFlagIdentifierError | FeatureFlagNotFoundError | RepositoryError

export const updateFeatureFlagUseCase = Effect.fn("admin.featureFlags.update")(function* (
  input: AdminUpdateFeatureFlagUseCaseInput,
) {
  const identifier = yield* validateFeatureFlagIdentifier(input.identifier)
  const repo = yield* AdminFeatureFlagRepository

  return yield* repo.update({
    identifier,
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
  })
}) satisfies (
  input: AdminUpdateFeatureFlagUseCaseInput,
) => Effect.Effect<AdminFeatureFlagSummary, AdminUpdateFeatureFlagError, AdminFeatureFlagRepository>
