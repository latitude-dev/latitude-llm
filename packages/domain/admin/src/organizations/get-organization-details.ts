import type { NotFoundError, OrganizationId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import type { AdminOrganizationDetails } from "./organization-details.ts"
import { AdminOrganizationRepository } from "./organization-repository.ts"

export interface GetOrganizationDetailsInput {
  readonly organizationId: OrganizationId
}

export const getOrganizationDetailsUseCase = (
  input: GetOrganizationDetailsInput,
): Effect.Effect<AdminOrganizationDetails, NotFoundError | RepositoryError, AdminOrganizationRepository> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("admin.targetOrganizationId", input.organizationId)
    const repo = yield* AdminOrganizationRepository
    return yield* repo.findById(input.organizationId)
  }).pipe(Effect.withSpan("admin.getOrganizationDetails"))
