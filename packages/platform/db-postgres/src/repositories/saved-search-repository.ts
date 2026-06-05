import {
  DuplicateSavedSearchSlugError,
  type SavedSearch,
  SavedSearchNotFoundError,
  SavedSearchRepository,
  type SavedSearchSearchResult,
} from "@domain/saved-searches"
import {
  OrganizationId,
  ProjectId,
  type RepositoryError,
  SavedSearchId,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { and, desc, eq, ilike, isNull, ne, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { projects } from "../schema/projects.ts"
import { savedSearches } from "../schema/saved-searches.ts"
import { nameMatchScore, preferProjectFirst } from "./org-search.ts"

const isUniqueViolation = (cause: unknown): boolean => {
  let current: unknown = cause
  const seen = new Set<unknown>()
  while (current !== null && current !== undefined && typeof current === "object" && !seen.has(current)) {
    seen.add(current)
    const code = (current as { code?: unknown }).code
    if (code === "23505") return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

const mapSlugViolation = (
  error: RepositoryError,
  detail: { projectId: string; slug: string },
): Effect.Effect<never, DuplicateSavedSearchSlugError | RepositoryError> =>
  isUniqueViolation(error.cause) ? Effect.fail(new DuplicateSavedSearchSlugError(detail)) : Effect.fail(error)

const toSavedSearch = (row: typeof savedSearches.$inferSelect): SavedSearch => ({
  id: SavedSearchId(row.id),
  organizationId: OrganizationId(row.organizationId),
  projectId: ProjectId(row.projectId),
  slug: row.slug,
  name: row.name,
  query: row.query ?? null,
  filterSet: row.filterSet,
  deletedAt: row.deletedAt ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export const SavedSearchRepositoryLive = Layer.effect(
  SavedSearchRepository,
  Effect.gen(function* () {
    return {
      create: (args) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const insertedRows = yield* sqlClient
            .query((db) =>
              db
                .insert(savedSearches)
                .values({
                  ...(args.id ? { id: args.id } : {}),
                  organizationId: sqlClient.organizationId,
                  projectId: args.projectId,
                  slug: args.slug,
                  name: args.name,
                  query: args.query,
                  filterSet: args.filterSet,
                })
                .returning(),
            )
            .pipe(
              Effect.catchTag("RepositoryError", (error) =>
                mapSlugViolation(error, { projectId: args.projectId, slug: args.slug }),
              ),
            )
          return toSavedSearch(insertedRows[0])
        }),

      findById: (id) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [row] = yield* sqlClient.query((db) =>
            db
              .select()
              .from(savedSearches)
              .where(
                and(
                  eq(savedSearches.organizationId, sqlClient.organizationId),
                  eq(savedSearches.id, id),
                  isNull(savedSearches.deletedAt),
                ),
              )
              .limit(1),
          )
          if (!row) {
            return yield* new SavedSearchNotFoundError({ savedSearchId: id })
          }
          return toSavedSearch(row)
        }),

      findBySlug: ({ projectId, slug }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [row] = yield* sqlClient.query((db) =>
            db
              .select()
              .from(savedSearches)
              .where(
                and(
                  eq(savedSearches.organizationId, sqlClient.organizationId),
                  eq(savedSearches.projectId, projectId),
                  eq(savedSearches.slug, slug),
                  isNull(savedSearches.deletedAt),
                ),
              )
              .limit(1),
          )
          if (!row) {
            return yield* new SavedSearchNotFoundError({ savedSearchId: `${projectId}/${slug}` })
          }
          return toSavedSearch(row)
        }),

      countBySlug: ({ projectId, slug, excludeId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const conditions = and(
            eq(savedSearches.organizationId, sqlClient.organizationId),
            eq(savedSearches.projectId, projectId),
            eq(savedSearches.slug, slug),
            isNull(savedSearches.deletedAt),
            ...(excludeId ? [ne(savedSearches.id, excludeId)] : []),
          )
          const [row] = yield* sqlClient.query((db) =>
            db.select({ count: sql<number>`count(*)::int` }).from(savedSearches).where(conditions),
          )
          return row?.count ?? 0
        }),

      listByProject: ({ projectId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const conditions = and(
            eq(savedSearches.organizationId, sqlClient.organizationId),
            eq(savedSearches.projectId, projectId),
            isNull(savedSearches.deletedAt),
          )
          const rows = yield* sqlClient.query((db) =>
            db.select().from(savedSearches).where(conditions).orderBy(desc(savedSearches.createdAt)),
          )
          return { items: rows.map(toSavedSearch) }
        }),

      searchOrgWide: (args) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const trimmed = args.searchQuery?.trim()
          const conditions = and(
            eq(savedSearches.organizationId, sqlClient.organizationId),
            isNull(savedSearches.deletedAt),
            isNull(projects.deletedAt),
            ...(trimmed ? [ilike(savedSearches.name, `%${trimmed}%`)] : []),
          )
          // Preferred project first, then best name match (exact > prefix > substring), then most
          // recent. With no query the score is uniform, so it falls back to newest-first.
          const orderBy = [
            ...preferProjectFirst(savedSearches.projectId, args.preferProjectId),
            ...(trimmed
              ? [
                  desc(nameMatchScore(savedSearches.name, trimmed)),
                  desc(savedSearches.createdAt),
                  desc(savedSearches.id),
                ]
              : [desc(savedSearches.createdAt), desc(savedSearches.id)]),
          ]

          const rows = yield* sqlClient.query((db) =>
            db
              .select({
                id: savedSearches.id,
                projectId: savedSearches.projectId,
                projectSlug: projects.slug,
                projectName: projects.name,
                slug: savedSearches.slug,
                name: savedSearches.name,
              })
              .from(savedSearches)
              .innerJoin(projects, eq(projects.id, savedSearches.projectId))
              .where(conditions)
              .orderBy(...orderBy)
              .limit(args.limit),
          )

          return rows.map(
            (row): SavedSearchSearchResult => ({
              id: SavedSearchId(row.id),
              projectId: ProjectId(row.projectId),
              projectSlug: row.projectSlug,
              projectName: row.projectName,
              slug: row.slug,
              name: row.name,
            }),
          )
        }),

      update: (args) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const setClause: Record<string, unknown> = {}
          if (args.slug !== undefined) setClause.slug = args.slug
          if (args.name !== undefined) setClause.name = args.name
          if (args.query !== undefined) setClause.query = args.query
          if (args.filterSet !== undefined) setClause.filterSet = args.filterSet

          if (Object.keys(setClause).length === 0) {
            const [row] = yield* sqlClient.query((db) =>
              db
                .select()
                .from(savedSearches)
                .where(
                  and(
                    eq(savedSearches.organizationId, sqlClient.organizationId),
                    eq(savedSearches.id, args.id),
                    isNull(savedSearches.deletedAt),
                  ),
                )
                .limit(1),
            )
            if (!row) {
              return yield* new SavedSearchNotFoundError({ savedSearchId: args.id })
            }
            return toSavedSearch(row)
          }

          const slugForError = args.slug ?? ""
          const [updated] = yield* sqlClient
            .query((db) =>
              db
                .update(savedSearches)
                .set(setClause)
                .where(
                  and(
                    eq(savedSearches.organizationId, sqlClient.organizationId),
                    eq(savedSearches.id, args.id),
                    isNull(savedSearches.deletedAt),
                  ),
                )
                .returning(),
            )
            .pipe(
              Effect.catchTag("RepositoryError", (error) =>
                args.slug !== undefined
                  ? mapSlugViolation(error, { projectId: args.projectId, slug: slugForError })
                  : Effect.fail(error),
              ),
            )

          if (!updated) {
            return yield* new SavedSearchNotFoundError({ savedSearchId: args.id })
          }
          return toSavedSearch(updated)
        }),

      softDelete: (id) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [updated] = yield* sqlClient.query((db) =>
            db
              .update(savedSearches)
              .set({ deletedAt: new Date() })
              .where(
                and(
                  eq(savedSearches.organizationId, sqlClient.organizationId),
                  eq(savedSearches.id, id),
                  isNull(savedSearches.deletedAt),
                ),
              )
              .returning({ id: savedSearches.id }),
          )
          if (!updated) {
            return yield* new SavedSearchNotFoundError({ savedSearchId: id })
          }
        }),
    }
  }),
)
