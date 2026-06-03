import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import type { Project } from "../entities/project.ts"
import type { ProjectRepositoryShape } from "../ports/project-repository.ts"

/**
 * In-memory {@link ProjectRepositoryShape} for unit tests, mirroring the
 * `createFakeSavedSearchRepository` pattern. Seed it with projects and assert
 * against the returned `rows` map. Soft-deleted rows (`deletedAt !== null`) are
 * treated as gone for lookups and uniqueness checks.
 */
export const createFakeProjectRepository = (seed: readonly Project[] = []) => {
  const rows = new Map<string, Project>(seed.map((p) => [p.id, p]))

  const isLive = (p: Project | undefined): p is Project => p !== undefined && p.deletedAt === null

  const repository: ProjectRepositoryShape = {
    findById: (id) =>
      Effect.gen(function* () {
        const row = rows.get(id)
        if (!isLive(row)) return yield* new NotFoundError({ entity: "project", id })
        return row
      }),

    findBySlug: (slug) =>
      Effect.gen(function* () {
        for (const row of rows.values()) {
          if (isLive(row) && row.slug === slug) return row
        }
        return yield* new NotFoundError({ entity: "project", id: slug })
      }),

    list: () => Effect.sync(() => [...rows.values()].filter(isLive)),

    listIncludingDeleted: () => Effect.sync(() => [...rows.values()]),

    save: (project) =>
      Effect.sync(() => {
        rows.set(project.id, project)
      }),

    softDelete: (id) =>
      Effect.gen(function* () {
        const row = rows.get(id)
        if (!isLive(row)) return yield* new NotFoundError({ entity: "project", id })
        rows.set(id, { ...row, deletedAt: new Date() })
      }),

    hardDelete: (id) =>
      Effect.sync(() => {
        rows.delete(id)
      }),

    existsByName: (name) => Effect.sync(() => [...rows.values()].some((r) => isLive(r) && r.name === name)),

    countBySlug: (slug, excludeProjectId) =>
      Effect.sync(
        () => [...rows.values()].filter((r) => isLive(r) && r.slug === slug && r.id !== excludeProjectId).length,
      ),
  }

  return { repository, rows }
}
