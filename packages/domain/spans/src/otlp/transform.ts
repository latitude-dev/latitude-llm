import {
  ExternalUserId,
  OrganizationId,
  ProjectId,
  SessionId,
  SimulationId,
  SPAN_ID_LENGTH,
  SpanId,
  TRACE_ID_LENGTH,
  TraceId,
} from "@domain/shared"
import type { SpanDetail, SpanKind, SpanStatusCode } from "../entities/span.ts"
import { anyValueToPlain } from "./any-value.ts"
import { attrArray, stringAttr } from "./attributes.ts"
import { parseContent } from "./content/index.ts"
import { isDroppedSpan } from "./dropped-spans.ts"
import { resolveAttributes } from "./resolvers/index.ts"
import { resolvePerformance } from "./resolvers/performance.ts"
import { resolveStatusCode } from "./resolvers/status.ts"
import { resolveToolExecution } from "./resolvers/tool-execution.ts"
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
  // Structured OTLP values (e.g. gen_ai.memory.records) are flattened to a JSON string so they survive in attr_string.
  if (value.arrayValue !== undefined || value.kvlistValue !== undefined) {
    return { type: "string", value: JSON.stringify(anyValueToPlain(value)) }
  }
  return null
}

function extractResourceString(resource: OtlpResource | undefined): Record<string, string> {
  const result: Record<string, string> = {}
  for (const attr of attrArray(resource?.attributes)) {
    if (attr.value?.stringValue !== undefined) {
      result[attr.key] = attr.value.stringValue
    }
  }
  return result
}

/**
 * Per-span project scoping. Each span resolves a `projectId` independently:
 *
 *   1. span attribute `latitude.project`            (set by `.capture({ projectSlug })`)
 *   2. OTEL resource attribute `latitude.project`   (bare-OTEL pattern)
 *   3. `defaultProjectId` from `X-Latitude-Project` header                       *
 *
 * Slugs resolve to project IDs via `projectIdBySlug`. A span is rejected if its slug
 * doesn't resolve and `defaultProjectId` is also absent (or if the slug isn't in the map).
 */
export interface TransformContext {
  readonly organizationId: string
  readonly apiKeyId: string
  readonly ingestedAt: Date
  /**
   * `projectId` to use when neither a span nor resource `latitude.project` attribute is present.
   * Resolved from the `X-Latitude-Project` header by the ingest middleware; `null` when no
   * header was sent (in which case unscoped spans are rejected).
   */
  readonly defaultProjectId: string | null
  /**
   * Slug → projectId map pre-resolved by the request handler (one DB lookup per unique slug).
   * Unknown / wrong-org slugs are absent from this map.
   */
  readonly projectIdBySlug: ReadonlyMap<string, string>
}

/** Spans carrying token usage that no models.dev pricing matched, grouped for reporting. */
export interface UnpricedSpanGroup {
  readonly projectId: string
  readonly provider: string
  readonly model: string
  readonly spans: number
}

interface TransformResult {
  readonly spans: readonly SpanDetail[]
  /** Spans skipped for lacking a resolvable `projectId` or a valid `traceId`. */
  readonly rejectedSpans: number
  readonly unpricedSpanGroups: readonly UnpricedSpanGroup[]
}

/** Reads `latitude.project` from span attrs first, falling back to resource attrs. */
export function resolveSpanProjectSlug(
  spanAttrs: readonly OtlpKeyValue[],
  resourceAttrs: readonly OtlpKeyValue[],
): string | undefined {
  return stringAttr(spanAttrs, "latitude.project") ?? stringAttr(resourceAttrs, "latitude.project")
}

function resolveSpanProjectId(
  spanAttrs: readonly OtlpKeyValue[],
  resourceAttrs: readonly OtlpKeyValue[],
  context: TransformContext,
): string | null {
  const slug = resolveSpanProjectSlug(spanAttrs, resourceAttrs)
  if (slug) {
    return context.projectIdBySlug.get(slug) ?? null
  }
  return context.defaultProjectId
}

/**
 * ClickHouse's `spans` table stores `trace_id`/`span_id` as `FixedString(32)`/`FixedString(16)` — a
 * value longer than that fails the whole async-insert batch, not just the offending row, so an
 * oversized ID (a non-conformant exporter, e.g. a wider `bytes` protobuf field) must be rejected here.
 */
