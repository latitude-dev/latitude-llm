import { OrganizationId, ProjectId, SpanId, TraceId } from "@domain/shared"
import type { Span, SpanDetail, SpanRepository } from "@domain/spans"
import { createClickhouseClient, createSpanClickhouseRepository } from "@platform/db-clickhouse"
import { createServerFn } from "@tanstack/react-start"
import { zodValidator } from "@tanstack/zod-adapter"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
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

let repoInstance: SpanRepository | undefined
const getSpanRepository = () => {
  if (!repoInstance) {
    repoInstance = createSpanClickhouseRepository(createClickhouseClient())
  }
  return repoInstance
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

export const listSpansByProject = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .inputValidator(zodValidator(z.object({ projectId: z.string() })))
  .handler(async ({ data }): Promise<SpanRecord[]> => {
    const { organizationId } = await requireSession()
    const repo = getSpanRepository()
    const spans = await Effect.runPromise(
      repo.findByProjectId(OrganizationId(organizationId), ProjectId(data.projectId), {
        limit: 200,
      }),
    )
    return spans.map(serializeSpan)
  })

export const getSpanDetail = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .inputValidator(zodValidator(z.object({ traceId: z.string(), spanId: z.string() })))
  .handler(async ({ data }): Promise<SpanDetailRecord> => {
    const { organizationId } = await requireSession()
    const repo = getSpanRepository()
    const span = await Effect.runPromise(
      repo.findBySpanId(OrganizationId(organizationId), TraceId(data.traceId), SpanId(data.spanId)),
    )
    if (!span) {
      throw new Error("Span not found")
    }
    return serializeSpanDetail(span)
  })
