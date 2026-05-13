import type { FeatureFlagId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { FeatureFlag } from "../entities/feature-flag.ts"
import type { DuplicateFeatureFlagIdentifierError, InvalidFeatureFlagIdentifierError } from "../errors.ts"
import { validateFeatureFlagIdentifier } from "../helpers.ts"
import { FeatureFlagRepository } from "../ports/feature-flag-repository.ts"

export interface CreateFeatureFlagInput {
  readonly id?: FeatureFlagId
  readonly identifier: string
  readonly name?: string | null
  readonly description?: string | null
}

export type CreateFeatureFlagError =
  | InvalidFeatureFlagIdentifierError
  | DuplicateFeatureFlagIdentifierError
  | RepositoryError

export const createFeatureFlagUseCase = Effect.fn("featureFlags.createFeatureFlag")(function* (
  input: CreateFeatureFlagInput,
) {
  const identifier = yield* validateFeatureFlagIdentifier(input.identifier)
  const repo = yield* FeatureFlagRepository

  return yield* repo.createFeatureFlag({
    ...(input.id ? { id: input.id } : {}),
    identifier,
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
  })
}) satisfies (
  input: CreateFeatureFlagInput,
) => Effect.Effect<FeatureFlag, CreateFeatureFlagError, FeatureFlagRepository | SqlClient>
