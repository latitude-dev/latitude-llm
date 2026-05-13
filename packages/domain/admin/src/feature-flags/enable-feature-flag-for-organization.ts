import { type InvalidFeatureFlagIdentifierError, validateFeatureFlagIdentifier } from "@domain/feature-flags"
import type { NotFoundError, OrganizationId, RepositoryError, UserId } from "@domain/shared"
import { Effect } from "effect"
import { type AdminFeatureFlagMutationError, AdminFeatureFlagRepository } from "./feature-flag-repository.ts"

export interface AdminEnableFeatureFlagForOrganizationUseCaseInput {
  readonly organizationId: OrganizationId
  readonly identifier: string
  readonly enabledByAdminUserId: UserId
}

export type AdminEnableFeatureFlagForOrganizationError =
  | InvalidFeatureFlagIdentifierError
  | AdminFeatureFlagMutationError
  | NotFoundError
  | RepositoryError

export const enableFeatureFlagForOrganizationUseCase = Effect.fn("admin.featureFlags.enableForOrganization")(function* (
  input: AdminEnableFeatureFlagForOrganizationUseCaseInput,
) {
  const identifier = yield* validateFeatureFlagIdentifier(input.identifier)
  const repo = yield* AdminFeatureFlagRepository

  yield* repo.enableForOrganization({
    organizationId: input.organizationId,
    identifier,
    enabledByAdminUserId: input.enabledByAdminUserId,
  })
}) satisfies (
  input: AdminEnableFeatureFlagForOrganizationUseCaseInput,
) => Effect.Effect<void, AdminEnableFeatureFlagForOrganizationError, AdminFeatureFlagRepository>
