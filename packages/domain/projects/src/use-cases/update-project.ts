import type {
  ConflictError,
  NotFoundError,
  OrganizationId,
  ProjectId,
  RepositoryError,
  ValidationError,
} from "@domain/shared"
import { Data, Effect } from "effect"
import type { Project } from "../entities/project.ts"
import type { ProjectRepository } from "../ports/project-repository.ts"

export interface UpdateProjectInput {
  readonly id: ProjectId
  readonly organizationId: OrganizationId
  readonly name?: string
  readonly description?: string | null
}

export class ProjectNotFoundError extends Data.TaggedError("ProjectNotFoundError")<{
  readonly id: ProjectId
  readonly organizationId: OrganizationId
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Project not found"
}

export class InvalidProjectNameError extends Data.TaggedError("InvalidProjectNameError")<{
  readonly name: string
  readonly reason: string
}> {
  readonly httpStatus = 400
  get httpMessage() {
    return this.reason
  }
}

export type UpdateProjectError =
  | RepositoryError
  | ValidationError
  | ConflictError
  | NotFoundError
  | ProjectNotFoundError
  | InvalidProjectNameError

export const updateProjectUseCase =
  (repository: ProjectRepository) =>
  (input: UpdateProjectInput): Effect.Effect<Project, UpdateProjectError> => {
    return Effect.gen(function* () {
      const existingProject = yield* repository.findById(input.id)

      if (!existingProject) {
        return yield* new ProjectNotFoundError({
          id: input.id,
          organizationId: input.organizationId,
        })
      }

      let nextName = existingProject.name

      if (input.name !== undefined) {
        const trimmedName = input.name.trim()

        if (!trimmedName) {
          return yield* new InvalidProjectNameError({
            name: input.name,
            reason: "Name cannot be empty",
          })
        }

        if (trimmedName.length > 256) {
          return yield* new InvalidProjectNameError({
            name: input.name,
            reason: "Name exceeds 256 characters",
          })
        }

        if (trimmedName !== existingProject.name) {
          const nameExists = yield* repository.existsByName(trimmedName)
          if (nameExists) {
            return yield* new InvalidProjectNameError({
              name: trimmedName,
              reason: "Project name already exists in this organization",
            })
          }
        }

        nextName = trimmedName
      }

      const updatedProject: Project = {
        ...existingProject,
        name: nextName,
        description: input.description !== undefined ? input.description : existingProject.description,
        updatedAt: new Date(),
      }

      yield* repository.save(updatedProject)

      return updatedProject
    })
  }
