import { type Context, isValidSpanId, trace } from "@opentelemetry/api"
import type { ReadableSpan, Span, SpanProcessor } from "@opentelemetry/sdk-trace-node"
import { SCOPE_LATITUDE } from "../constants/scope.ts"

const MAX_TRACKED_SPANS = 2048
const DROPPED_RETENTION_SLACK = 2048

type DroppedSpanEntry = {
  span: ReadableSpan
  recordedParentId: string | undefined
}

type ExportFilterSpanProcessorOptions = {
  blockedInstrumentationScopes?: readonly string[]
}

function parentSpanIdOf(span: ReadableSpan | Span): string | undefined {
  const fromContext = (span as ReadableSpan).parentSpanContext?.spanId
  if (fromContext && isValidSpanId(fromContext)) return fromContext
  const legacy = (span as { parentSpanId?: string }).parentSpanId
  if (legacy && isValidSpanId(legacy)) return legacy
  return undefined
}

function spanIdOf(span: ReadableSpan | Span): string | undefined {
  const spanContext = span.spanContext?.()
  const spanId = spanContext?.spanId
  if (spanId && isValidSpanId(spanId)) return spanId
  return undefined
}

function evictOldestKey(map: Map<string, unknown>): void {
  const oldest = map.keys().next().value
  if (oldest !== undefined) map.delete(oldest)
}

function touchParentTracking(
  parentId: string,
  parentBySpanId: Map<string, string | undefined>,
  droppedBySpanId: Map<string, DroppedSpanEntry>,
  droppedEligibleAt: Map<string, number>,
  dropGeneration: number,
): void {
  if (parentBySpanId.has(parentId)) {
    const recorded = parentBySpanId.get(parentId)
    parentBySpanId.delete(parentId)
    parentBySpanId.set(parentId, recorded)
  }
  const dropped = droppedBySpanId.get(parentId)
  if (dropped) {
    droppedBySpanId.delete(parentId)
    droppedBySpanId.set(parentId, dropped)
    droppedEligibleAt.set(parentId, dropGeneration + DROPPED_RETENTION_SLACK)
  }
}

/** OpenTelemetry GenAI semantic convention attribute prefix. */
const GEN_AI_PREFIX = "gen_ai."

/** Legacy / OpenInference-style LLM attribute prefix. */
const LLM_PREFIX = "llm."

const OPENINFERENCE_KIND = "openinference.span.kind"

/** OTel Python instrumentation scope prefixes for LLM-related instrumentors we support. */
const OTEL_LLM_INSTRUMENTATION_SCOPE_PREFIXES = [
  "opentelemetry.instrumentation.alephalpha",
  "opentelemetry.instrumentation.anthropic",
  "opentelemetry.instrumentation.bedrock",
  "opentelemetry.instrumentation.cohere",
  "opentelemetry.instrumentation.crewai",
  "opentelemetry.instrumentation.google_generativeai",
  "opentelemetry.instrumentation.groq",
  "opentelemetry.instrumentation.haystack",
  "opentelemetry.instrumentation.langchain",
  "opentelemetry.instrumentation.llamaindex",
  "opentelemetry.instrumentation.mistralai",
  "opentelemetry.instrumentation.ollama",
  "opentelemetry.instrumentation.openai",
  "opentelemetry.instrumentation.replicate",
  "opentelemetry.instrumentation.sagemaker",
  "opentelemetry.instrumentation.together",
  "opentelemetry.instrumentation.transformers",
  "opentelemetry.instrumentation.vertexai",
  "opentelemetry.instrumentation.watsonx",
  "openinference.instrumentation",
] as const

/** Substrings in scope names that indicate LLM / GenAI instrumentation (e.g. Traceloop JS). */
const LLM_SCOPE_SUBSTRINGS = ["openinference", "traceloop", "langsmith", "litellm"] as const

export type SmartFilterOptions = {
  /**
   * When true, all spans are exported (legacy behavior).
   * Default false — only LLM-relevant spans are exported.
   */
  disableSmartFilter?: boolean
  /**
   * When smart filter is on, also export spans for which this returns true
   * (in addition to {@link isDefaultExportSpan}).
   */
  shouldExportSpan?: (span: ReadableSpan) => boolean
  /** Instrumentation scope names to drop (exact match) even if they pass the default predicate. */
  blockedInstrumentationScopes?: string[]
}

/** Input for {@link buildShouldExportSpanFromFields}; allows `undefined` field values for ergonomics. */
export type SmartFilterFieldsInput = {
  disableSmartFilter?: boolean | undefined
  shouldExportSpan?: ((span: ReadableSpan) => boolean) | undefined
  blockedInstrumentationScopes?: string[] | undefined
}

/**
 * Builds the export predicate from loose option fields (`exactOptionalPropertyTypes`-safe call sites).
 */
