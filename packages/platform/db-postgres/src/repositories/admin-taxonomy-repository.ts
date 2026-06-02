import {
  type AdminProjectTaxonomy,
  type AdminTaxonomyCategory,
  AdminTaxonomyRepository,
  type AdminTaxonomySubcategory,
} from "@domain/admin"
import { NotFoundError, type ProjectId, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, asc, desc, eq, isNull } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { projects } from "../schema/projects.ts"
import { taxonomyCategories } from "../schema/taxonomy-categories.ts"
import { taxonomyClusters } from "../schema/taxonomy-clusters.ts"

/**
 * Live layer for the backoffice taxonomy port.
 *
 * ⚠️ SECURITY: queries run **without** an `organization_id` filter and
 * see taxonomy rows across every tenant. Only safe when the SqlClient was
 * constructed with `OrganizationId("system")` (the default on
 * `getAdminPostgresClient()`) so RLS is bypassed. Never provide this
 * layer on the standard app-facing Postgres client.
 */
export const AdminTaxonomyRepositoryLive = Layer.effect(
  AdminTaxonomyRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      getProjectTaxonomy: (projectId: ProjectId) =>
        Effect.gen(function* () {
          const projectRows = yield* sqlClient.query((db) =>
            db
              .select({ id: projects.id, organizationId: projects.organizationId })
              .from(projects)
              .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
              .limit(1),
          )
          const project = projectRows[0]
          if (!project) {
            return yield* Effect.fail(new NotFoundError({ entity: "Project", id: projectId }))
          }

          const categoryRows = yield* sqlClient.query((db) =>
            db
              .select({
                id: taxonomyCategories.id,
                name: taxonomyCategories.name,
                description: taxonomyCategories.description,
                clusterCount: taxonomyCategories.clusterCount,
                observationCount: taxonomyCategories.observationCount,
                state: taxonomyCategories.state,
                clusteredAt: taxonomyCategories.clusteredAt,
                createdAt: taxonomyCategories.createdAt,
                updatedAt: taxonomyCategories.updatedAt,
              })
              .from(taxonomyCategories)
              .where(
                and(
                  eq(taxonomyCategories.organizationId, project.organizationId),
                  eq(taxonomyCategories.projectId, projectId),
                ),
              )
              .orderBy(desc(taxonomyCategories.observationCount), asc(taxonomyCategories.name)),
          )

          const clusterRows = yield* sqlClient.query((db) =>
            db
              .select({
                id: taxonomyClusters.id,
                categoryId: taxonomyClusters.parentCategoryId,
                name: taxonomyClusters.name,
                description: taxonomyClusters.description,
                observationCount: taxonomyClusters.observationCount,
                state: taxonomyClusters.state,
                firstObservedAt: taxonomyClusters.firstObservedAt,
                lastObservedAt: taxonomyClusters.lastObservedAt,
                createdAt: taxonomyClusters.createdAt,
                updatedAt: taxonomyClusters.updatedAt,
              })
              .from(taxonomyClusters)
              .where(
                and(
                  eq(taxonomyClusters.organizationId, project.organizationId),
                  eq(taxonomyClusters.projectId, projectId),
                ),
              )
              .orderBy(desc(taxonomyClusters.observationCount), asc(taxonomyClusters.name)),
          )

          const categoryIds = new Set(categoryRows.map((row) => row.id))
          const subcategoriesByCategory = new Map<string, AdminTaxonomySubcategory[]>()
          const uncategorized: AdminTaxonomySubcategory[] = []

          for (const row of clusterRows) {
            const subcategory: AdminTaxonomySubcategory = {
              id: row.id,
              categoryId: row.categoryId,
              name: row.name,
              description: row.description,
              observationCount: row.observationCount,
              state: row.state,
              firstObservedAt: row.firstObservedAt,
              lastObservedAt: row.lastObservedAt,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            }

            if (row.categoryId === null || !categoryIds.has(row.categoryId)) {
              uncategorized.push(subcategory)
              continue
            }

            const existing = subcategoriesByCategory.get(row.categoryId) ?? []
            existing.push(subcategory)
            subcategoriesByCategory.set(row.categoryId, existing)
          }

          const categories: AdminTaxonomyCategory[] = categoryRows.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            clusterCount: row.clusterCount,
            observationCount: row.observationCount,
            state: row.state,
            clusteredAt: row.clusteredAt,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            subcategories: subcategoriesByCategory.get(row.id) ?? [],
          }))

          return { categories, uncategorized } satisfies AdminProjectTaxonomy
        }),
    }
  }),
)
