import type { Project } from "@domain/projects"
import {
  NotFoundError,
  OrganizationId,
  ProjectId,
  type ProjectId as ProjectIdType,
  toRepositoryError,
} from "@domain/shared"
import { and, eq, isNull } from "drizzle-orm"
import { Effect } from "effect"
import type { PostgresDb } from "../client.ts"
import * as schema from "../schema/index.ts"

const toDomainProject = (row: typeof schema.projects.$inferSelect): Project => ({
  id: ProjectId(row.id),
  organizationId: OrganizationId(row.organizationId),
  name: row.name,
  slug: row.slug,
  description: null,
  createdById: null,
  deletedAt: row.deletedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

const toInsertRow = (project: Project): typeof schema.projects.$inferInsert => ({
  id: project.id,
  organizationId: project.organizationId,
  name: project.name,
  slug: project.slug,
  deletedAt: project.deletedAt,
})

/**
 * Expects a db handle that already has RLS context set (via runCommand at the call site).
 * Callers own the transaction boundary to preserve atomicity across multiple repo ops.
 */
export const createProjectPostgresRepository = (db: PostgresDb) => {
  return {
    findById: (id: ProjectIdType) =>
      Effect.gen(function* () {
        const [result] = yield* Effect.tryPromise({
          try: () =>
            db
              .select()
              .from(schema.projects)
              .where(and(eq(schema.projects.id, id), isNull(schema.projects.deletedAt)))
              .limit(1),
          catch: (error) => toRepositoryError(error, "findById"),
        })

        if (!result) {
          return yield* new NotFoundError({ entity: "Project", id })
        }

        return toDomainProject(result)
      }),

    findAll: () =>
      Effect.gen(function* () {
        const results = yield* Effect.tryPromise({
          try: () => db.select().from(schema.projects).where(isNull(schema.projects.deletedAt)),
          catch: (error) => toRepositoryError(error, "findAll"),
        })

        return results.map(toDomainProject)
      }),

    findAllIncludingDeleted: () =>
      Effect.gen(function* () {
        const results = yield* Effect.tryPromise({
          try: () => db.select().from(schema.projects),
          catch: (error) => toRepositoryError(error, "findAllIncludingDeleted"),
        })

        return results.map(toDomainProject)
      }),

    save: (project: Project) =>
      Effect.gen(function* () {
        const row = toInsertRow(project)

        yield* Effect.tryPromise({
          try: () =>
            db
              .insert(schema.projects)
              .values(row)
              .onConflictDoUpdate({
                target: schema.projects.id,
                set: {
                  name: row.name,
                  slug: row.slug,
                  deletedAt: row.deletedAt,
                  updatedAt: new Date(),
                },
              }),
          catch: (error) => toRepositoryError(error, "save"),
        })
      }),

    softDelete: (id: ProjectIdType) =>
      Effect.tryPromise({
        try: () =>
          db
            .update(schema.projects)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(eq(schema.projects.id, id)),
        catch: (error) => toRepositoryError(error, "softDelete"),
      }),

    hardDelete: (id: ProjectIdType) =>
      Effect.tryPromise({
        try: () => db.delete(schema.projects).where(eq(schema.projects.id, id)),
        catch: (error) => toRepositoryError(error, "hardDelete"),
      }),

    existsByName: (name: string) =>
      Effect.gen(function* () {
        const [result] = yield* Effect.tryPromise({
          try: () =>
            db
              .select({ id: schema.projects.id })
              .from(schema.projects)
              .where(and(eq(schema.projects.name, name), isNull(schema.projects.deletedAt)))
              .limit(1),
          catch: (error) => toRepositoryError(error, "existsByName"),
        })

        return result !== undefined
      }),

    existsBySlug: (slug: string) =>
      Effect.gen(function* () {
        const [result] = yield* Effect.tryPromise({
          try: () =>
            db
              .select({ id: schema.projects.id })
              .from(schema.projects)
              .where(and(eq(schema.projects.slug, slug), isNull(schema.projects.deletedAt)))
              .limit(1),
          catch: (error) => toRepositoryError(error, "existsBySlug"),
        })

        return result !== undefined
      }),
  }
}
