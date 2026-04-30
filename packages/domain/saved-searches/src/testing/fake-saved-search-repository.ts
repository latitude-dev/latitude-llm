import { generateId, OrganizationId, ProjectId, SavedSearchId } from "@domain/shared"
import { Effect } from "effect"
import type { SavedSearch } from "../entities/saved-search.ts"
import { DuplicateSavedSearchSlugError, SavedSearchNotFoundError } from "../errors.ts"
import type { SavedSearchRepositoryShape } from "../ports/saved-search-repository.ts"

const FAKE_ORG_ID = OrganizationId("fake-org".padEnd(24, "0"))

export const createFakeSavedSearchRepository = (seed: readonly SavedSearch[] = []) => {
  const rows = new Map<string, SavedSearch>(seed.map((row) => [row.id, row]))

  const isLive = (row: SavedSearch | undefined): row is SavedSearch => row !== undefined && row.deletedAt === null

  const collidesOnSlug = (projectId: string, slug: string, excludeId?: string): boolean => {
    for (const row of rows.values()) {
      if (!isLive(row)) continue
      if (row.projectId !== projectId) continue
      if (row.slug !== slug) continue
      if (excludeId && row.id === excludeId) continue
      return true
    }
    return false
  }

  const repository: SavedSearchRepositoryShape = {
    create: (args) =>
      Effect.gen(function* () {
        if (collidesOnSlug(args.projectId, args.slug)) {
          return yield* new DuplicateSavedSearchSlugError({ projectId: args.projectId, slug: args.slug })
        }
        const now = new Date()
        const id = args.id ?? SavedSearchId(generateId())
        const entity: SavedSearch = {
          id,
          organizationId: FAKE_ORG_ID,
          projectId: ProjectId(args.projectId),
          slug: args.slug,
          name: args.name,
          query: args.query,
          filterSet: args.filterSet,
          assignedUserId: args.assignedUserId,
          createdByUserId: args.createdByUserId,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        }
        rows.set(id, entity)
        return entity
      }),

    findById: (id) =>
      Effect.gen(function* () {
        const row = rows.get(id)
        if (!isLive(row)) {
          return yield* new SavedSearchNotFoundError({ savedSearchId: id })
        }
        return row
      }),

    findBySlug: ({ projectId, slug }) =>
      Effect.gen(function* () {
        for (const row of rows.values()) {
          if (!isLive(row)) continue
          if (row.projectId === projectId && row.slug === slug) return row
        }
        return yield* new SavedSearchNotFoundError({ savedSearchId: `${projectId}/${slug}` })
      }),

    existsBySlug: ({ projectId, slug, excludeId }) => Effect.sync(() => collidesOnSlug(projectId, slug, excludeId)),

    listByProject: ({ projectId, assignedUserId }) =>
      Effect.sync(() => {
        const items = [...rows.values()]
          .filter(isLive)
          .filter((row) => row.projectId === projectId)
          .filter((row) => (assignedUserId ? row.assignedUserId === assignedUserId : true))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        return { items }
      }),

    update: (args) =>
      Effect.gen(function* () {
        const current = rows.get(args.id)
        if (!isLive(current)) {
          return yield* new SavedSearchNotFoundError({ savedSearchId: args.id })
        }
        if (args.slug !== undefined && collidesOnSlug(current.projectId, args.slug, args.id)) {
          return yield* new DuplicateSavedSearchSlugError({
            projectId: current.projectId,
            slug: args.slug,
          })
        }
        const next: SavedSearch = {
          ...current,
          ...(args.slug !== undefined ? { slug: args.slug } : {}),
          ...(args.name !== undefined ? { name: args.name } : {}),
          ...(args.query !== undefined ? { query: args.query } : {}),
          ...(args.filterSet !== undefined ? { filterSet: args.filterSet } : {}),
          ...(args.assignedUserId !== undefined ? { assignedUserId: args.assignedUserId } : {}),
          updatedAt: new Date(),
        }
        rows.set(args.id, next)
        return next
      }),

    softDelete: (id) =>
      Effect.gen(function* () {
        const current = rows.get(id)
        if (!isLive(current)) {
          return yield* new SavedSearchNotFoundError({ savedSearchId: id })
        }
        rows.set(id, { ...current, deletedAt: new Date(), updatedAt: new Date() })
      }),
  }

  return { repository, rows }
}
