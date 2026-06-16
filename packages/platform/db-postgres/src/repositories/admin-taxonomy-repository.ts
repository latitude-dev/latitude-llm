import {
  type AdminProjectTaxonomy,
  type AdminTaxonomyCategory,
  AdminTaxonomyRepository,
  type AdminTaxonomySubcategory,
} from "@domain/admin"
import { NotFoundError, type ProjectId, SqlClient, type SqlClientShape } from "@domain/shared"
import { isDisplayableTaxonomyName } from "@domain/taxonomy"
import { and, asc, desc, eq, isNull } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { projects } from "../schema/projects.ts"
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

          const clusterRows = yield* sqlClient.query((db) =>
            db
              .select({
                id: taxonomyClusters.id,
                parentClusterId: taxonomyClusters.parentClusterId,
                path: taxonomyClusters.path,
                name: taxonomyClusters.name,
                description: taxonomyClusters.description,
                observationCount: taxonomyClusters.observationCount,
                state: taxonomyClusters.state,
                firstObservedAt: taxonomyClusters.firstObservedAt,
                lastObservedAt: taxonomyClusters.lastObservedAt,
                clusteredAt: taxonomyClusters.clusteredAt,
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

          const visibleRows = clusterRows.filter(
            (row) => row.state === "active" && isDisplayableTaxonomyName(row.name) && row.observationCount > 0,
          )
          const rootRows = clusterRows.filter(
            (row) => row.parentClusterId === null && row.state === "active" && isDisplayableTaxonomyName(row.name),
          )
          const rootIds = new Set(rootRows.map((row) => row.id))
          const subcategoriesByRoot = new Map<string, AdminTaxonomySubcategory[]>()

          for (const row of visibleRows) {
            if (row.parentClusterId === null) continue
            const rootId = row.path.split("/")[0] ?? ""
            if (!rootIds.has(rootId)) continue
            const subcategory: AdminTaxonomySubcategory = {
              id: row.id,
              categoryId: rootId,
              name: row.name,
              description: row.description,
              observationCount: row.observationCount,
              state: row.state,
              firstObservedAt: row.firstObservedAt,
              lastObservedAt: row.lastObservedAt,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            }
            const existing = subcategoriesByRoot.get(rootId) ?? []
            existing.push(subcategory)
            subcategoriesByRoot.set(rootId, existing)
          }

          const categories: AdminTaxonomyCategory[] = rootRows.flatMap((row) => {
            const subcategories = subcategoriesByRoot.get(row.id) ?? []
            const observationCount =
              row.observationCount + subcategories.reduce((sum, subcategory) => sum + subcategory.observationCount, 0)
            if (observationCount === 0) return []
            return [
              {
                id: row.id,
                name: row.name,
                description: row.description,
                clusterCount: subcategories.length,
                observationCount,
                state: "active",
                clusteredAt: row.clusteredAt,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                subcategories,
              },
            ]
          })

          return { categories, uncategorized: [] } satisfies AdminProjectTaxonomy
        }),
    }
  }),
)
