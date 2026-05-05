import { type InvalidFeatureFlagIdentifierError, validateFeatureFlagIdentifier } from "@domain/feature-flags"
import type { OrganizationId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { AdminFeatureFlagRepository } from "./feature-flag-repository.ts"

export interface AdminDisableFeatureFlagForOrganizationUseCaseInput {
  readonly organizationId: OrganizationId
  readonly identifier: string
}

export type AdminDisableFeatureFlagForOrganizationError = InvalidFeatureFlagIdentifierError | RepositoryError

export const disableFeatureFlagForOrganizationUseCase = Effect.fn("admin.featureFlags.disableForOrganization")(
  function* (input: AdminDisableFeatureFlagForOrganizationUseCaseInput) {
    const identifier = yield* validateFeatureFlagIdentifier(input.identifier)
    const repo = yield* AdminFeatureFlagRepository

    yield* repo.disableForOrganization({
      organizationId: input.organizationId,
      identifier,
    })
  },
) satisfies (
  input: AdminDisableFeatureFlagForOrganizationUseCaseInput,
) => Effect.Effect<void, AdminDisableFeatureFlagForOrganizationError, AdminFeatureFlagRepository>
