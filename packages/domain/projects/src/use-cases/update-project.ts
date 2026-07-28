import {
  type ConflictError,
  isReservedProjectSlug,
  type NotFoundError,
  type ProjectId,
  type ProjectSettings,
  type RepositoryError,
  SqlClient,
  toSlug,
  type ValidationError,
} from "@domain/shared"
import { Effect } from "effect"
import type { Project } from "../entities/project.ts"
import { InvalidProjectNameError, InvalidProjectSlugError, ProjectNotFoundError } from "../errors.ts"
import { ProjectRepository } from "../ports/project-repository.ts"

export interface UpdateProjectInput {
  readonly id: ProjectId
  readonly name?: string | undefined
  readonly slug?: string | undefined
  /** Replaces `settings` wholesale. Use `settingsPatch` unless you mean to drop the keys you omit. */
  readonly settings?: ProjectSettings | undefined
  /** Shallow-merged over the stored settings inside the transaction, so keys the caller doesn't know about survive. */
  readonly settingsPatch?: ProjectSettings | undefined
}

export type UpdateProjectError =
  | RepositoryError
  | ValidationError
  | ConflictError
  | NotFoundError
  | ProjectNotFoundError
  | InvalidProjectNameError
  | InvalidProjectSlugError

export const updateProjectUseCase = Effect.fn("projects.updateProject")(function* (input: UpdateProjectInput) {
  yield* Effect.annotateCurrentSpan("project.id", input.id)
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

      let nextSlug = existingProject.slug
      if (input.slug !== undefined) {
        const desiredSlug = toSlug(input.slug)
        if (!desiredSlug) {
          return yield* new InvalidProjectSlugError({
            slug: input.slug,
            reason: "Slug must contain at least one URL-safe character",
          })
        }
        if (isReservedProjectSlug(desiredSlug)) {
          return yield* new InvalidProjectSlugError({
            slug: desiredSlug,
            reason: "This slug is reserved",
          })
        }
        if (desiredSlug !== existingProject.slug) {
          const collisions = yield* repo.countBySlug(desiredSlug, existingProject.id)
          if (collisions > 0) {
            return yield* new InvalidProjectSlugError({
              slug: desiredSlug,
              reason: "Another project already uses this slug",
            })
          }
          nextSlug = desiredSlug
        }
      }

      const nextSettings =
        input.settingsPatch !== undefined
          ? { ...(existingProject.settings ?? {}), ...input.settingsPatch }
          : input.settings

      const now = new Date()
      const updatedProject: Project = {
        ...existingProject,
        name: nextName,
        slug: nextSlug,
        ...(nextSettings !== undefined ? { settings: nextSettings } : {}),
        lastEditedAt: now,
        updatedAt: now,
      }

      yield* repo.save(updatedProject)

      return updatedProject
    }),
  )
})
