import { ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
import type { Operation, Span, SpanDetail, SpanKind, SpanMessagesData, SpanStatusCode } from "@domain/spans"
import { SpanRepository } from "@domain/spans"
import { SpanRepositoryLive } from "@platform/db-clickhouse"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { getClickhouseClient } from "../../server/clients.ts"
import { resolveOrgScope } from "../../server/resolve-org-scope.ts"
import { withScopedClickHouse } from "../../server/scoped-clickhouse.ts"

const dateTimeParamSchema = z
  .string()
  .datetime()
  .transform((value) => new Date(value))

export interface SpanRecord {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId: string
  readonly simulationId: string
  readonly name: string
  readonly serviceName: string
  readonly kind: SpanKind
  readonly statusCode: SpanStatusCode
  readonly statusMessage: string
  readonly operation: Operation
  readonly provider: string
  readonly model: string
  readonly toolName: string
  readonly toolNames: readonly string[]
  readonly toolCallId: string
  readonly tokensInput: number
  readonly tokensOutput: number
  readonly costTotalMicrocents: number
  readonly timeToFirstTokenNs: number
  readonly isStreaming: boolean
  readonly startTime: string
  readonly endTime: string
  readonly ingestedAt: string
}

export interface SpanDetailRecord extends SpanRecord {
  readonly sessionId: string
  readonly userId: string
  readonly apiKeyId: string
  readonly responseModel: string
  readonly traceFlags: number
  readonly traceState: string
  readonly errorType: string
  readonly tags: readonly string[]
  readonly metadata: Readonly<Record<string, string>>
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
  readonly systemInstructions: readonly object[]
  readonly toolDefinitions: readonly object[]
  readonly toolInput: string
  readonly toolOutput: string
}

const serializeSpan = (span: Span): SpanRecord => ({
  organizationId: span.organizationId,
  projectId: span.projectId,
  traceId: span.traceId,
  spanId: span.spanId,
  parentSpanId: span.parentSpanId,
  simulationId: span.simulationId,
  name: span.name,
  serviceName: span.serviceName,
  kind: span.kind,
  statusCode: span.statusCode,
  statusMessage: span.statusMessage,
  operation: span.operation,
  provider: span.provider,
  model: span.model,
  toolName: span.toolName,
  toolNames: span.toolNames,
  toolCallId: span.toolCallId,
  tokensInput: span.tokensInput,
  tokensOutput: span.tokensOutput,
  costTotalMicrocents: span.costTotalMicrocents,
  timeToFirstTokenNs: span.timeToFirstTokenNs,
  isStreaming: span.isStreaming,
  startTime: span.startTime.toISOString(),
  endTime: span.endTime.toISOString(),
  ingestedAt: span.ingestedAt.toISOString(),
})

const serializeSpanDetail = (span: SpanDetail): SpanDetailRecord => ({
  ...serializeSpan(span),
  sessionId: span.sessionId,
  userId: span.userId,
  apiKeyId: span.apiKeyId,
  responseModel: span.responseModel,
  traceFlags: span.traceFlags,
  traceState: span.traceState,
  errorType: span.errorType,
  tags: span.tags,
  metadata: span.metadata,
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
  systemInstructions: span.systemInstructions as readonly object[],
  toolDefinitions: span.toolDefinitions as readonly object[],
  toolInput: span.toolInput,
  toolOutput: span.toolOutput,
})

export const listSpansByTrace = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      traceId: z.string(),
      startTimeFrom: dateTimeParamSchema.optional(),
      startTimeTo: dateTimeParamSchema.optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<SpanRecord[]> => {
    const orgId = await resolveOrgScope(context)
    const spans = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SpanRepository
        return yield* repo.listByTraceId({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          traceId: TraceId(data.traceId),
          ...(data.startTimeFrom ? { startTimeFrom: data.startTimeFrom } : {}),
          ...(data.startTimeTo ? { startTimeTo: data.startTimeTo } : {}),
        })
      }).pipe(withScopedClickHouse(SpanRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
    return spans.map(serializeSpan)
  })

