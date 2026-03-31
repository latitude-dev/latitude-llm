import { NotFoundError, OrganizationId, ProjectId, SpanId, TraceId } from "@domain/shared"
import type { Operation, Span, SpanDetail, SpanKind, SpanStatusCode } from "@domain/spans"
import { buildConversationSpanMaps, SpanRepository, TraceRepository } from "@domain/spans"
import { SpanRepositoryLive, TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getClickhouseClient } from "../../server/clients.ts"

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
  readonly toolCallId: string
  readonly toolName: string
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
  toolCallId: span.toolCallId,
  toolName: span.toolName,
  toolInput: span.toolInput,
  toolOutput: span.toolOutput,
})

export const listSpansByTrace = createServerFn({ method: "GET" })
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

export const mapConversationToSpans = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), traceId: z.string() }))
  .handler(
    async ({ data }): Promise<{ messageSpanMap: Record<number, string>; toolCallSpanMap: Record<string, string> }> => {
      const { organizationId } = await requireSession()
      const orgId = OrganizationId(organizationId)
      const traceId = TraceId(data.traceId)

      return Effect.runPromise(
        Effect.gen(function* () {
          const traceRepo = yield* TraceRepository
          const spanRepo = yield* SpanRepository

          const [traceDetail, spans] = yield* Effect.all([
            traceRepo.findByTraceId({
              organizationId: orgId,
              projectId: ProjectId(data.projectId),
              traceId,
            }),
            spanRepo.findMessagesForTrace({ organizationId: orgId, traceId }),
          ])

          if (!traceDetail) return { messageSpanMap: {}, toolCallSpanMap: {} }

          return buildConversationSpanMaps(traceDetail.allMessages, spans)
        }).pipe(withClickHouse(Layer.merge(TraceRepositoryLive, SpanRepositoryLive), getClickhouseClient(), orgId)),
      )
    },
  )

export const getSpanDetail = createServerFn({ method: "GET" })
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
