import {
  type DuplicateFeatureFlagIdentifierError,
  type InvalidFeatureFlagIdentifierError,
  validateFeatureFlagIdentifier,
} from "@domain/feature-flags"
import type { FeatureFlagId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { AdminFeatureFlagRepository } from "./feature-flag-repository.ts"
import type { AdminFeatureFlagSummary } from "./feature-flag-result.ts"

export interface AdminCreateFeatureFlagUseCaseInput {
  readonly id?: FeatureFlagId
  readonly identifier: string
  readonly name?: string | null
  readonly description?: string | null
}

export type AdminCreateFeatureFlagError =
  | InvalidFeatureFlagIdentifierError
  | DuplicateFeatureFlagIdentifierError
  | RepositoryError

export const createFeatureFlagUseCase = Effect.fn("admin.featureFlags.create")(function* (
  input: AdminCreateFeatureFlagUseCaseInput,
) {
  const identifier = yield* validateFeatureFlagIdentifier(input.identifier)
  const repo = yield* AdminFeatureFlagRepository

  return yield* repo.create({
    ...(input.id ? { id: input.id } : {}),
    identifier,
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
  })
}) satisfies (
  input: AdminCreateFeatureFlagUseCaseInput,
) => Effect.Effect<AdminFeatureFlagSummary, AdminCreateFeatureFlagError, AdminFeatureFlagRepository>
