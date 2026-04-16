import { OutboxEventWriter } from "@domain/events"
import {
  type ConflictError,
  type ProjectId,
  type RepositoryError,
  SqlClient,
  toRepositoryError,
  toSlug,
  type ValidationError,
} from "@domain/shared"
import { Effect } from "effect"
import { createProject } from "../entities/project.ts"
import { InvalidProjectNameError } from "../errors.ts"
import { ProjectRepository } from "../ports/project-repository.ts"

export interface CreateProjectInput {
  readonly id?: ProjectId
  readonly name: string
  readonly actorUserId?: string
}

export type CreateProjectError = RepositoryError | ValidationError | ConflictError | InvalidProjectNameError

export const createProjectUseCase = (input: CreateProjectInput) =>
  Effect.gen(function* () {
    if (input.id) {
      yield* Effect.annotateCurrentSpan("project.id", input.id)
    }
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
        const outboxEventWriter = yield* OutboxEventWriter

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

        // Publish ProjectCreated event for downstream provisioning
        yield* outboxEventWriter
          .write({
            eventName: "ProjectCreated",
            aggregateType: "project",
            aggregateId: project.id,
            organizationId: project.organizationId,
            payload: {
              organizationId: project.organizationId,
              actorUserId: input.actorUserId ?? "",
              projectId: project.id,
              name: project.name,
              slug: project.slug,
            },
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "write")))

        return project
      }),
    )
  }).pipe(Effect.withSpan("projects.createProject"))
