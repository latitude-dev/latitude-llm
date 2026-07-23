import {
  CustomBehaviorId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { type CustomBehavior, CustomBehaviorRepository } from "@domain/taxonomy"
import { and, desc, eq, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { customBehaviors } from "../schema/custom-behaviors.ts"

const toCustomBehavior = (row: typeof customBehaviors.$inferSelect): CustomBehavior => ({
  id: CustomBehaviorId(row.id),
  organizationId: OrganizationId(row.organizationId),
  projectId: ProjectId(row.projectId),
  slug: row.slug,
  name: row.name,
  filterSet: row.filterSet,
  status: row.status,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export const CustomBehaviorRepositoryLive = Layer.effect(
  CustomBehaviorRepository,
  Effect.gen(function* () {
    return {
      findById: (id) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [row] = yield* sqlClient.query((db, organizationId) =>
            db
              .select()
              .from(customBehaviors)
              .where(and(eq(customBehaviors.organizationId, organizationId), eq(customBehaviors.id, id)))
              .limit(1),
          )
          if (!row) {
            return yield* new NotFoundError({ entity: "CustomBehavior", id })
          }
          return toCustomBehavior(row)
        }),

      findBySlug: ({ projectId, slug }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [row] = yield* sqlClient.query((db, organizationId) =>
            db
              .select()
              .from(customBehaviors)
              .where(
                and(
                  eq(customBehaviors.organizationId, organizationId),
                  eq(customBehaviors.projectId, projectId),
                  eq(customBehaviors.slug, slug),
                ),
              )
              .limit(1),
          )
          return row ? toCustomBehavior(row) : null
        }),

      listByProject: ({ projectId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db, organizationId) =>
            db
              .select()
              .from(customBehaviors)
              .where(and(eq(customBehaviors.organizationId, organizationId), eq(customBehaviors.projectId, projectId)))
              .orderBy(desc(customBehaviors.createdAt)),
          )
          return rows.map(toCustomBehavior)
        }),

      countByProject: ({ projectId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [row] = yield* sqlClient.query((db, organizationId) =>
            db
              .select({ count: sql<number>`count(*)::int` })
              .from(customBehaviors)
              .where(and(eq(customBehaviors.organizationId, organizationId), eq(customBehaviors.projectId, projectId))),
          )
          return row?.count ?? 0
        }),

      countBySlug: ({ projectId, slug }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [row] = yield* sqlClient.query((db, organizationId) =>
            db
              .select({ count: sql<number>`count(*)::int` })
              .from(customBehaviors)
              .where(
                and(
                  eq(customBehaviors.organizationId, organizationId),
                  eq(customBehaviors.projectId, projectId),
                  eq(customBehaviors.slug, slug),
                ),
              ),
          )
          return row?.count ?? 0
        }),

      save: (behavior) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db, organizationId) =>
            db
              .insert(customBehaviors)
              .values({
                id: behavior.id,
                organizationId,
                projectId: behavior.projectId,
                name: behavior.name,
                slug: behavior.slug,
                filterSet: behavior.filterSet,
                status: behavior.status,
                createdAt: behavior.createdAt,
                updatedAt: behavior.updatedAt,
              })
              .onConflictDoUpdate({
                target: customBehaviors.id,
                set: {
                  name: behavior.name,
                  slug: behavior.slug,
                  filterSet: behavior.filterSet,
                  status: behavior.status,
                  updatedAt: behavior.updatedAt,
                },
              }),
          )
        }),

      markGardened: ({ id, gardenedAt }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db, organizationId) =>
            db
              .update(customBehaviors)
              .set({ lastGardenedAt: gardenedAt })
              .where(and(eq(customBehaviors.organizationId, organizationId), eq(customBehaviors.id, id))),
          )
        }),

      delete: (id) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db, organizationId) =>
            db
              .delete(customBehaviors)
              .where(and(eq(customBehaviors.organizationId, organizationId), eq(customBehaviors.id, id))),
          )
        }),
    }
  }),
)
