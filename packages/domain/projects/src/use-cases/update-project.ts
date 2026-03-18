import {
  type ConflictError,
  defineError,
  defineErrorDynamic,
  type NotFoundError,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  SqlClient,
  type ValidationError,
} from "@domain/shared"
import { Effect } from "effect"
import type { Project } from "../entities/project.ts"
import { ProjectRepository } from "../ports/project-repository.ts"

export interface UpdateProjectInput {
  readonly id: ProjectId
  readonly name?: string
  readonly description?: string | null
}

export class ProjectNotFoundError extends defineError("ProjectNotFoundError", 404, "Project not found")<{
  readonly id: ProjectId
  readonly organizationId: OrganizationId
}> {}

export class InvalidProjectNameError extends defineErrorDynamic(
  "InvalidProjectNameError",
  400,
  (f: { reason: string }) => f.reason,
)<{
  readonly name: string
  readonly reason: string
}> {}

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

        const updatedProject: Project = {
          ...existingProject,
          name: nextName,
          description: input.description !== undefined ? input.description : existingProject.description,
          updatedAt: new Date(),
        }

        yield* repo.save(updatedProject)

        return updatedProject
      }),
    )
  })
