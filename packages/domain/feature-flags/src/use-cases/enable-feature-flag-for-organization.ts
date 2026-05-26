import type { RepositoryError, SqlClient, UserId } from "@domain/shared"
import { Effect } from "effect"
import type { OrganizationFeatureFlag } from "../entities/feature-flag.ts"
import { FeatureFlagRepository } from "../ports/feature-flag-repository.ts"
import type { FeatureFlagId } from "../registry.ts"

export interface EnableFeatureFlagForOrganizationInput {
  readonly identifier: FeatureFlagId
  readonly enabledByAdminUserId: UserId
}

export type EnableFeatureFlagForOrganizationError = RepositoryError

export const enableFeatureFlagForOrganizationUseCase = Effect.fn("featureFlags.enableForOrganization")(function* (
  input: EnableFeatureFlagForOrganizationInput,
) {
  const repo = yield* FeatureFlagRepository
  return yield* repo.enableForOrganization({
    identifier: input.identifier,
    enabledByAdminUserId: input.enabledByAdminUserId,
  })
}) satisfies (
  input: EnableFeatureFlagForOrganizationInput,
) => Effect.Effect<OrganizationFeatureFlag, EnableFeatureFlagForOrganizationError, FeatureFlagRepository | SqlClient>
