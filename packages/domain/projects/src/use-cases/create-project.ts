import {
  type ConflictError,
  type ProjectId,
  type RepositoryError,
  SqlClient,
  toSlug,
  type ValidationError,
} from "@domain/shared"
import { Data, Effect } from "effect"
import { createProject } from "../entities/project.ts"
import { ProjectRepository } from "../ports/project-repository.ts"

export interface CreateProjectInput {
  readonly id?: ProjectId
  readonly name: string
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

export type CreateProjectError = RepositoryError | ValidationError | ConflictError | InvalidProjectNameError

export const createProjectUseCase = (input: CreateProjectInput) =>
  Effect.gen(function* () {
    const trimmedName = input.name.trim()
    const sqlClient = yield* SqlClient
    const { organizationId } = sqlClient

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
    if (!trimmedSlug || trimmedSlug.length === 0) {
      return yield* new InvalidProjectNameError({
        field: trimmedSlug,
        message: "Slug cannot be empty",
      })
    }

    if (trimmedSlug.length > 256) {
      return yield* new InvalidProjectNameError({
        field: trimmedSlug,
        message: "Slug exceeds 256 characters, try with a shorter project name.",
      })
    }

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository

        // Generate unique slug by appending numbers if needed
        let uniqueSlug = trimmedSlug
        let found = false
        for (let i = 1; i <= 100; i++) {
          const exists = yield* repo.existsBySlug(uniqueSlug)
          if (!exists) {
            found = true
            break
          }
          uniqueSlug = `${trimmedSlug}-${i}`
        }

        if (!found) {
          return yield* new InvalidProjectNameError({
            field: trimmedSlug,
            message: "Could not generate a unique project slug, try with a different project name.",
          })
        }

        const project = createProject({
          id: input.id,
          organizationId,
          name: trimmedName,
          slug: uniqueSlug,
        })

        yield* repo.save(project)

        return project
      }),
    )
  })
