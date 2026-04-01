import type { Context } from "@opentelemetry/api"
import type { ReadableSpan, Span, SpanProcessor } from "@opentelemetry/sdk-trace-node"
import { SCOPE_LATITUDE } from "../constants/scope.ts"

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
  return span.instrumentationLibrary?.name ?? ""
}

/** True if the span uses OpenTelemetry GenAI semantic conventions or common LLM attribute namespaces. */
export function isGenAiOrLlmAttributeSpan(span: ReadableSpan): boolean {
  for (const key of attributeKeys(span)) {
    if (key.startsWith(GEN_AI_PREFIX) || key.startsWith(LLM_PREFIX)) return true
    if (key === OPENINFERENCE_KIND || key.startsWith("openinference.")) return true
    // Vercel AI SDK uses ai.* prefix
    if (key.startsWith("ai.")) return true
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
 * Drops spans that fail the export predicate before passing them to the inner processor.
 * Inner processor should perform redaction and export.
 */
export class ExportFilterSpanProcessor implements SpanProcessor {
  private readonly shouldExport: (span: ReadableSpan) => boolean
  private readonly inner: SpanProcessor

  constructor(shouldExport: (span: ReadableSpan) => boolean, inner: SpanProcessor) {
    this.shouldExport = shouldExport
    this.inner = inner
  }

  onStart(span: Span, parentContext: Context): void {
    this.inner.onStart(span, parentContext)
  }

  onEnd(span: ReadableSpan): void {
    if (!this.shouldExport(span)) return
    this.inner.onEnd(span)
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush()
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown()
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
