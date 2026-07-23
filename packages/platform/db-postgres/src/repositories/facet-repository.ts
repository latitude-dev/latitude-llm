import { FacetId, NotFoundError, OrganizationId, ProjectId, SqlClient, type SqlClientShape } from "@domain/shared"
import { FacetRepository, type TaxonomyFacet } from "@domain/taxonomy"
import { and, desc, eq, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { taxonomyFacets } from "../schema/taxonomy-facets.ts"

const toFacet = (row: typeof taxonomyFacets.$inferSelect): TaxonomyFacet => ({
  id: FacetId(row.id),
  organizationId: OrganizationId(row.organizationId),
  projectId: ProjectId(row.projectId),
  slug: row.slug,
  name: row.name,
  description: row.description,
  instructions: row.instructions,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export const FacetRepositoryLive = Layer.effect(
  FacetRepository,
  Effect.gen(function* () {
    return {
      findById: (id) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [row] = yield* sqlClient.query((db, organizationId) =>
            db
              .select()
              .from(taxonomyFacets)
              .where(and(eq(taxonomyFacets.organizationId, organizationId), eq(taxonomyFacets.id, id)))
              .limit(1),
          )
          if (!row) return yield* new NotFoundError({ entity: "TaxonomyFacet", id })
          return toFacet(row)
        }),

      findBySlug: ({ projectId, slug }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [row] = yield* sqlClient.query((db, organizationId) =>
            db
              .select()
              .from(taxonomyFacets)
              .where(
                and(
                  eq(taxonomyFacets.organizationId, organizationId),
                  eq(taxonomyFacets.projectId, projectId),
                  eq(taxonomyFacets.slug, slug),
                ),
              )
              .limit(1),
          )
          return row ? toFacet(row) : null
        }),

      listByProject: ({ projectId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db, organizationId) =>
            db
              .select()
              .from(taxonomyFacets)
              .where(and(eq(taxonomyFacets.organizationId, organizationId), eq(taxonomyFacets.projectId, projectId)))
              .orderBy(desc(taxonomyFacets.createdAt)),
          )
          return rows.map(toFacet)
        }),

      countByProject: ({ projectId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [row] = yield* sqlClient.query((db, organizationId) =>
            db
              .select({ count: sql<number>`count(*)::int` })
              .from(taxonomyFacets)
              .where(and(eq(taxonomyFacets.organizationId, organizationId), eq(taxonomyFacets.projectId, projectId))),
          )
          return row?.count ?? 0
        }),

      countBySlug: ({ projectId, slug }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [row] = yield* sqlClient.query((db, organizationId) =>
            db
              .select({ count: sql<number>`count(*)::int` })
              .from(taxonomyFacets)
              .where(
                and(
                  eq(taxonomyFacets.organizationId, organizationId),
                  eq(taxonomyFacets.projectId, projectId),
                  eq(taxonomyFacets.slug, slug),
                ),
              ),
          )
          return row?.count ?? 0
        }),

      save: (facet) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          // `instructions` is write-once, so only presentation fields + updatedAt change on conflict.
          yield* sqlClient.query((db, organizationId) =>
            db
              .insert(taxonomyFacets)
              .values({
                id: facet.id,
                organizationId,
                projectId: facet.projectId,
                slug: facet.slug,
                name: facet.name,
                description: facet.description,
                instructions: facet.instructions,
                createdAt: facet.createdAt,
                updatedAt: facet.updatedAt,
              })
              .onConflictDoUpdate({
                target: taxonomyFacets.id,
                set: {
                  name: facet.name,
                  description: facet.description,
                  updatedAt: facet.updatedAt,
                },
              }),
          )
        }),

      markGardened: ({ id, gardenedAt }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db, organizationId) =>
            db
              .update(taxonomyFacets)
              .set({ lastGardenedAt: gardenedAt })
              .where(and(eq(taxonomyFacets.organizationId, organizationId), eq(taxonomyFacets.id, id))),
          )
        }),

      delete: (id) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db, organizationId) =>
            db
              .delete(taxonomyFacets)
              .where(and(eq(taxonomyFacets.organizationId, organizationId), eq(taxonomyFacets.id, id))),
          )
        }),
    }
  }),
)
