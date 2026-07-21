import { type AdminProjectTaxonomy, getProjectDetailsUseCase, getProjectTaxonomyUseCase } from "@domain/admin"
import { QueuePublisher } from "@domain/queue"
import { OrganizationId, ProjectId } from "@domain/shared"
import { triggerProjectGardeningUseCase } from "@domain/taxonomy"
import { AdminProjectRepositoryLive, AdminTaxonomyRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient, getQueuePublisher } from "../../server/clients.ts"

export interface AdminTaxonomySubcategoryDto {
  id: string
  categoryId: string | null
  name: string
  description: string
  observationCount: number
  state: "active" | "merged" | "deprecated"
  firstObservedAt: string
  lastObservedAt: string
  createdAt: string
  updatedAt: string
}

export interface AdminTaxonomyCategoryDto {
  id: string
  name: string
  description: string
  clusterCount: number
  observationCount: number
  state: "active" | "deprecated"
  clusteredAt: string
  createdAt: string
  updatedAt: string
  subcategories: AdminTaxonomySubcategoryDto[]
}

export interface AdminProjectTaxonomyDto {
  categories: AdminTaxonomyCategoryDto[]
  uncategorized: AdminTaxonomySubcategoryDto[]
}

const toSubcategoryDto = (subcategory: AdminProjectTaxonomy["uncategorized"][number]): AdminTaxonomySubcategoryDto => ({
  id: subcategory.id,
  categoryId: subcategory.categoryId,
  name: subcategory.name,
  description: subcategory.description,
  observationCount: subcategory.observationCount,
  state: subcategory.state,
  firstObservedAt: subcategory.firstObservedAt.toISOString(),
  lastObservedAt: subcategory.lastObservedAt.toISOString(),
  createdAt: subcategory.createdAt.toISOString(),
  updatedAt: subcategory.updatedAt.toISOString(),
})

const toDto = (taxonomy: AdminProjectTaxonomy): AdminProjectTaxonomyDto => ({
  categories: taxonomy.categories.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    clusterCount: category.clusterCount,
    observationCount: category.observationCount,
    state: category.state,
    clusteredAt: category.clusteredAt.toISOString(),
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
    subcategories: category.subcategories.map(toSubcategoryDto),
  })),
  uncategorized: taxonomy.uncategorized.map(toSubcategoryDto),
})

export const adminGetProjectTaxonomyInputSchema = z.object({
  projectId: z.string().min(1).max(256),
})

/**
 * Backoffice taxonomy fetch for a project.
 *
 * Guard: {@link adminMiddleware}. Queries use the admin Postgres client at
 * the default `OrganizationId("system")` scope so staff can inspect taxonomy
 * rows across organizations without tenant RLS filtering.
 */
export const adminGetProjectTaxonomy = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(adminGetProjectTaxonomyInputSchema)
  .handler(async ({ data }): Promise<AdminProjectTaxonomyDto> => {
    const taxonomy = await Effect.runPromise(
      getProjectTaxonomyUseCase({ projectId: ProjectId(data.projectId) }).pipe(
        withPostgres(AdminTaxonomyRepositoryLive, getAdminPostgresClient()),
        withTracing,
      ),
    )

    return toDto(taxonomy)
  })

export const adminTriggerProjectGardeningInputSchema = z.object({
  projectId: z.string().min(1).max(256),
})

export const adminTriggerProjectGardening = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminTriggerProjectGardeningInputSchema)
  .handler(async ({ data }): Promise<{ queued: true }> => {
    const project = await Effect.runPromise(
      getProjectDetailsUseCase({ projectId: ProjectId(data.projectId) }).pipe(
        withPostgres(AdminProjectRepositoryLive, getAdminPostgresClient()),
        withTracing,
      ),
    )
    const publisher = await getQueuePublisher()

    return await Effect.runPromise(
      triggerProjectGardeningUseCase({
        organizationId: OrganizationId(project.organization.id),
        projectId: ProjectId(project.id),
        reason: "manual",
      }).pipe(Effect.provideService(QueuePublisher, publisher), withTracing),
    )
  })
