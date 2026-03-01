import type {
  ConflictError,
  OrganizationId,
  ProjectId,
  RepositoryError,
  UserId,
  ValidationError,
} from "@domain/shared-kernel";
import { Data, Effect } from "effect";
import { type Project, createProject } from "../entities/project.js";
import type { ProjectRepository } from "../ports/project-repository.js";

/**
 * Create a new project use case.
 *
 * This use case:
 * 1. Validates the project name
 * 2. Checks for name uniqueness within the organization
 * 3. Creates the project entity
 * 4. Persists to the repository
 * 5. Returns the created project
 */
export interface CreateProjectInput {
  readonly id: ProjectId;
  readonly organizationId: OrganizationId;
  readonly name: string;
  readonly description?: string;
  readonly createdById?: UserId;
}

export class ProjectAlreadyExistsError extends Data.TaggedError("ProjectAlreadyExistsError")<{
  readonly name: string;
  readonly organizationId: OrganizationId;
}> {}

export class InvalidProjectNameError extends Data.TaggedError("InvalidProjectNameError")<{
  readonly name: string;
  readonly reason: string;
}> {}

export type CreateProjectError =
  | RepositoryError
  | ValidationError
  | ConflictError
  | ProjectAlreadyExistsError
  | InvalidProjectNameError;

export const createProjectUseCase =
  (repository: ProjectRepository) =>
  (input: CreateProjectInput): Effect.Effect<Project, CreateProjectError> => {
    return Effect.gen(function* () {
      // Validate name
      if (!input.name || input.name.trim().length === 0) {
        return yield* new InvalidProjectNameError({
          name: input.name,
          reason: "Name cannot be empty",
        });
      }

      if (input.name.length > 256) {
        return yield* new InvalidProjectNameError({
          name: input.name,
          reason: "Name exceeds 256 characters",
        });
      }

      // Check if name already exists in organization
      const exists = yield* repository.existsByName(input.name.trim(), input.organizationId);
      if (exists) {
        return yield* new ProjectAlreadyExistsError({
          name: input.name.trim(),
          organizationId: input.organizationId,
        });
      }

      // Create project entity
      const project = createProject({
        id: input.id,
        organizationId: input.organizationId,
        name: input.name.trim(),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.createdById !== undefined && { createdById: input.createdById }),
      });

      // Persist
      yield* repository.save(project);

      return project;
    });
  };