// Reads by the session's authoritative `traceIds` rather than `session_id`
// membership, so subagent spans that override `session_id` to the child's own
// value still surface in the session's Spans tab and breakdowns.
export const listSpansBySession = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      traceIds: z.array(z.string().length(32)).max(500),
      startTimeFrom: dateTimeParamSchema.optional(),
      startTimeTo: dateTimeParamSchema.optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<SpanRecord[]> => {
    if (data.traceIds.length === 0) return []
    const orgId = await resolveOrgScope(context)
    const spans = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SpanRepository
        return yield* repo.listByTraceIds({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          traceIds: data.traceIds.map(TraceId),
          ...(data.startTimeFrom ? { startTimeFrom: data.startTimeFrom } : {}),
          ...(data.startTimeTo ? { startTimeTo: data.startTimeTo } : {}),
        })
      }).pipe(withScopedClickHouse(SpanRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
    return spans.map(serializeSpan)
  })

export interface SpanMessagesRecord {
  readonly traceId: string
  readonly spanId: string
  readonly operation: Operation
  readonly toolCallId: string
  readonly toolName: string
  readonly toolInput: string
  readonly inputMessages: readonly object[]
  readonly outputMessages: readonly object[]
}

const serializeSpanMessages = (span: SpanMessagesData): SpanMessagesRecord => ({
  traceId: span.traceId as string,
  spanId: span.spanId as string,
  operation: span.operation,
  toolCallId: span.toolCallId,
  toolName: span.toolName,
  toolInput: span.toolInput,
  inputMessages: span.inputMessages,
  outputMessages: span.outputMessages,
})

// Returns the message-bearing spans for a trace. The caller pairs these with the
// conversation it already holds (traceDetail.allMessages) via buildConversationSpanMaps,
// so no redundant trace fetch happens here. `startTime` bounds the span scan on the
// time-keyed spans table.
export const listConversationMessageSpans = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      traceId: z.string(),
      startTime: dateTimeParamSchema,
    }),
  )
  .handler(async ({ data, context }): Promise<SpanMessagesRecord[]> => {
    const orgId = await resolveOrgScope(context)
    const spans = await Effect.runPromise(
      Effect.gen(function* () {
        const spanRepo = yield* SpanRepository
        return yield* spanRepo.findMessagesForTrace({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          traceId: TraceId(data.traceId),
          startTimeFrom: new Date(data.startTime.getTime() - 60 * 1000),
          startTimeTo: new Date(data.startTime.getTime() + 24 * 60 * 60 * 1000),
        })
      }).pipe(withScopedClickHouse(SpanRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
    return spans.map(serializeSpanMessages)
  })

export const listSessionConversationMessageSpans = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      sessionId: z.string(),
      sessionStartTime: dateTimeParamSchema,
      sessionEndTime: dateTimeParamSchema,
    }),
  )
  .handler(async ({ data, context }): Promise<SpanMessagesRecord[]> => {
    const orgId = await resolveOrgScope(context)
    const spans = await Effect.runPromise(
      Effect.gen(function* () {
        const spanRepo = yield* SpanRepository
        return yield* spanRepo.findMessagesForSession({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          sessionId: SessionId(data.sessionId),
          startTimeFrom: new Date(data.sessionStartTime.getTime() - 60 * 1000),
          startTimeTo: new Date(data.sessionEndTime.getTime() + 24 * 60 * 60 * 1000),
        })
      }).pipe(withScopedClickHouse(SpanRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
    return spans.map(serializeSpanMessages)
  })

export const getSpanDetail = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      traceId: z.string(),
      spanId: z.string(),
      startTimeFrom: dateTimeParamSchema.optional(),
      startTimeTo: dateTimeParamSchema.optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<SpanDetailRecord> => {
    const orgId = await resolveOrgScope(context)
    const span = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SpanRepository
        return yield* repo.findBySpanId({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          traceId: TraceId(data.traceId),
          spanId: SpanId(data.spanId),
          ...(data.startTimeFrom ? { startTimeFrom: data.startTimeFrom } : {}),
          ...(data.startTimeTo ? { startTimeTo: data.startTimeTo } : {}),
        })
      }).pipe(withScopedClickHouse(SpanRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
    return serializeSpanDetail(span)
  })
