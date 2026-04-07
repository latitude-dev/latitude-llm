import {
  type ConflictError,
  type NotFoundError,
  type ProjectId,
  type ProjectSettings,
  type RepositoryError,
  SqlClient,
  type ValidationError,
} from "@domain/shared"
import { Effect } from "effect"
import type { Project } from "../entities/project.ts"
import { InvalidProjectNameError, ProjectNotFoundError } from "../errors.ts"
import { ProjectRepository } from "../ports/project-repository.ts"

export interface UpdateProjectInput {
  readonly id: ProjectId
  readonly name?: string | undefined
  readonly settings?: ProjectSettings | undefined
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
    const sqlClient = yield* SqlClient
    const { organizationId } = sqlClient

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        const existingProject = yield* repo
          .findById(input.id)
          .pipe(
            Effect.catchTag("NotFoundError", () =>
              Effect.fail(new ProjectNotFoundError({ id: input.id, organizationId })),
            ),
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

        const now = new Date()
        const updatedProject: Project = {
          ...existingProject,
          name: nextName,
          ...(input.settings !== undefined ? { settings: input.settings } : {}),
          lastEditedAt: now,
          updatedAt: now,
        }

        yield* repo.save(updatedProject)

        return updatedProject
      }),
    )
  })
