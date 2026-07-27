import { QueuePublisher } from "@domain/queue"
import { CustomBehaviorId, type FilterSet, ProjectId, toSlug } from "@domain/shared"
import {
  CUSTOM_BEHAVIOR_NAME_MAX_LENGTH,
  type CustomBehavior,
  CustomBehaviorRepository,
  type CustomBehaviorStatus,
  createCustomBehavior,
  customBehaviorFilterSetSchema,
  deleteCustomBehavior,
  facetSelectionSchema,
  previewCustomBehaviorSampleUseCase,
  updateCustomBehavior,
} from "@domain/taxonomy"
import {
  FacetProjectionRepositoryLive,
  TaxonomyObservationRepositoryLive,
  TaxonomyViewAssignmentRepositoryLive,
} from "@platform/db-clickhouse"
import { CustomBehaviorRepositoryLive, FacetRepositoryLive, TaxonomyClusterRepositoryLive } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { getClickhouseClient, getPostgresClient, getQueuePublisher } from "../../server/clients.ts"
import { resolveOrgScope } from "../../server/resolve-org-scope.ts"
import { withScopedClickHouse } from "../../server/scoped-clickhouse.ts"
import { withScopedPostgres } from "../../server/scoped-postgres.ts"

export interface CustomBehaviorRecord {
  readonly id: string
  readonly organizationId: string
  readonly projectId: string
  readonly slug: string
  readonly name: string
  readonly filterSet: FilterSet
  /** null = the global topic; an id = the facet this view gardens on. */
  readonly facetId: string | null
  readonly status: CustomBehaviorStatus
  readonly createdAt: string
  readonly updatedAt: string
}

interface CustomBehaviorPreviewRecord {
  readonly sessionCount: number
  readonly observationCount: number
  readonly minObservations: number
  readonly isReady: boolean
}

export const toCustomBehaviorRecord = (behavior: CustomBehavior): CustomBehaviorRecord => ({
  id: behavior.id,
  organizationId: behavior.organizationId,
  projectId: behavior.projectId,
  slug: behavior.slug,
  name: behavior.name,
  filterSet: behavior.filterSet,
  facetId: behavior.facetId,
  status: behavior.status,
  createdAt: behavior.createdAt.toISOString(),
  updatedAt: behavior.updatedAt.toISOString(),
})

// Mirrors the domain name rules (create/update use-cases) as Zod so a bad name
// surfaces as an inline field error rather than only a toast; the use-case still
// enforces the same rules server-side as defense-in-depth.
const nameSchema = z
  .string()
  .trim()
  .min(1, "Name cannot be empty")
  .max(CUSTOM_BEHAVIOR_NAME_MAX_LENGTH, `Name exceeds ${CUSTOM_BEHAVIOR_NAME_MAX_LENGTH} characters`)
  .refine((value) => toSlug(value).length > 0, "Name must contain at least one letter or number")

export const listCustomBehaviors = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data, context }): Promise<readonly CustomBehaviorRecord[]> => {
    const orgId = await resolveOrgScope(context)

    const behaviors = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* CustomBehaviorRepository
        return yield* repo.listByProject({
          projectId: ProjectId(data.projectId),
        })
      }).pipe(withScopedPostgres(CustomBehaviorRepositoryLive, getPostgresClient(), orgId), withTracing),
    )
    return behaviors.map(toCustomBehaviorRecord)
  })

export const createCustomBehaviorFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      name: nameSchema,
      filterSet: customBehaviorFilterSetSchema,
      // The facet selection: omit for the topic (needs a non-empty filter). A preset
      // is find-or-created, a newFacet is created, both atomically with the behavior.
      facetSelection: facetSelectionSchema.optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<CustomBehaviorRecord> => {
    const orgId = await resolveOrgScope(context)
    // Creating a behavior auto-starts its first gardening run, so the create
    // use-case enqueues through the QueuePublisher.
    const publisher = await getQueuePublisher()

    const created = await Effect.runPromise(
      createCustomBehavior({
        projectId: ProjectId(data.projectId),
        name: data.name,
        filterSet: data.filterSet,
        ...(data.facetSelection ? { facetSelection: data.facetSelection } : {}),
      }).pipe(
        Effect.provideService(QueuePublisher, publisher),
        withScopedPostgres(
          Layer.mergeAll(CustomBehaviorRepositoryLive, FacetRepositoryLive),
          getPostgresClient(),
          orgId,
        ),
        withTracing,
      ),
    )
    return toCustomBehaviorRecord(created)
  })

export const updateCustomBehaviorFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
      name: nameSchema.optional(),
      filterSet: customBehaviorFilterSetSchema.optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<CustomBehaviorRecord> => {
    const orgId = await resolveOrgScope(context)
    // A cohort change re-gardens the view from scratch, so the use-case needs both the
    // assignment slice (to purge) and a QueuePublisher (to enqueue the run).
    const publisher = await getQueuePublisher()

    const updated = await Effect.runPromise(
      updateCustomBehavior({
        id: CustomBehaviorId(data.id),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.filterSet !== undefined ? { filterSet: data.filterSet } : {}),
      }).pipe(
        Effect.provideService(QueuePublisher, publisher),
        withScopedPostgres(CustomBehaviorRepositoryLive, getPostgresClient(), orgId),
        withScopedClickHouse(TaxonomyViewAssignmentRepositoryLive, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
    return toCustomBehaviorRecord(updated)
  })

export const deleteCustomBehaviorFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data, context }): Promise<void> => {
    const orgId = await resolveOrgScope(context)

    await Effect.runPromise(
      deleteCustomBehavior({ id: CustomBehaviorId(data.id) }).pipe(
        withScopedPostgres(
          Layer.mergeAll(CustomBehaviorRepositoryLive, TaxonomyClusterRepositoryLive, FacetRepositoryLive),
          getPostgresClient(),
          orgId,
        ),
        withScopedClickHouse(
          Layer.mergeAll(TaxonomyViewAssignmentRepositoryLive, FacetProjectionRepositoryLive),
          getClickhouseClient(),
          orgId,
        ),
        withTracing,
      ),
    )
  })

export const previewCustomBehaviorSample = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      filterSet: customBehaviorFilterSetSchema,
    }),
  )
  .handler(async ({ data, context }): Promise<CustomBehaviorPreviewRecord> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      previewCustomBehaviorSampleUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        filterSet: data.filterSet,
      }).pipe(withScopedClickHouse(TaxonomyObservationRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })
