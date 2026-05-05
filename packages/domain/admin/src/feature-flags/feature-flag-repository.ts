import type {
  DuplicateFeatureFlagIdentifierError,
  FeatureFlagNotFoundError,
  InvalidFeatureFlagIdentifierError,
} from "@domain/feature-flags"
import type { FeatureFlagId, NotFoundError, OrganizationId, RepositoryError, UserId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { AdminFeatureFlagSummary, AdminOrganizationFeatureFlags } from "./feature-flag-result.ts"

export interface AdminCreateFeatureFlagInput {
  readonly id?: FeatureFlagId
  readonly identifier: string
  readonly name?: string | null
  readonly description?: string | null
}

export interface AdminEnableFeatureFlagForOrganizationInput {
  readonly organizationId: OrganizationId
  readonly identifier: string
  readonly enabledByAdminUserId: UserId
}

export interface AdminDisableFeatureFlagForOrganizationInput {
  readonly organizationId: OrganizationId
  readonly identifier: string
}

export interface AdminFeatureFlagRepositoryShape {
  list(): Effect.Effect<readonly AdminFeatureFlagSummary[], RepositoryError>
  create(
    input: AdminCreateFeatureFlagInput,
  ): Effect.Effect<AdminFeatureFlagSummary, DuplicateFeatureFlagIdentifierError | RepositoryError>
  archive(identifier: string): Effect.Effect<void, FeatureFlagNotFoundError | RepositoryError>
  listForOrganization(
    organizationId: OrganizationId,
  ): Effect.Effect<AdminOrganizationFeatureFlags, NotFoundError | RepositoryError>
  enableForOrganization(
    input: AdminEnableFeatureFlagForOrganizationInput,
  ): Effect.Effect<void, FeatureFlagNotFoundError | NotFoundError | RepositoryError>
  disableForOrganization(input: AdminDisableFeatureFlagForOrganizationInput): Effect.Effect<void, RepositoryError>
}

export class AdminFeatureFlagRepository extends Context.Service<
  AdminFeatureFlagRepository,
  AdminFeatureFlagRepositoryShape
>()("@domain/admin/AdminFeatureFlagRepository") {}

export type AdminFeatureFlagMutationError =
  | InvalidFeatureFlagIdentifierError
  | FeatureFlagNotFoundError
  | NotFoundError
  | RepositoryError
