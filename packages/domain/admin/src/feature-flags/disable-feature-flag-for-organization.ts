import type { FeatureFlagId } from "@domain/feature-flags"
import type { OrganizationId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { AdminFeatureFlagRepository } from "./feature-flag-repository.ts"

export interface AdminDisableFeatureFlagForOrganizationUseCaseInput {
  readonly organizationId: OrganizationId
  readonly identifier: FeatureFlagId
}

export type AdminDisableFeatureFlagForOrganizationError = RepositoryError

export const disableFeatureFlagForOrganizationUseCase = Effect.fn("admin.featureFlags.disableForOrganization")(
  function* (input: AdminDisableFeatureFlagForOrganizationUseCaseInput) {
    const repo = yield* AdminFeatureFlagRepository
    yield* repo.disableForOrganization({
      organizationId: input.organizationId,
      identifier: input.identifier,
    })
  },
) satisfies (
  input: AdminDisableFeatureFlagForOrganizationUseCaseInput,
) => Effect.Effect<void, AdminDisableFeatureFlagForOrganizationError, AdminFeatureFlagRepository>
