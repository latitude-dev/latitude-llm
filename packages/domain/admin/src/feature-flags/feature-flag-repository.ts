import type { FeatureFlagId } from "@domain/feature-flags"
import type { NotFoundError, OrganizationId, RepositoryError, UserId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { AdminFeatureFlagSummary, AdminOrganizationFeatureFlags } from "./feature-flag-result.ts"

export interface AdminEnableFeatureFlagForOrganizationInput {
  readonly organizationId: OrganizationId
  readonly identifier: FeatureFlagId
  readonly enabledByAdminUserId: UserId
}

export interface AdminDisableFeatureFlagForOrganizationInput {
  readonly organizationId: OrganizationId
  readonly identifier: FeatureFlagId
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
  findEligibilityForFlag(identifier: FeatureFlagId): Effect.Effect<AdminFeatureFlagEligibility, RepositoryError>
  enableForAll(identifier: FeatureFlagId): Effect.Effect<void, RepositoryError>
  disableForAll(identifier: FeatureFlagId): Effect.Effect<void, RepositoryError>
  listForOrganization(
    organizationId: OrganizationId,
  ): Effect.Effect<AdminOrganizationFeatureFlags, NotFoundError | RepositoryError>
  enableForOrganization(
    input: AdminEnableFeatureFlagForOrganizationInput,
  ): Effect.Effect<void, NotFoundError | RepositoryError>
  disableForOrganization(input: AdminDisableFeatureFlagForOrganizationInput): Effect.Effect<void, RepositoryError>
}

export class AdminFeatureFlagRepository extends Context.Service<
  AdminFeatureFlagRepository,
  AdminFeatureFlagRepositoryShape
>()("@domain/admin/AdminFeatureFlagRepository") {}

export type AdminFeatureFlagMutationError = NotFoundError | RepositoryError
