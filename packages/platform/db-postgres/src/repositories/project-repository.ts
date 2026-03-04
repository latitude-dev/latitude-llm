import type { Project, ProjectRepository } from "@domain/projects"
import { type OrganizationId, type ProjectId, toRepositoryError } from "@domain/shared"
import { and, eq, isNull } from "drizzle-orm"
import { Effect } from "effect"
import type { PostgresDb } from "../client.ts"
import * as schema from "../schema/index.ts"

/**
 * Maps a database project row to a domain Project entity.
 */
const toDomainProject = (row: typeof schema.projects.$inferSelect): Project => ({
  id: row.id as Project["id"],
  organizationId: row.organizationId as Project["organizationId"],
  name: row.name,
  slug: row.slug,
  description: null, // Not in schema, default to null
  createdById: null, // Not in schema, default to null
  deletedAt: row.deletedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

/**
 * Maps a domain Project entity to a database insert row.
 */
const toInsertRow = (project: Project): typeof schema.projects.$inferInsert => ({
  id: project.id,
  organizationId: project.organizationId,
  name: project.name,
  slug: project.slug,
  deletedAt: project.deletedAt,
  // createdAt and updatedAt are set by defaultNow()
})

/**
 * Creates a Postgres implementation of the ProjectRepository port.
 */
export const createProjectPostgresRepository = (db: PostgresDb): ProjectRepository => ({
  findById: (id: ProjectId, organizationId: OrganizationId) =>
    Effect.gen(function* () {
      const [result] = yield* Effect.tryPromise({
        try: () =>
          db
            .select()
            .from(schema.projects)
            .where(
              and(
                eq(schema.projects.id, id),
                eq(schema.projects.organizationId, organizationId),
                isNull(schema.projects.deletedAt),
              ),
            )
            .limit(1),
        catch: (error) => toRepositoryError(error, "findById"),
      })

      return result ? toDomainProject(result) : null
    }),

  findByOrganizationId: (organizationId: OrganizationId) =>
    Effect.gen(function* () {
      const results = yield* Effect.tryPromise({
        try: () =>
          db
            .select()
            .from(schema.projects)
            .where(and(eq(schema.projects.organizationId, organizationId), isNull(schema.projects.deletedAt))),
        catch: (error) => toRepositoryError(error, "findByOrganizationId"),
      })

      return results.map(toDomainProject)
    }),

  findAllByOrganizationIdIncludingDeleted: (organizationId: OrganizationId) =>
    Effect.gen(function* () {
      const results = yield* Effect.tryPromise({
        try: () => db.select().from(schema.projects).where(eq(schema.projects.organizationId, organizationId)),
        catch: (error) => toRepositoryError(error, "findAllByOrganizationIdIncludingDeleted"),
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

  softDelete: (id: ProjectId, organizationId: OrganizationId) =>
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () =>
          db
            .update(schema.projects)
            .set({
              deletedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(and(eq(schema.projects.id, id), eq(schema.projects.organizationId, organizationId))),
        catch: (error) => toRepositoryError(error, "softDelete"),
      })
    }),

  hardDelete: (id: ProjectId, organizationId: OrganizationId) =>
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () =>
          db
            .delete(schema.projects)
            .where(and(eq(schema.projects.id, id), eq(schema.projects.organizationId, organizationId))),
        catch: (error) => toRepositoryError(error, "hardDelete"),
      })
    }),

  existsByName: (name: string, organizationId: OrganizationId) =>
    Effect.gen(function* () {
      const [result] = yield* Effect.tryPromise({
        try: () =>
          db
            .select({ id: schema.projects.id })
            .from(schema.projects)
            .where(
              and(
                eq(schema.projects.organizationId, organizationId),
                eq(schema.projects.name, name),
                isNull(schema.projects.deletedAt),
              ),
            )
            .limit(1),
        catch: (error) => toRepositoryError(error, "existsByName"),
      })

      return result !== undefined
    }),

  existsBySlug: (slug: string, organizationId: OrganizationId) =>
    Effect.gen(function* () {
      const [result] = yield* Effect.tryPromise({
        try: () =>
          db
            .select({ id: schema.projects.id })
            .from(schema.projects)
            .where(
              and(
                eq(schema.projects.organizationId, organizationId),
                eq(schema.projects.slug, slug),
                isNull(schema.projects.deletedAt),
              ),
            )
            .limit(1),
        catch: (error) => toRepositoryError(error, "existsBySlug"),
      })

      return result !== undefined
    }),
})
