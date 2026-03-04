import type { OrganizationId, RepositoryError } from "@domain/shared"
import type { Effect } from "effect"
import type { Project } from "../entities/project.ts"
import type { ProjectRepository } from "../ports/project-repository.ts"

/**
 * List projects including deleted ones.
 */
export interface ListAllProjectsInput {
  readonly organizationId: OrganizationId
  readonly includeDeleted: boolean
}

export const listAllProjectsUseCase =
  (repository: ProjectRepository) =>
  (input: ListAllProjectsInput): Effect.Effect<readonly Project[], RepositoryError> => {
    if (input.includeDeleted) {
      return repository.findAllByOrganizationIdIncludingDeleted(input.organizationId)
    }
    return repository.findByOrganizationId(input.organizationId)
  }
