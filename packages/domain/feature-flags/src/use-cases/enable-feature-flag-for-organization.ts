import type { RepositoryError, SqlClient, UserId } from "@domain/shared"
import { Effect } from "effect"
import type { OrganizationFeatureFlag } from "../entities/feature-flag.ts"
import type { FeatureFlagNotFoundError, InvalidFeatureFlagIdentifierError } from "../errors.ts"
import { validateFeatureFlagIdentifier } from "../helpers.ts"
import { FeatureFlagRepository } from "../ports/feature-flag-repository.ts"

export interface EnableFeatureFlagForOrganizationInput {
  readonly identifier: string
  readonly enabledByAdminUserId: UserId
}

export type EnableFeatureFlagForOrganizationError =
  | InvalidFeatureFlagIdentifierError
  | FeatureFlagNotFoundError
  | RepositoryError

export const enableFeatureFlagForOrganizationUseCase = Effect.fn("featureFlags.enableForOrganization")(function* (
  input: EnableFeatureFlagForOrganizationInput,
) {
  const identifier = yield* validateFeatureFlagIdentifier(input.identifier)
  const repo = yield* FeatureFlagRepository

  return yield* repo.enableForOrganization({
    identifier,
    enabledByAdminUserId: input.enabledByAdminUserId,
  })
}) satisfies (
  input: EnableFeatureFlagForOrganizationInput,
) => Effect.Effect<OrganizationFeatureFlag, EnableFeatureFlagForOrganizationError, FeatureFlagRepository | SqlClient>
