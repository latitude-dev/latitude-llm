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

export interface AdminUpdateFeatureFlagInput {
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

/**
 * Eligibility snapshot for a single flag — used by cross-org workers that
 * want to skip work for orgs that don't have the flag enabled.
 *
 * When `enabledForAll` is true, every organization in the system is eligible
 * regardless of `organizationIds`. The list is not enumerated in that case to
 * avoid pulling every organization id into memory.
 */
export interface AdminFeatureFlagEligibility {
  readonly enabledForAll: boolean
  readonly organizationIds: readonly OrganizationId[]
}

export interface AdminFeatureFlagRepositoryShape {
  list(): Effect.Effect<readonly AdminFeatureFlagSummary[], RepositoryError>
  listArchived(): Effect.Effect<readonly AdminFeatureFlagSummary[], RepositoryError>
  findEligibilityForFlag(
    identifier: string,
  ): Effect.Effect<AdminFeatureFlagEligibility, FeatureFlagNotFoundError | RepositoryError>
  create(
    input: AdminCreateFeatureFlagInput,
  ): Effect.Effect<AdminFeatureFlagSummary, DuplicateFeatureFlagIdentifierError | RepositoryError>
  update(
    input: AdminUpdateFeatureFlagInput,
  ): Effect.Effect<AdminFeatureFlagSummary, FeatureFlagNotFoundError | RepositoryError>
  archive(identifier: string): Effect.Effect<void, FeatureFlagNotFoundError | RepositoryError>
  unarchive(identifier: string): Effect.Effect<void, FeatureFlagNotFoundError | RepositoryError>
  delete(identifier: string): Effect.Effect<void, RepositoryError>
  enableForAll(identifier: string): Effect.Effect<void, FeatureFlagNotFoundError | RepositoryError>
  disableForAll(identifier: string): Effect.Effect<void, FeatureFlagNotFoundError | RepositoryError>
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