export function buildShouldExportSpanFromFields(fields: SmartFilterFieldsInput): (span: ReadableSpan) => boolean {
  return buildShouldExportSpan({
    ...(fields.disableSmartFilter !== undefined ? { disableSmartFilter: fields.disableSmartFilter } : {}),
    ...(fields.shouldExportSpan !== undefined ? { shouldExportSpan: fields.shouldExportSpan } : {}),
    ...(fields.blockedInstrumentationScopes !== undefined
      ? { blockedInstrumentationScopes: fields.blockedInstrumentationScopes }
      : {}),
  })
}

function attributeKeys(span: ReadableSpan): string[] {
  const attrs = span.attributes
  if (!attrs || typeof attrs !== "object") return []
  return Object.keys(attrs as Record<string, unknown>)
}

function instrumentationScopeName(span: ReadableSpan): string {
  return span.instrumentationScope?.name ?? ""
}

/** True if the span uses OpenTelemetry GenAI semantic conventions or common LLM attribute namespaces. */
export function isGenAiOrLlmAttributeSpan(span: ReadableSpan): boolean {
  for (const key of attributeKeys(span)) {
    if (key.startsWith(GEN_AI_PREFIX) || key.startsWith(LLM_PREFIX)) return true
    if (key === OPENINFERENCE_KIND || key.startsWith("openinference.")) return true
    // Vercel AI SDK uses ai.* prefix
    if (key.startsWith("ai.")) return true
    // Eve and Flue framework grouping spans carry framework-specific attributes
    if (key.startsWith("eve.") || key.startsWith("flue.")) return true
    // Latitude context attributes
    if (key.startsWith("latitude.")) return true
  }
  return false
}

/** True if the span was created with Latitude's tracer scopes. */
export function isLatitudeInstrumentationSpan(span: ReadableSpan): boolean {
  const name = instrumentationScopeName(span)
  return name === SCOPE_LATITUDE || name.startsWith(`${SCOPE_LATITUDE}.`)
}

function isKnownLlmInstrumentationScope(span: ReadableSpan): boolean {
  const name = instrumentationScopeName(span)
  if (!name) return false
  for (const prefix of OTEL_LLM_INSTRUMENTATION_SCOPE_PREFIXES) {
    if (name === prefix || name.startsWith(`${prefix}.`)) return true
  }
  const lower = name.toLowerCase()
  for (const part of LLM_SCOPE_SUBSTRINGS) {
    if (lower.includes(part)) return true
  }
  return false
}

/**
 * Default export predicate (smart filter): Latitude scopes, GenAI / LLM attributes,
 * or known LLM instrumentation scopes.
 */
export function isDefaultExportSpan(span: ReadableSpan): boolean {
  if (isLatitudeInstrumentationSpan(span)) return true
  if (isGenAiOrLlmAttributeSpan(span)) return true
  if (isKnownLlmInstrumentationScope(span)) return true
  return false
}

export function buildShouldExportSpan(options: SmartFilterOptions): (span: ReadableSpan) => boolean {
  if (options.disableSmartFilter) return () => true
  const blocked = new Set(options.blockedInstrumentationScopes ?? [])
  const extra = options.shouldExportSpan
  return (span: ReadableSpan) => {
    const scope = instrumentationScopeName(span)
    if (blocked.has(scope)) return false
    if (isDefaultExportSpan(span)) return true
    if (extra?.(span)) return true
    return false
  }
}

/**
 * Drops spans that fail the export predicate; when a span is kept, also exports its ancestors
 * so Latitude receives a connected tree.
 */
export class ExportFilterSpanProcessor implements SpanProcessor {
  private readonly shouldExport: (span: ReadableSpan) => boolean
  private readonly inner: SpanProcessor
  private readonly blockedScopes: ReadonlySet<string>
  private readonly parentBySpanId = new Map<string, string | undefined>()
  private readonly forceExportIds = new Set<string>()
  private readonly droppedBySpanId = new Map<string, DroppedSpanEntry>()
  private readonly droppedEligibleAt = new Map<string, number>()
  private dropGeneration = 0

  constructor(
    shouldExport: (span: ReadableSpan) => boolean,
    inner: SpanProcessor,
    options?: ExportFilterSpanProcessorOptions,
  ) {
    this.shouldExport = shouldExport
    this.inner = inner
    this.blockedScopes = new Set(options?.blockedInstrumentationScopes ?? [])
  }

