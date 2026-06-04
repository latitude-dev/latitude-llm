import { OutboxEventWriter } from "@domain/events"
import {
  type ConflictError,
  generateSlug,
  type ProjectId,
  type RepositoryError,
  SqlClient,
  toRepositoryError,
  toSlug,
  type ValidationError,
} from "@domain/shared"
import { Effect } from "effect"
import { createProject } from "../entities/project.ts"
import { InvalidProjectNameError, InvalidProjectSlugError } from "../errors.ts"
import { ProjectRepository } from "../ports/project-repository.ts"

export interface CreateProjectInput {
  readonly id?: ProjectId
  readonly name: string
  /**
   * Explicit slug to use verbatim (after normalization) instead of deriving a
   * fresh one from the name. Set this when the slug must stay stable — e.g.
   * auto-provisioning a project from an ingested span's `latitude.project`
   * value, where the same slug has to resolve the same project next time.
   * When omitted, the slug is generated from the name with collision suffixing.
   */
  readonly slug?: string
  readonly actorUserId?: string
}

export type CreateProjectError =
  | RepositoryError
  | ValidationError
  | ConflictError
  | InvalidProjectNameError
  | InvalidProjectSlugError

export const createProjectUseCase = Effect.fn("projects.createProject")(function* (input: CreateProjectInput) {
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

  // Normalize an explicit slug up front so an unusable one fails before we open
  // a transaction. The explicit-slug path skips collision suffixing on purpose:
  // callers (find-or-create) rely on the org-scoped unique constraint to reject
  // a racing duplicate rather than silently minting a suffixed variant.
  let explicitSlug: string | undefined
  if (input.slug !== undefined) {
    explicitSlug = toSlug(input.slug)
    if (!explicitSlug) {
      return yield* new InvalidProjectSlugError({
        slug: input.slug,
        reason: "Slug must contain at least one URL-safe character",
      })
    }
  }

  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const repo = yield* ProjectRepository
      const outboxEventWriter = yield* OutboxEventWriter

      const uniqueSlug =
        explicitSlug ??
        (yield* generateSlug({
          name: trimmedName,
          count: (slug) => repo.countBySlug(slug),
        }).pipe(
          Effect.catchTag("InvalidSlugInputError", (error) =>
            Effect.fail(new InvalidProjectNameError({ field: input.name, message: error.reason })),
          ),
        ))

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
})
