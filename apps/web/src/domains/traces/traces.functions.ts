import { OrganizationId, ProjectId } from "@domain/shared"
import type { Trace } from "@domain/spans"
import { TraceRepository } from "@domain/spans"
import { TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getClickhouseClient } from "../../server/clients.ts"
import { errorHandler } from "../../server/middlewares.ts"

export interface TraceRecord {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly spanCount: number
  readonly errorCount: number
  readonly startTime: string
  readonly endTime: string
  readonly durationNs: number
  readonly status: string
  readonly tokensInput: number
  readonly tokensOutput: number
  readonly tokensCacheRead: number
  readonly tokensCacheCreate: number
  readonly tokensReasoning: number
  readonly tokensTotal: number
  readonly costInputMicrocents: number
  readonly costOutputMicrocents: number
  readonly costTotalMicrocents: number
  readonly sessionId: string
  readonly userId: string
  readonly tags: readonly string[]
  readonly metadata: Readonly<Record<string, string>>
  readonly models: readonly string[]
  readonly providers: readonly string[]
  readonly serviceNames: readonly string[]
  readonly rootSpanId: string
  readonly rootSpanName: string
}

const serializeTrace = (trace: Trace): TraceRecord => ({
  organizationId: trace.organizationId,
  projectId: trace.projectId,
  traceId: trace.traceId,
  spanCount: trace.spanCount,
  errorCount: trace.errorCount,
  startTime: trace.startTime.toISOString(),
  endTime: trace.endTime.toISOString(),
  durationNs: trace.durationNs,
  status: trace.status,
  tokensInput: trace.tokensInput,
  tokensOutput: trace.tokensOutput,
  tokensCacheRead: trace.tokensCacheRead,
  tokensCacheCreate: trace.tokensCacheCreate,
  tokensReasoning: trace.tokensReasoning,
  tokensTotal: trace.tokensTotal,
  costInputMicrocents: trace.costInputMicrocents,
  costOutputMicrocents: trace.costOutputMicrocents,
  costTotalMicrocents: trace.costTotalMicrocents,
  sessionId: trace.sessionId,
  userId: trace.userId,
  tags: trace.tags,
  metadata: trace.metadata,
  models: trace.models,
  providers: trace.providers,
  serviceNames: trace.serviceNames,
  rootSpanId: trace.rootSpanId,
  rootSpanName: trace.rootSpanName,
})

const traceListCursorSchema = z.object({
  sortValue: z.string(),
  traceId: z.string(),
})

interface TraceListResult {
  readonly traces: readonly TraceRecord[]
  readonly hasMore: boolean
  readonly nextCursor?: { readonly sortValue: string; readonly traceId: string }
}

export const listTracesByProject = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .inputValidator(
    z.object({
      projectId: z.string(),
      limit: z.number().optional(),
      cursor: traceListCursorSchema.optional(),
      sortBy: z.string().optional(),
      sortDirection: z.enum(["asc", "desc"]).optional(),
    }),
  )
  .handler(async ({ data }): Promise<TraceListResult> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const page = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TraceRepository
        return yield* repo.findByProjectId({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          options: {
            limit: data.limit ?? 25,
            ...(data.cursor ? { cursor: data.cursor } : {}),
            ...(data.sortBy ? { sortBy: data.sortBy } : {}),
            ...(data.sortDirection ? { sortDirection: data.sortDirection } : {}),
          },
        })
      }).pipe(withClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId)),
    )

    if (!page.nextCursor) {
      return { traces: page.items.map(serializeTrace), hasMore: page.hasMore }
    }
    return {
      traces: page.items.map(serializeTrace),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    }
  })

export const countTracesByProject = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }): Promise<number> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TraceRepository
        return yield* repo.countByProjectId({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
        })
      }).pipe(withClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId)),
    )
  })
