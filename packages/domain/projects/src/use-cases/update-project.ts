import {
  type ConflictError,
  type NotFoundError,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  SqlClient,
  type ValidationError,
} from "@domain/shared"
import { Data, Effect } from "effect"
import type { Project } from "../entities/project.ts"
import { ProjectRepository } from "../ports/project-repository.ts"

export interface UpdateProjectInput {
  readonly id: ProjectId
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

export const updateProjectUseCase = (input: UpdateProjectInput) =>
  Effect.gen(function* () {
    const { organizationId } = yield* SqlClient
    const repo = yield* ProjectRepository
    const existingProject = yield* repo
      .findById(input.id)
      .pipe(
        Effect.catchTag("NotFoundError", () => Effect.fail(new ProjectNotFoundError({ id: input.id, organizationId }))),
      )

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
        const nameExists = yield* repo.existsByName(trimmedName)
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

    yield* repo.save(updatedProject)

    return updatedProject
  })
