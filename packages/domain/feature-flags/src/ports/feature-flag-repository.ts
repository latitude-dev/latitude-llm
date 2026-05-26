import type { RepositoryError, SqlClient, UserId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { FeatureFlag, OrganizationFeatureFlag } from "../entities/feature-flag.ts"
import type { FeatureFlagId } from "../registry.ts"

export interface EnableFeatureFlagForOrganizationRepoInput {
  readonly identifier: FeatureFlagId
  readonly enabledByAdminUserId: UserId
}

export interface FeatureFlagRepositoryShape {
  listEnabledForOrganization(): Effect.Effect<readonly FeatureFlag[], RepositoryError, SqlClient>
  isEnabledForOrganization(identifier: FeatureFlagId): Effect.Effect<boolean, RepositoryError, SqlClient>
  enableForOrganization(
    input: EnableFeatureFlagForOrganizationRepoInput,
  ): Effect.Effect<OrganizationFeatureFlag, RepositoryError, SqlClient>
  disableForOrganization(identifier: FeatureFlagId): Effect.Effect<void, RepositoryError, SqlClient>
}

export class FeatureFlagRepository extends Context.Service<FeatureFlagRepository, FeatureFlagRepositoryShape>()(
  "@domain/feature-flags/FeatureFlagRepository",
) {}