  onStart(span: Span, parentContext: Context): void {
    const spanId = spanIdOf(span)
    if (spanId) {
      let parentId = parentSpanIdOf(span)
      if (!parentId) {
        const fromCtx = trace.getSpanContext(parentContext)?.spanId
        if (fromCtx && isValidSpanId(fromCtx)) parentId = fromCtx
      }
      if (parentId) {
        touchParentTracking(
          parentId,
          this.parentBySpanId,
          this.droppedBySpanId,
          this.droppedEligibleAt,
          this.dropGeneration,
        )
      }
      if (this.parentBySpanId.size >= MAX_TRACKED_SPANS) evictOldestKey(this.parentBySpanId)
      this.parentBySpanId.set(spanId, parentId)
    }
    this.inner.onStart(span, parentContext)
  }

  onEnd(span: ReadableSpan): void {
    const spanId = spanIdOf(span)
    const recordedParentId = spanId ? this.parentBySpanId.get(spanId) : undefined
    const forced = spanId !== undefined && this.forceExportIds.has(spanId)
    if (spanId) {
      this.forceExportIds.delete(spanId)
      this.parentBySpanId.delete(spanId)
    }

    if (this.isBlocked(span)) {
      this.rememberDropped(span, recordedParentId)
      if (forced) this.flushPromotedAncestors(span, recordedParentId)
      return
    }

    if (!forced && !this.shouldExport(span)) {
      this.rememberDropped(span, recordedParentId)
      return
    }

    if (spanId) this.droppedBySpanId.delete(spanId)
    this.flushPromotedAncestors(span, recordedParentId)
    this.inner.onEnd(span)
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush()
  }

  shutdown(): Promise<void> {
    this.parentBySpanId.clear()
    this.forceExportIds.clear()
    this.droppedBySpanId.clear()
    this.droppedEligibleAt.clear()
    return this.inner.shutdown()
  }

  private isBlocked(span: ReadableSpan): boolean {
    return this.blockedScopes.has(instrumentationScopeName(span))
  }

  private rememberDropped(span: ReadableSpan, recordedParentId: string | undefined): void {
    const spanId = spanIdOf(span)
    if (!spanId) return
    this.dropGeneration += 1
    this.droppedEligibleAt.set(spanId, this.dropGeneration + DROPPED_RETENTION_SLACK)
    if (this.droppedBySpanId.size >= MAX_TRACKED_SPANS) {
      for (const key of this.droppedBySpanId.keys()) {
        const eligibleAt = this.droppedEligibleAt.get(key) ?? 0
        if (this.dropGeneration > eligibleAt) {
          this.droppedBySpanId.delete(key)
          this.droppedEligibleAt.delete(key)
          break
        }
      }
    }
    this.droppedBySpanId.set(spanId, { span, recordedParentId })
  }

  private flushPromotedAncestors(span: ReadableSpan, recordedParentId: string | undefined): void {
    for (const ancestor of this.collectPromotedAncestors(span, recordedParentId)) {
      this.inner.onEnd(ancestor)
    }
  }

  private collectPromotedAncestors(span: ReadableSpan, recordedParentId: string | undefined): ReadableSpan[] {
    const toExport: ReadableSpan[] = []
    let parentId = parentSpanIdOf(span) ?? recordedParentId
    const seen = new Set<string>()

    while (parentId && !seen.has(parentId)) {
      seen.add(parentId)

      const dropped = this.droppedBySpanId.get(parentId)
      if (dropped) {
        this.droppedBySpanId.delete(parentId)
        toExport.push(...this.collectPromotedAncestors(dropped.span, dropped.recordedParentId))
        if (!this.isBlocked(dropped.span)) toExport.push(dropped.span)
        parentId = parentSpanIdOf(dropped.span) ?? dropped.recordedParentId
        continue
      }

      if (this.parentBySpanId.has(parentId)) {
        if (this.forceExportIds.size >= MAX_TRACKED_SPANS) {
          const oldest = this.forceExportIds.values().next().value
          if (oldest !== undefined) this.forceExportIds.delete(oldest)
        }
        this.forceExportIds.add(parentId)
        parentId = this.parentBySpanId.get(parentId)
        continue
      }

      break
    }

    return toExport
  }
}

/** Runs optional redaction then the export processor (batch/simple). */
export class RedactThenExportSpanProcessor implements SpanProcessor {
  private readonly redact: SpanProcessor | null
  private readonly exportProcessor: SpanProcessor

  constructor(redact: SpanProcessor | null, exportProcessor: SpanProcessor) {
    this.redact = redact
    this.exportProcessor = exportProcessor
  }

  onStart(span: Span, parentContext: Context): void {
    this.redact?.onStart(span, parentContext)
    this.exportProcessor.onStart(span, parentContext)
  }

  onEnd(span: ReadableSpan): void {
    this.redact?.onEnd(span)
    this.exportProcessor.onEnd(span)
  }

  forceFlush(): Promise<void> {
    return this.exportProcessor.forceFlush()
  }

  shutdown(): Promise<void> {
    return this.exportProcessor.shutdown()
  }
}
