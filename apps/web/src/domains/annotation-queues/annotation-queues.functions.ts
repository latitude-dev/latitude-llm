import {
  type AnnotationQueueListCursor,
  AnnotationQueueRepository,
  type AnnotationQueueSettings,
  createQueueUseCase,
  deleteQueueUseCase,
  evictProjectFlaggersUseCase,
  FlaggerRepository,
  getQueueStrategy,
  isLlmCapableStrategy,
  updateFlaggerUseCase,
  updateQueueUseCase,
} from "@domain/annotation-queues"
import { OrganizationId, ProjectId } from "@domain/shared"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import { AnnotationQueueRepositoryLive, FlaggerRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { queueInputSchema } from "../../components/annotation-queues/queue-form-schema.ts"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient, getRedisClient } from "../../server/clients.ts"

const queueListCursorSchema = z.object({
  sortValue: z.string(),
  id: z.string(),
})

const listSortBySchema = z.enum(["createdAt", "name", "completedItems", "pendingItems"])

interface AnnotationQueueListResult {
  readonly queues: readonly AnnotationQueueRecord[]
  readonly hasMore: boolean
  readonly nextCursor?: AnnotationQueueListCursor
}

const toAnnotationQueueRecord = (q: {
  id: string
  organizationId: string
  projectId: string
  system: boolean
  slug: string
  name: string
  description: string
  instructions: string
  settings: AnnotationQueueSettings
  assignees: readonly string[]
  totalItems: number
  completedItems: number
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}) => ({
  id: q.id,
  organizationId: q.organizationId,
  projectId: q.projectId,
  system: q.system,
  slug: q.slug,
  name: q.name,
  description: q.description,
  instructions: q.instructions,
  settings: q.settings,
  assignees: q.assignees,
  totalItems: q.totalItems,
  completedItems: q.completedItems,
  deletedAt: q.deletedAt ? q.deletedAt.toISOString() : null,
  createdAt: q.createdAt.toISOString(),
  updatedAt: q.updatedAt.toISOString(),
})

export type AnnotationQueueRecord = ReturnType<typeof toAnnotationQueueRecord>

const deterministicFlaggerDetails: Record<string, { readonly name: string; readonly description: string }> = {
  "tool-call-errors": {
    name: "Tool call errors",
    description: "Flags malformed, duplicate, or explicitly failed tool responses without calling an LLM.",
  },
  "output-schema-validation": {
    name: "Output schema validation",
    description: "Flags malformed or truncated structured output in assistant responses without calling an LLM.",
  },
  "empty-response": {
    name: "Empty response",
    description: "Flags empty, whitespace-only, or degenerate assistant responses without calling an LLM.",
  },
}

const humanizeSlug = (slug: string) => slug.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())

const toFlaggerRecord = (flagger: {
  readonly id: string
  readonly organizationId: string
  readonly projectId: string
  readonly slug: string
  readonly enabled: boolean
  readonly sampling: number
  readonly createdAt: Date
  readonly updatedAt: Date
}) => {
  const strategy = getQueueStrategy(flagger.slug)
  const details =
    strategy && isLlmCapableStrategy(strategy) ? strategy.annotator : deterministicFlaggerDetails[flagger.slug]

  return {
    id: flagger.id,
    organizationId: flagger.organizationId,
    projectId: flagger.projectId,
    slug: flagger.slug,
    name: details?.name ?? humanizeSlug(flagger.slug),
    description: details?.description ?? "Flags matching trace behavior for review.",
    instructions:
      strategy && isLlmCapableStrategy(strategy)
        ? strategy.annotator.instructions
        : "Runs deterministically from telemetry data and does not call an LLM.",
    enabled: flagger.enabled,
    sampling: flagger.sampling,
    mode: strategy && isLlmCapableStrategy(strategy) ? "llm" : "deterministic",
    suppressedBy: strategy?.suppressedBy ?? [],
    createdAt: flagger.createdAt.toISOString(),
    updatedAt: flagger.updatedAt.toISOString(),
  }
}

export type FlaggerRecord = ReturnType<typeof toFlaggerRecord>

export const listFlaggersByProject = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }): Promise<readonly FlaggerRecord[]> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const client = getPostgresClient()

    const flaggers = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* FlaggerRepository
        return yield* repo.listByProject({ projectId })
      }).pipe(withPostgres(FlaggerRepositoryLive, client, orgId), withTracing),
    )

    return flaggers.map(toFlaggerRecord)
  })

