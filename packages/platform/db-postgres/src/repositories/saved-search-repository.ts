import {
  DuplicateSavedSearchSlugError,
  type SavedSearch,
  SavedSearchNotFoundError,
  SavedSearchRepository,
} from "@domain/saved-searches"
import {
  OrganizationId,
  ProjectId,
  type RepositoryError,
  SavedSearchId,
  SqlClient,
  type SqlClientShape,
  UserId,
} from "@domain/shared"
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { savedSearches } from "../schema/saved-searches.ts"

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
  assignedUserId: row.assignedUserId ? UserId(row.assignedUserId) : null,
  createdByUserId: UserId(row.createdByUserId),
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
                  assignedUserId: args.assignedUserId,
                  createdByUserId: args.createdByUserId,
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

      existsBySlug: ({ projectId, slug, excludeId }) =>
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
            db.select({ one: sql<number>`1` }).from(savedSearches).where(conditions).limit(1),
          )
          return row !== undefined
        }),

      listByProject: ({ projectId, assignedUserId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const conditions = and(
            eq(savedSearches.organizationId, sqlClient.organizationId),
            eq(savedSearches.projectId, projectId),
            isNull(savedSearches.deletedAt),
            ...(assignedUserId ? [eq(savedSearches.assignedUserId, assignedUserId)] : []),
          )
          const rows = yield* sqlClient.query((db) =>
            db.select().from(savedSearches).where(conditions).orderBy(desc(savedSearches.createdAt)),
          )
          return { items: rows.map(toSavedSearch) }
        }),

      update: (args) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const setClause: Record<string, unknown> = {}
          if (args.slug !== undefined) setClause.slug = args.slug
          if (args.name !== undefined) setClause.name = args.name
          if (args.query !== undefined) setClause.query = args.query
          if (args.filterSet !== undefined) setClause.filterSet = args.filterSet
          if (args.assignedUserId !== undefined) setClause.assignedUserId = args.assignedUserId

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
