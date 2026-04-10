import { ExternalUserId, OrganizationId, ProjectId, SessionId, SimulationId, SpanId, TraceId } from "@domain/shared"
import type { SpanDetail, SpanKind, SpanStatusCode } from "../entities/span.ts"
import { stringAttr } from "./attributes.ts"
import { parseContent } from "./content/index.ts"
import { resolveAttributes } from "./resolvers/index.ts"
import { resolvePerformance } from "./resolvers/performance.ts"
import { resolveToolExecution } from "./resolvers/tool-execution.ts"
import type { OtlpAnyValue, OtlpExportTraceServiceRequest, OtlpResource, OtlpSpan } from "./types.ts"

const INT_TO_SPAN_KIND: Record<number, SpanKind> = {
  0: "unspecified",
  1: "internal",
  2: "server",
  3: "client",
  4: "producer",
  5: "consumer",
}

const INT_TO_STATUS_CODE: Record<number, SpanStatusCode> = {
  0: "unset",
  1: "ok",
  2: "error",
}

function nanosToDate(nanos: string | undefined): Date {
  if (!nanos || nanos === "0") return new Date()
  const ms = Number(BigInt(nanos) / BigInt(1_000_000))
  return new Date(ms)
}

function resolveAnyValue(
  value: OtlpAnyValue | undefined,
): { type: "string" | "int" | "float" | "bool"; value: string | number | boolean } | null {
  if (!value) return null
  if (value.stringValue !== undefined) return { type: "string", value: value.stringValue }
  if (value.boolValue !== undefined) return { type: "bool", value: value.boolValue }
  if (value.intValue !== undefined) return { type: "int", value: Number(value.intValue) }
  if (value.doubleValue !== undefined) return { type: "float", value: value.doubleValue }
  return null
}

function extractResourceString(resource: OtlpResource | undefined): Record<string, string> {
  if (!resource?.attributes) return {}
  const result: Record<string, string> = {}
  for (const attr of resource.attributes) {
    if (attr.value?.stringValue !== undefined) {
      result[attr.key] = attr.value.stringValue
    }
  }
  return result
}

export interface TransformContext {
  readonly organizationId: string
  readonly projectId: string
  readonly apiKeyId: string
  readonly ingestedAt: Date
}

function transformSpan({
  span,
  resource,
  scopeName,
  scopeVersion,
  context,
  ingestedAt,
}: {
  span: OtlpSpan
  resource: OtlpResource | undefined
  scopeName: string
  scopeVersion: string
  context: TransformContext
  ingestedAt: Date
}): SpanDetail {
  const spanAttrs = span.attributes ?? []
  const spanEvents = span.events ?? []
  const resourceAttrs = resource?.attributes ?? []
  const statusCode = INT_TO_STATUS_CODE[span.status?.code ?? 0] ?? "unset"

  const resolved = resolveAttributes(spanAttrs, statusCode)
  const content = parseContent(spanAttrs)
  const serviceName = stringAttr(resourceAttrs, "service.name") ?? ""
  const performance = resolvePerformance({
    spanAttrs,
    events: spanEvents,
    startTimeUnixNano: span.startTimeUnixNano,
  })
  const toolExecution = resolveToolExecution(spanAttrs, resolved.operation)

  const attrString: Record<string, string> = {}
  const attrInt: Record<string, number> = {}
  const attrFloat: Record<string, number> = {}
  const attrBool: Record<string, boolean> = {}

  for (const attr of spanAttrs) {
    const value = resolveAnyValue(attr.value)
    if (!value) continue
    switch (value.type) {
      case "string":
        attrString[attr.key] = value.value as string
        break
      case "int":
        attrInt[attr.key] = value.value as number
        break
      case "float":
        attrFloat[attr.key] = value.value as number
        break
      case "bool":
        attrBool[attr.key] = value.value as boolean
        break
    }
  }

  return {
    organizationId: OrganizationId(context.organizationId),
    projectId: ProjectId(context.projectId),
    sessionId: SessionId(resolved.sessionId),
    userId: ExternalUserId(resolved.userId),
    traceId: TraceId(span.traceId),
    spanId: SpanId(span.spanId),
    parentSpanId: span.parentSpanId ?? "",
    apiKeyId: context.apiKeyId,
    simulationId: SimulationId(""),
    startTime: nanosToDate(span.startTimeUnixNano),
    endTime: nanosToDate(span.endTimeUnixNano),
    name: span.name,
    serviceName,
    kind: INT_TO_SPAN_KIND[span.kind ?? 0] ?? "unspecified",
    statusCode,
    statusMessage: span.status?.message ?? "",
    traceFlags: span.flags ?? 0,
    traceState: span.traceState ?? "",
    errorType: resolved.errorType,
    tags: resolved.tags,
    metadata: resolved.metadata,
    eventsJson: span.events?.length ? JSON.stringify(span.events) : "",
    linksJson: span.links?.length ? JSON.stringify(span.links) : "",
    operation: resolved.operation,
    provider: resolved.provider,
    model: resolved.model,
    responseModel: resolved.responseModel,
    tokensInput: resolved.tokensInput,
    tokensOutput: resolved.tokensOutput,
    tokensCacheRead: resolved.tokensCacheRead,
    tokensCacheCreate: resolved.tokensCacheCreate,
    tokensReasoning: resolved.tokensReasoning,
    costInputMicrocents: resolved.costInputMicrocents,
    costOutputMicrocents: resolved.costOutputMicrocents,
    costTotalMicrocents: resolved.costTotalMicrocents,
    costIsEstimated: resolved.costIsEstimated,
    timeToFirstTokenNs: performance.timeToFirstTokenNs,
    isStreaming: performance.isStreaming,
    responseId: resolved.responseId,
    finishReasons: resolved.finishReasons,
    attrString,
    attrInt,
    attrFloat,
    attrBool,
    resourceString: extractResourceString(resource),
    scopeName,
    scopeVersion,
    inputMessages: content.inputMessages,
    outputMessages: content.outputMessages,
    systemInstructions: content.systemInstructions,
    toolDefinitions: content.toolDefinitions,
    toolCallId: toolExecution.toolCallId,
    toolName: toolExecution.toolName,
    toolInput: toolExecution.toolInput,
    toolOutput: toolExecution.toolOutput,
    ingestedAt,
  }
}

export function transformOtlpToSpans(request: OtlpExportTraceServiceRequest, context: TransformContext): SpanDetail[] {
  const spans: SpanDetail[] = []
  const { ingestedAt } = context

  for (const resourceSpans of request.resourceSpans ?? []) {
    const resource = resourceSpans.resource
    for (const scopeSpans of resourceSpans.scopeSpans ?? []) {
      const scopeName = scopeSpans.scope?.name ?? ""
      const scopeVersion = scopeSpans.scope?.version ?? ""
      for (const span of scopeSpans.spans ?? []) {
        spans.push(transformSpan({ span, resource, scopeName, scopeVersion, context, ingestedAt }))
      }
    }
  }

  return spans
}
