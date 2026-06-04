import { causesIncludePostgresUniqueViolation, type RepositoryError, toSlug } from "@domain/shared"
import { Effect } from "effect"
import { InvalidProjectSlugError } from "../errors.ts"
import { ProjectRepository } from "../ports/project-repository.ts"
import { createProjectUseCase } from "./create-project.ts"

export interface FindOrCreateProjectBySlugInput {
  /** The raw project slug carried by the request (span attribute / resource attribute / header). */
  readonly slug: string
  readonly actorUserId?: string
}

/**
 * Resolve a project by slug within the active organization, creating it on the
 * fly when it doesn't exist yet. Used by span ingestion so an export carrying an
 * unrecognized `latitude.project` value provisions the project instead of being
 * rejected.
 *
 * The slug is normalized once and used for both the lookup and the created
 * project so the same value keeps resolving the same project on later exports.
 * Two ingests racing on the same new slug converge to one project: the loser of
 * the org-scoped unique constraint (Postgres `23505`) re-fetches the winner.
 */
export const findOrCreateProjectBySlugUseCase = Effect.fn("projects.findOrCreateProjectBySlug")(function* (
  input: FindOrCreateProjectBySlugInput,
) {
  const repo = yield* ProjectRepository
  const normalizedSlug = toSlug(input.slug)
  if (!normalizedSlug) {
    return yield* new InvalidProjectSlugError({
      slug: input.slug,
      reason: "Slug must contain at least one URL-safe character",
    })
  }

  return yield* repo.findBySlug(normalizedSlug).pipe(
    Effect.catchTag("NotFoundError", () =>
      createProjectUseCase({
        name: input.slug.trim(),
        slug: normalizedSlug,
        ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
      }).pipe(
        Effect.catchIf(
          (error): error is RepositoryError =>
            error._tag === "RepositoryError" && causesIncludePostgresUniqueViolation(error.cause),
          () => repo.findBySlug(normalizedSlug),
        ),
      ),
    ),
  )
})