export const updateFlagger = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      slug: z.string(),
      enabled: z.boolean(),
    }),
  )
  .handler(async ({ data }): Promise<FlaggerRecord | null> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const client = getPostgresClient()

    const flagger = await Effect.runPromise(
      updateFlaggerUseCase({ projectId, slug: data.slug, enabled: data.enabled }).pipe(
        withPostgres(FlaggerRepositoryLive, client, orgId),
        withTracing,
      ),
    )

    await Effect.runPromise(
      evictProjectFlaggersUseCase({ organizationId, projectId }).pipe(
        Effect.provide(RedisCacheStoreLive(getRedisClient())),
        withTracing,
      ),
    )

    return flagger ? toFlaggerRecord(flagger) : null
  })

export const listAnnotationQueuesByProject = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      limit: z.number().optional(),
      cursor: queueListCursorSchema.optional(),
      sortBy: listSortBySchema.optional(),
      sortDirection: z.enum(["asc", "desc"]).optional(),
    }),
  )
  .handler(async ({ data }): Promise<AnnotationQueueListResult> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const client = getPostgresClient()

    const page = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* AnnotationQueueRepository
        return yield* repo.listByProject({
          projectId: ProjectId(data.projectId),
          options: {
            limit: data.limit ?? 50,
            ...(data.cursor ? { cursor: data.cursor } : {}),
            ...(data.sortBy !== undefined ? { sortBy: data.sortBy } : {}),
            ...(data.sortDirection !== undefined ? { sortDirection: data.sortDirection } : {}),
          },
        })
      }).pipe(withPostgres(AnnotationQueueRepositoryLive, client, orgId), withTracing),
    )

    const queues = page.items.map((q) => toAnnotationQueueRecord(q))

    if (!page.nextCursor) {
      return { queues, hasMore: page.hasMore }
    }
    return {
      queues,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    }
  })

export const getAnnotationQueueByProject = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      queueId: z.string(),
    }),
  )
  .handler(async ({ data }): Promise<AnnotationQueueRecord | null> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const client = getPostgresClient()
    const projectId = ProjectId(data.projectId)

    const queue = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* AnnotationQueueRepository
        return yield* repo.findByIdInProject({ projectId, queueId: data.queueId })
      }).pipe(withPostgres(AnnotationQueueRepositoryLive, client, orgId), withTracing),
    )

    if (!queue) {
      return null
    }

    return toAnnotationQueueRecord(queue)
  })

const createQueueInputSchema = queueInputSchema.extend({
  projectId: z.string(),
})

export const createAnnotationQueue = createServerFn({ method: "POST" })
  .inputValidator(createQueueInputSchema)
  .handler(async ({ data }): Promise<AnnotationQueueRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const client = getPostgresClient()

    const result = await Effect.runPromise(
      createQueueUseCase({
        organizationId,
        projectId: ProjectId(data.projectId),
        name: data.name,
        description: data.description,
        instructions: data.instructions,
        assignees: data.assignees ?? [],
        ...(data.settings !== undefined ? { settings: data.settings } : {}),
      }).pipe(withPostgres(AnnotationQueueRepositoryLive, client, orgId), withTracing),
    )

    return toAnnotationQueueRecord(result.queue)
  })

const updateQueueInputSchema = queueInputSchema.extend({
  projectId: z.string(),
  queueId: z.string(),
})

export const updateAnnotationQueue = createServerFn({ method: "POST" })
  .inputValidator(updateQueueInputSchema)
  .handler(async ({ data }): Promise<AnnotationQueueRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const client = getPostgresClient()

    const result = await Effect.runPromise(
      updateQueueUseCase({
        projectId: ProjectId(data.projectId),
        queueId: data.queueId,
        name: data.name,
        description: data.description,
        instructions: data.instructions,
        assignees: data.assignees ?? [],
        ...(data.settings !== undefined ? { settings: data.settings } : {}),
      }).pipe(withPostgres(AnnotationQueueRepositoryLive, client, orgId), withTracing),
    )

    return toAnnotationQueueRecord(result.queue)
  })

const deleteQueueInputSchema = z.object({
  projectId: z.string(),
  queueId: z.string(),
})

export const deleteAnnotationQueue = createServerFn({ method: "POST" })
  .inputValidator(deleteQueueInputSchema)
  .handler(async ({ data }): Promise<void> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const client = getPostgresClient()

    await Effect.runPromise(
      deleteQueueUseCase({
        projectId: ProjectId(data.projectId),
        queueId: data.queueId,
      }).pipe(withPostgres(AnnotationQueueRepositoryLive, client, orgId), withTracing),
    )
  })
