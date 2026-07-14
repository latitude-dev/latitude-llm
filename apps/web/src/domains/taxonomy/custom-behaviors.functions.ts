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
  generateCustomBehavior,
  previewCustomBehaviorSampleUseCase,
  updateCustomBehavior,
} from "@domain/taxonomy"
import { TaxonomyObservationRepositoryLive } from "@platform/db-clickhouse"
import { CustomBehaviorRepositoryLive } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
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

const toRecord = (behavior: CustomBehavior): CustomBehaviorRecord => ({
  id: behavior.id,
  organizationId: behavior.organizationId,
  projectId: behavior.projectId,
  slug: behavior.slug,
  name: behavior.name,
  filterSet: behavior.filterSet,
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
    return behaviors.map(toRecord)
  })

export const createCustomBehaviorFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      name: nameSchema,
      filterSet: customBehaviorFilterSetSchema,
    }),
  )
  .handler(async ({ data, context }): Promise<CustomBehaviorRecord> => {
    const orgId = await resolveOrgScope(context)

    const created = await Effect.runPromise(
      createCustomBehavior({
        projectId: ProjectId(data.projectId),
        name: data.name,
        filterSet: data.filterSet,
      }).pipe(withScopedPostgres(CustomBehaviorRepositoryLive, getPostgresClient(), orgId), withTracing),
    )
    return toRecord(created)
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

    const updated = await Effect.runPromise(
      updateCustomBehavior({
        id: CustomBehaviorId(data.id),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.filterSet !== undefined ? { filterSet: data.filterSet } : {}),
      }).pipe(withScopedPostgres(CustomBehaviorRepositoryLive, getPostgresClient(), orgId), withTracing),
    )
    return toRecord(updated)
  })

export const deleteCustomBehaviorFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data, context }): Promise<void> => {
    const orgId = await resolveOrgScope(context)

    await Effect.runPromise(
      deleteCustomBehavior({ id: CustomBehaviorId(data.id) }).pipe(
        withScopedPostgres(CustomBehaviorRepositoryLive, getPostgresClient(), orgId),
        withTracing,
      ),
    )
  })

export const generateCustomBehaviorFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data, context }): Promise<CustomBehaviorRecord> => {
    const orgId = await resolveOrgScope(context)
    const publisher = await getQueuePublisher()

    const updated = await Effect.runPromise(
      generateCustomBehavior({
        customBehaviorId: CustomBehaviorId(data.id),
      }).pipe(
        Effect.provideService(QueuePublisher, publisher),
        withScopedPostgres(CustomBehaviorRepositoryLive, getPostgresClient(), orgId),
        withTracing,
      ),
    )
    return toRecord(updated)
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
