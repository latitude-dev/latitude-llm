import type { ConflictError, OrganizationId, ProjectId, RepositoryError, UserId, ValidationError } from "@domain/shared"
import { Data, Effect } from "effect"
import { type Project, createProject } from "../entities/project.ts"
import type { ProjectRepository } from "../ports/project-repository.ts"

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
  readonly id?: ProjectId
  readonly organizationId: OrganizationId
  readonly name: string
  readonly description?: string
  readonly createdById?: UserId
}

const toSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

export class ProjectAlreadyExistsError extends Data.TaggedError("ProjectAlreadyExistsError")<{
  readonly name: string
  readonly slug: string
  readonly organizationId: OrganizationId
}> {
  readonly httpStatus = 409
  get httpMessage() {
    return `Project '${this.name}' or slug '${this.slug}' already exists in this organization`
  }
}

export class InvalidProjectNameError extends Data.TaggedError("InvalidProjectNameError")<{
  readonly field: string
  readonly message: string
}> {
  readonly httpStatus = 400
  get httpMessage() {
    return this.message
  }
}

export type CreateProjectError =
  | RepositoryError
  | ValidationError
  | ConflictError
  | ProjectAlreadyExistsError
  | InvalidProjectNameError

export const createProjectUseCase =
  (repository: ProjectRepository) =>
  (input: CreateProjectInput): Effect.Effect<Project, CreateProjectError> => {
    return Effect.gen(function* () {
      const trimmedName = input.name.trim()

      // Validate name
      if (!trimmedName || trimmedName.length === 0) {
        return yield* new InvalidProjectNameError({
          field: input.name,
          message: "Name cannot be empty",
        })
      }

      if (trimmedName.length > 256) {
        return yield* new InvalidProjectNameError({
          field: input.name,
          message: "Name exceeds 256 characters",
        })
      }

      const trimmedSlug = toSlug(trimmedName)

      // Validate slug
      if (!trimmedSlug || trimmedSlug.length === 0) {
        return yield* new InvalidProjectNameError({
          field: trimmedSlug,
          message: "Slug cannot be empty",
        })
      }

      if (trimmedSlug.length > 256) {
        return yield* new InvalidProjectNameError({
          field: trimmedSlug,
          message: "Slug exceeds 256 characters",
        })
      }

      // Check if name already exists in organization
      const nameExists = yield* repository.existsByName(trimmedName)
      if (nameExists) {
        return yield* new ProjectAlreadyExistsError({
          name: trimmedName,
          slug: trimmedSlug,
          organizationId: input.organizationId,
        })
      }

      // Check if slug already exists in organization
      const slugExists = yield* repository.existsBySlug(trimmedSlug)
      if (slugExists) {
        return yield* new ProjectAlreadyExistsError({
          name: trimmedName,
          slug: trimmedSlug,
          organizationId: input.organizationId,
        })
      }

      // Create project entity
      const project = createProject({
        id: input.id,
        organizationId: input.organizationId,
        name: trimmedName,
        slug: trimmedSlug,
        ...(input.description !== undefined && { description: input.description }),
        ...(input.createdById !== undefined && { createdById: input.createdById }),
      })

      // Persist
      yield* repository.save(project)

      return project
    })
  }
