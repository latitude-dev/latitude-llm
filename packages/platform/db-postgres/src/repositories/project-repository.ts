import type { Project } from "@domain/projects"
import { ProjectRepository } from "@domain/projects"
import {
  NotFoundError,
  OrganizationId,
  ProjectId,
  type ProjectId as ProjectIdType,
  type ProjectSettings,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { and, eq, isNull } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { projects } from "../schema/projects.ts"

const toDomainProject = (row: typeof projects.$inferSelect): Project => ({
  id: ProjectId(row.id),
  organizationId: OrganizationId(row.organizationId),
  name: row.name,
  slug: row.slug,
  settings: (row.settings as ProjectSettings | null) ?? null,
  firstTraceAt: row.firstTraceAt,
  deletedAt: row.deletedAt,
  lastEditedAt: row.lastEditedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

const toInsertRow = (project: Project): typeof projects.$inferInsert => ({
  id: project.id,
  organizationId: project.organizationId,
  name: project.name,
  slug: project.slug,
  settings: project.settings,
  firstTraceAt: project.firstTraceAt,
  deletedAt: project.deletedAt,
})

/**
 * Live layer that pulls db from SqlClient
 */
export const ProjectRepositoryLive = Layer.effect(
  ProjectRepository,
  Effect.gen(function* () {
    const list = () =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        return yield* sqlClient
          .query((db, organizationId) =>
            db
              .select()
              .from(projects)
              .where(and(eq(projects.organizationId, organizationId), isNull(projects.deletedAt))),
          )
          .pipe(Effect.map((results) => results.map(toDomainProject)))
      })

    const listIncludingDeleted = () =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        return yield* sqlClient
          .query((db, organizationId) => db.select().from(projects).where(eq(projects.organizationId, organizationId)))
          .pipe(Effect.map((results) => results.map(toDomainProject)))
      })

    return {
      findById: (id: ProjectIdType) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(projects)
                .where(
                  and(eq(projects.organizationId, organizationId), eq(projects.id, id), isNull(projects.deletedAt)),
                )
                .limit(1),
            )
            .pipe(
              Effect.flatMap((results) => {
                const [result] = results
                if (!result) {
                  return Effect.fail(new NotFoundError({ entity: "Project", id }))
                }
                return Effect.succeed(toDomainProject(result))
              }),
            )
        }),

      findBySlug: (slug: string) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(projects)
                .where(
                  and(eq(projects.organizationId, organizationId), eq(projects.slug, slug), isNull(projects.deletedAt)),
                )
                .limit(1),
            )
            .pipe(
              Effect.flatMap((results) => {
                const [result] = results
                if (!result) {
                  return Effect.fail(new NotFoundError({ entity: "Project", id: slug }))
                }
                return Effect.succeed(toDomainProject(result))
              }),
            )
        }),

      list,

      listIncludingDeleted,

      save: (project: Project) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const row = toInsertRow(project)

          yield* sqlClient.query((db) =>
            db
              .insert(projects)
              .values(row)
              .onConflictDoUpdate({
                target: projects.id,
                set: {
                  name: row.name,
                  slug: row.slug,
                  settings: row.settings,
                  deletedAt: row.deletedAt,
                  lastEditedAt: new Date(),
                  updatedAt: new Date(),
                },
              }),
          )
        }),

      softDelete: (id: ProjectIdType) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(projects)
                .set({ deletedAt: new Date(), updatedAt: new Date() })
                .where(
                  and(eq(projects.organizationId, organizationId), eq(projects.id, id), isNull(projects.deletedAt)),
                )
                .returning({ id: projects.id }),
            )
            .pipe(
              Effect.flatMap((results) => {
                if (results.length === 0) {
                  return Effect.fail(new NotFoundError({ entity: "Project", id }))
                }
                return Effect.void
              }),
            )
        }),

      hardDelete: (id: ProjectIdType) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db, organizationId) =>
            db.delete(projects).where(and(eq(projects.organizationId, organizationId), eq(projects.id, id))),
          )
        }),

      existsByName: (name: string) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select({ id: projects.id })
                .from(projects)
                .where(
                  and(eq(projects.organizationId, organizationId), eq(projects.name, name), isNull(projects.deletedAt)),
                )
                .limit(1),
            )
            .pipe(Effect.map((results) => results[0] !== undefined))
        }),

      existsBySlug: (slug: string) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select({ id: projects.id })
                .from(projects)
                .where(
                  and(eq(projects.organizationId, organizationId), eq(projects.slug, slug), isNull(projects.deletedAt)),
                )
                .limit(1),
            )
            .pipe(Effect.map((results) => results[0] !== undefined))
        }),
    }
  }),
)
