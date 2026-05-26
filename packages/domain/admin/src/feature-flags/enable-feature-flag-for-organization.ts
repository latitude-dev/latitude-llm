import type { FeatureFlagId } from "@domain/feature-flags"
import type { NotFoundError, OrganizationId, RepositoryError, UserId } from "@domain/shared"
import { Effect } from "effect"
import { AdminFeatureFlagRepository } from "./feature-flag-repository.ts"

export interface AdminEnableFeatureFlagForOrganizationUseCaseInput {
  readonly organizationId: OrganizationId
  readonly identifier: FeatureFlagId
  readonly enabledByAdminUserId: UserId
}

export type AdminEnableFeatureFlagForOrganizationError = NotFoundError | RepositoryError

export const enableFeatureFlagForOrganizationUseCase = Effect.fn("admin.featureFlags.enableForOrganization")(function* (
  input: AdminEnableFeatureFlagForOrganizationUseCaseInput,
) {
  const repo = yield* AdminFeatureFlagRepository
  yield* repo.enableForOrganization({
    organizationId: input.organizationId,
    identifier: input.identifier,
    enabledByAdminUserId: input.enabledByAdminUserId,
  })
}) satisfies (
  input: AdminEnableFeatureFlagForOrganizationUseCaseInput,
) => Effect.Effect<void, AdminEnableFeatureFlagForOrganizationError, AdminFeatureFlagRepository>
