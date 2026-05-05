import type { RepositoryError, SqlClient, UserId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { FeatureFlag, OrganizationFeatureFlag } from "../entities/feature-flag.ts"
import type { DuplicateFeatureFlagIdentifierError, FeatureFlagNotFoundError } from "../errors.ts"

export interface CreateFeatureFlagRepoInput {
  readonly id?: FeatureFlag["id"]
  readonly identifier: string
  readonly name?: string | null
  readonly description?: string | null
}

export interface EnableFeatureFlagForOrganizationRepoInput {
  readonly identifier: string
  readonly enabledByAdminUserId: UserId
}

export interface FeatureFlagRepositoryShape {
  findByIdentifier(
    identifier: string,
  ): Effect.Effect<FeatureFlag, FeatureFlagNotFoundError | RepositoryError, SqlClient>
  list(): Effect.Effect<readonly FeatureFlag[], RepositoryError, SqlClient>
  listEnabledForOrganization(): Effect.Effect<readonly FeatureFlag[], RepositoryError, SqlClient>
  isEnabledForOrganization(identifier: string): Effect.Effect<boolean, RepositoryError, SqlClient>
  createFeatureFlag(
    input: CreateFeatureFlagRepoInput,
  ): Effect.Effect<FeatureFlag, DuplicateFeatureFlagIdentifierError | RepositoryError, SqlClient>
  enableForOrganization(
    input: EnableFeatureFlagForOrganizationRepoInput,
  ): Effect.Effect<OrganizationFeatureFlag, FeatureFlagNotFoundError | RepositoryError, SqlClient>
  disableForOrganization(identifier: string): Effect.Effect<void, RepositoryError, SqlClient>
}

export class FeatureFlagRepository extends Context.Service<FeatureFlagRepository, FeatureFlagRepositoryShape>()(
  "@domain/feature-flags/FeatureFlagRepository",
) {}