function hasValidIdLengths(normalizedTraceId: string, spanId: string): boolean {
  return normalizedTraceId.length <= TRACE_ID_LENGTH && spanId.length <= SPAN_ID_LENGTH
}

function hasParentSpan(parentSpanId: string | undefined): boolean {
  return !!parentSpanId && !/^0+$/.test(parentSpanId)
}

interface TransformedSpan {
  readonly span: SpanDetail
  readonly costPricingMissing: boolean
}

function transformSpan({
  span,
  traceId,
  resource,
  scopeName,
  scopeVersion,
  context,
  projectId,
  ingestedAt,
}: {
  span: OtlpSpan
  traceId: string
  resource: OtlpResource | undefined
  scopeName: string
  scopeVersion: string
  context: TransformContext
  projectId: string
  ingestedAt: Date
}): TransformedSpan {
  const spanAttrs = attrArray(span.attributes)
  const spanEvents = span.events ?? []
  const resourceAttrs = attrArray(resource?.attributes)
  const otelStatusCode = INT_TO_STATUS_CODE[span.status?.code ?? 0] ?? "unset"
  const statusCode = resolveStatusCode(spanAttrs, otelStatusCode, scopeName)

  const resolved = resolveAttributes({
    spanAttrs,
    statusCode,
    spanName: span.name ?? "",
    scopeName,
    hasParent: hasParentSpan(span.parentSpanId),
  })
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

  const detail: SpanDetail = {
    organizationId: OrganizationId(context.organizationId),
    projectId: ProjectId(projectId),
    sessionId: SessionId(resolved.sessionId),
    userId: ExternalUserId(resolved.userId),
    userEmail: resolved.userEmail,
    traceId: TraceId(traceId),
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
    agentName: resolved.agentName,
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
    toolNames: content.toolDefinitions.map((definition) => definition.name),
    toolCallId: toolExecution.toolCallId,
    toolName: toolExecution.toolName,
    toolInput: toolExecution.toolInput,
    toolOutput: toolExecution.toolOutput,
    ingestedAt,
  }

  return { span: detail, costPricingMissing: resolved.costPricingMissing }
}

export function transformOtlpToSpans(
  request: OtlpExportTraceServiceRequest,
  context: TransformContext,
): TransformResult {
  const spans: SpanDetail[] = []
  let rejectedSpans = 0
  const unpricedByKey = new Map<string, { projectId: string; provider: string; model: string; spans: number }>()
  const { ingestedAt } = context

  for (const resourceSpans of request.resourceSpans ?? []) {
    const resource = resourceSpans.resource
    const resourceAttrs = resource?.attributes ?? []
    for (const scopeSpans of resourceSpans.scopeSpans ?? []) {
      const scopeName = scopeSpans.scope?.name ?? ""
      const scopeVersion = scopeSpans.scope?.version ?? ""
      for (const span of scopeSpans.spans ?? []) {
        if (isDroppedSpan(scopeName, span.name ?? "")) continue
        // OTLP/JSON bodies are cast, not validated, so `traceId` can arrive missing or non-string.
        if (typeof span.traceId !== "string" || span.traceId.length === 0) {
          rejectedSpans++
          continue
        }
        const projectId = resolveSpanProjectId(span.attributes ?? [], resourceAttrs, context)
        if (!projectId) {
          rejectedSpans++
          continue
        }
        const traceId = span.traceId.replace(/-/g, "")
        if (!hasValidIdLengths(traceId, span.spanId)) {
          rejectedSpans++
          continue
        }
        const transformed = transformSpan({
          span,
          traceId,
          resource,
          scopeName,
          scopeVersion,
          context,
          projectId,
          ingestedAt,
        })
        spans.push(transformed.span)

        if (transformed.costPricingMissing) {
          const { provider, model } = transformed.span
          const key = `${projectId} ${provider} ${model}`
          const existing = unpricedByKey.get(key)
          if (existing) existing.spans++
          else unpricedByKey.set(key, { projectId, provider, model, spans: 1 })
        }
      }
    }
  }

  return { spans, rejectedSpans, unpricedSpanGroups: [...unpricedByKey.values()] }
}
