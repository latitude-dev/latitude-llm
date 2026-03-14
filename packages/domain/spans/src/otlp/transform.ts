import { OrganizationId, ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
import type { SpanDetail, SpanKind, SpanStatusCode } from "../entities/span.ts"
import type { OtlpAnyValue, OtlpExportTraceServiceRequest, OtlpKeyValue, OtlpResource, OtlpSpan } from "./types.ts"

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

const EXTRACTED_ATTRIBUTES = new Set([
  "gen_ai.operation.name",
  "gen_ai.system",
  "gen_ai.request.model",
  "gen_ai.response.model",
  "gen_ai.usage.input_tokens",
  "gen_ai.usage.output_tokens",
  "gen_ai.usage.cache_read_input_tokens",
  "gen_ai.usage.reasoning_tokens",
  "gen_ai.response.id",
  "gen_ai.response.finish_reasons",
  "gen_ai.conversation.id",
  "error.type",
])

function nanosToDate(nanos: string | undefined): Date {
  if (!nanos || nanos === "0") return new Date()
  const ms = Number(BigInt(nanos) / BigInt(1_000_000))
  return new Date(ms)
}

function extractStringAttr(attrs: readonly OtlpKeyValue[], key: string): string {
  const kv = attrs.find((a) => a.key === key)
  return kv?.value?.stringValue ?? ""
}

function extractIntAttr(attrs: readonly OtlpKeyValue[], key: string): number {
  const kv = attrs.find((a) => a.key === key)
  if (kv?.value?.intValue !== undefined) return Number(kv.value.intValue)
  if (kv?.value?.doubleValue !== undefined) return Math.round(kv.value.doubleValue)
  return 0
}

function extractStringArrayAttr(attrs: readonly OtlpKeyValue[], key: string): string[] {
  const kv = attrs.find((a) => a.key === key)
  if (!kv?.value?.arrayValue?.values) return []
  return kv.value.arrayValue.values.filter((v) => v.stringValue !== undefined).map((v) => v.stringValue as string)
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
  const resourceAttrs = resource?.attributes ?? []

  const statusCode = INT_TO_STATUS_CODE[span.status?.code ?? 0] ?? "unset"

  const operation = extractStringAttr(spanAttrs, "gen_ai.operation.name")
  const provider = extractStringAttr(spanAttrs, "gen_ai.system")
  const model = extractStringAttr(spanAttrs, "gen_ai.request.model")
  const responseModel = extractStringAttr(spanAttrs, "gen_ai.response.model")
  const tokensInput = extractIntAttr(spanAttrs, "gen_ai.usage.input_tokens")
  const tokensOutput = extractIntAttr(spanAttrs, "gen_ai.usage.output_tokens")
  const tokensCacheRead = extractIntAttr(spanAttrs, "gen_ai.usage.cache_read_input_tokens")
  const tokensReasoning = extractIntAttr(spanAttrs, "gen_ai.usage.reasoning_tokens")
  const responseId = extractStringAttr(spanAttrs, "gen_ai.response.id")
  const finishReasons = extractStringArrayAttr(spanAttrs, "gen_ai.response.finish_reasons")
  const sessionId = extractStringAttr(spanAttrs, "gen_ai.conversation.id")
  const errorType = statusCode === "error" ? extractStringAttr(spanAttrs, "error.type") : ""

  const serviceName = extractStringAttr(resourceAttrs, "service.name")

  const attrString: Record<string, string> = {}
  const attrInt: Record<string, number> = {}
  const attrFloat: Record<string, number> = {}
  const attrBool: Record<string, boolean> = {}

  for (const attr of spanAttrs) {
    if (EXTRACTED_ATTRIBUTES.has(attr.key)) continue
    const resolved = resolveAnyValue(attr.value)
    if (!resolved) continue
    switch (resolved.type) {
      case "string":
        attrString[attr.key] = resolved.value as string
        break
      case "int":
        attrInt[attr.key] = resolved.value as number
        break
      case "float":
        attrFloat[attr.key] = resolved.value as number
        break
      case "bool":
        attrBool[attr.key] = resolved.value as boolean
        break
    }
  }

  return {
    organizationId: OrganizationId(context.organizationId),
    projectId: ProjectId(context.projectId),
    sessionId: SessionId(sessionId),
    traceId: TraceId(span.traceId),
    spanId: SpanId(span.spanId),
    parentSpanId: span.parentSpanId ?? "",
    apiKeyId: context.apiKeyId,
    startTime: nanosToDate(span.startTimeUnixNano),
    endTime: nanosToDate(span.endTimeUnixNano),
    name: span.name,
    serviceName,
    kind: INT_TO_SPAN_KIND[span.kind ?? 0] ?? "unspecified",
    statusCode,
    statusMessage: span.status?.message ?? "",
    traceFlags: span.flags ?? 0,
    traceState: span.traceState ?? "",
    errorType,
    tags: [],
    eventsJson: span.events?.length ? JSON.stringify(span.events) : "",
    linksJson: span.links?.length ? JSON.stringify(span.links) : "",
    operation,
    provider,
    model,
    responseModel,
    tokensInput,
    tokensOutput,
    tokensCacheRead,
    tokensCacheCreate: 0,
    tokensReasoning,
    costInputMicrocents: 0,
    costOutputMicrocents: 0,
    costTotalMicrocents: 0,
    costIsEstimated: false,
    responseId,
    finishReasons,
    attrString,
    attrInt,
    attrFloat,
    attrBool,
    resourceString: extractResourceString(resource),
    scopeName,
    scopeVersion,
    inputMessages: [],
    outputMessages: [],
    systemInstructions: "",
    toolDefinitions: "",
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
