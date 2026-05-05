import type { NotFoundError, OrganizationId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { AdminFeatureFlagRepository } from "./feature-flag-repository.ts"
import type { AdminOrganizationFeatureFlags } from "./feature-flag-result.ts"

export interface AdminListOrganizationFeatureFlagsInput {
  readonly organizationId: OrganizationId
}

export const listOrganizationFeatureFlagsUseCase = Effect.fn("admin.featureFlags.listForOrganization")(function* (
  input: AdminListOrganizationFeatureFlagsInput,
) {
  const repo = yield* AdminFeatureFlagRepository
  return yield* repo.listForOrganization(input.organizationId)
}) satisfies (
  input: AdminListOrganizationFeatureFlagsInput,
) => Effect.Effect<AdminOrganizationFeatureFlags, NotFoundError | RepositoryError, AdminFeatureFlagRepository>
