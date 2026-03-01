import type { OrganizationId, RepositoryError } from "@domain/shared-kernel";
import type { Effect } from "effect";
import type { Project } from "../entities/project.js";
import type { ProjectRepository } from "../ports/project-repository.js";

/**
 * List projects use case.
 *
 * Retrieves all non-deleted projects for a given organization.
 */
export interface ListProjectsInput {
  readonly organizationId: OrganizationId;
}

/**
 * List projects including deleted ones.
 */
export interface ListAllProjectsInput {
  readonly organizationId: OrganizationId;
  readonly includeDeleted: boolean;
}

export const listProjectsUseCase =
  (repository: ProjectRepository) =>
  (input: ListProjectsInput): Effect.Effect<readonly Project[], RepositoryError> => {
    return repository.findByOrganizationId(input.organizationId);
  };

export const listAllProjectsUseCase =
  (repository: ProjectRepository) =>
  (input: ListAllProjectsInput): Effect.Effect<readonly Project[], RepositoryError> => {
    if (input.includeDeleted) {
      return repository.findAllByOrganizationIdIncludingDeleted(input.organizationId);
    }
    return repository.findByOrganizationId(input.organizationId);
  };
