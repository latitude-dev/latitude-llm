import { NotFoundError, OrganizationId, ProjectId, SpanId, TraceId } from "@domain/shared"
import type { Span, SpanDetail, Trace } from "@domain/spans"
import { SpanRepository, TraceRepository } from "@domain/spans"
import { SpanRepositoryLive, TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getClickhouseClient } from "../../server/clients.ts"
import { errorHandler } from "../../server/middlewares.ts"

export interface SpanRecord {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId: string
  readonly name: string
  readonly serviceName: string
  readonly kind: string
  readonly statusCode: string
  readonly statusMessage: string
  readonly operation: string
  readonly provider: string
  readonly model: string
  readonly tokensInput: number
  readonly tokensOutput: number
  readonly costTotalMicrocents: number
  readonly startTime: string
  readonly endTime: string
  readonly ingestedAt: string
}

export interface SpanDetailRecord extends SpanRecord {
  readonly sessionId: string
  readonly apiKeyId: string
  readonly responseModel: string
  readonly traceFlags: number
  readonly traceState: string
  readonly errorType: string
  readonly tags: readonly string[]
  readonly eventsJson: string
  readonly linksJson: string
  readonly tokensCacheRead: number
  readonly tokensCacheCreate: number
  readonly tokensReasoning: number
  readonly costInputMicrocents: number
  readonly costOutputMicrocents: number
  readonly costTotalMicrocents: number
  readonly costIsEstimated: boolean
  readonly responseId: string
  readonly finishReasons: readonly string[]
  readonly attrString: Readonly<Record<string, string>>
  readonly attrInt: Readonly<Record<string, number>>
  readonly attrFloat: Readonly<Record<string, number>>
  readonly attrBool: Readonly<Record<string, boolean>>
  readonly resourceString: Readonly<Record<string, string>>
  readonly scopeName: string
  readonly scopeVersion: string
  readonly inputMessages: readonly object[]
  readonly outputMessages: readonly object[]
  readonly systemInstructions: string
  readonly toolDefinitions: string
}

const serializeSpan = (span: Span): SpanRecord => ({
  organizationId: span.organizationId,
  projectId: span.projectId,
  traceId: span.traceId,
  spanId: span.spanId,
  parentSpanId: span.parentSpanId,
  name: span.name,
  serviceName: span.serviceName,
  kind: span.kind,
  statusCode: span.statusCode,
  statusMessage: span.statusMessage,
  operation: span.operation,
  provider: span.provider,
  model: span.model,
  tokensInput: span.tokensInput,
  tokensOutput: span.tokensOutput,
  costTotalMicrocents: span.costTotalMicrocents,
  startTime: span.startTime.toISOString(),
  endTime: span.endTime.toISOString(),
  ingestedAt: span.ingestedAt.toISOString(),
})

const serializeSpanDetail = (span: SpanDetail): SpanDetailRecord => ({
  ...serializeSpan(span),
  sessionId: span.sessionId,
  apiKeyId: span.apiKeyId,
  responseModel: span.responseModel,
  traceFlags: span.traceFlags,
  traceState: span.traceState,
  errorType: span.errorType,
  tags: span.tags,
  eventsJson: span.eventsJson,
  linksJson: span.linksJson,
  tokensCacheRead: span.tokensCacheRead,
  tokensCacheCreate: span.tokensCacheCreate,
  tokensReasoning: span.tokensReasoning,
  costInputMicrocents: span.costInputMicrocents,
  costOutputMicrocents: span.costOutputMicrocents,
  costTotalMicrocents: span.costTotalMicrocents,
  costIsEstimated: span.costIsEstimated,
  responseId: span.responseId,
  finishReasons: span.finishReasons,
  attrString: span.attrString,
  attrInt: span.attrInt,
  attrFloat: span.attrFloat,
  attrBool: span.attrBool,
  resourceString: span.resourceString,
  scopeName: span.scopeName,
  scopeVersion: span.scopeVersion,
  inputMessages: span.inputMessages as readonly object[],
  outputMessages: span.outputMessages as readonly object[],
  systemInstructions: span.systemInstructions,
  toolDefinitions: span.toolDefinitions,
})

export const listSpansByTrace = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .inputValidator(z.object({ traceId: z.string() }))
  .handler(async ({ data }): Promise<SpanRecord[]> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const spans = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SpanRepository
        return yield* repo.findByTraceId({ organizationId: orgId, traceId: TraceId(data.traceId) })
      }).pipe(withClickHouse(SpanRepositoryLive, getClickhouseClient(), orgId)),
    )
    return spans.map(serializeSpan)
  })

export const getSpanDetail = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .inputValidator(z.object({ traceId: z.string(), spanId: z.string() }))
  .handler(async ({ data }): Promise<SpanDetailRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const span = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SpanRepository
        return yield* repo.findBySpanId({
          organizationId: orgId,
          traceId: TraceId(data.traceId),
          spanId: SpanId(data.spanId),
        })
      }).pipe(withClickHouse(SpanRepositoryLive, getClickhouseClient(), orgId)),
    )
    if (!span) {
      throw new NotFoundError({ entity: "Span", id: data.spanId })
    }
    return serializeSpanDetail(span)
  })

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
  readonly tags: readonly string[]
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
  tags: trace.tags,
  models: trace.models,
  providers: trace.providers,
  serviceNames: trace.serviceNames,
  rootSpanId: trace.rootSpanId,
  rootSpanName: trace.rootSpanName,
})

export const listTracesByProject = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .inputValidator(z.object({ projectId: z.string(), traceId: z.string().optional() }))
  .handler(async ({ data }): Promise<TraceRecord[]> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const traces = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TraceRepository
        return yield* repo.findByProjectId({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          options: { ...(data.traceId ? { traceId: data.traceId } : {}), limit: 200 },
        })
      }).pipe(withClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId)),
    )

    return traces.map(serializeTrace)
  })
