import type { OrganizationId, RepositoryError } from "@domain/shared-kernel"
import type { Effect } from "effect"
import type { Membership } from "../entities/membership.ts"
import type { MembershipRepository } from "../ports/membership-repository.ts"

/**
 * Get organization members use case.
 *
 * Retrieves all memberships for a given organization.
 */
export interface GetOrganizationMembersInput {
  readonly organizationId: OrganizationId
}

export const getOrganizationMembersUseCase =
  (repository: MembershipRepository) =>
  (input: GetOrganizationMembersInput): Effect.Effect<readonly Membership[], RepositoryError> => {
    return repository.findByOrganizationId(input.organizationId)
  }
