import type * as otel from "@opentelemetry/api"
import type { ReadableSpan, Span, SpanProcessor, TimedEvent } from "@opentelemetry/sdk-trace-node"
import { ATTRIBUTES } from "../constants/index.ts"

export interface RedactSpanProcessorOptions {
  attributes: (string | RegExp)[]
  mask?: (attribute: string, value: unknown) => string
}

/** Replacement attributes, events and links for an export-time view of a span (unset = unchanged). */
export type SpanOverrides = {
  attributes?: otel.Attributes
  events?: TimedEvent[]
  links?: otel.Link[]
}

// Used when a custom `mask` throws or returns something that isn't an attribute value, and when a
// pattern fails: fail closed (mask) rather than leak the raw value or drop the span.
const FALLBACK_MASK = "******"

/** The patterns Latitude redacts when no custom `redact` is given. A custom `redact` replaces them. */
export const DEFAULT_REDACT_PATTERNS: readonly RegExp[] = Object.freeze([
  // HTTP security headers
  /^http\.request\.header\.authorization$/i,
  /^http\.request\.header\.cookie$/i,
  /^http\.request\.header\.x[-_]api[-_]key$/i,
  // Database statements may contain sensitive data
  /^db\.statement$/i,
])

/**
 * Which operation a span is and which provider/model served it, in every convention Latitude's ingest
 * resolves them from. Latitude needs them to count the span in cost and usage rollups, attribute it
 * to a model and price it, so regex patterns never mask them. They name an operation, provider or
 * model, never user content. Listing one as an exact string pattern still redacts it.
 */
export const REDACTION_EXEMPT_ATTRIBUTES: ReadonlySet<string> = new Set([
  // Operation
  ATTRIBUTES.operationName,
  ATTRIBUTES.openinferenceSpanKind,
  ATTRIBUTES.llmRequestType,
  ATTRIBUTES.aiOperationId,
  ATTRIBUTES.latitudeSpanKind,
  ATTRIBUTES.spanType,
  // Provider
  ATTRIBUTES.providerName,
  ATTRIBUTES.system,
  ATTRIBUTES.modelProvider,
  ATTRIBUTES.llmSystem,
  ATTRIBUTES.llmProvider,
  ATTRIBUTES.aiModelProvider,
  // Model
  ATTRIBUTES.requestModel,
  ATTRIBUTES.responseModel,
  ATTRIBUTES.llmModelName,
  ATTRIBUTES.embeddingModelName,
  ATTRIBUTES.rerankerModelName,
  ATTRIBUTES.aiModelId,
  ATTRIBUTES.aiResponseModel,
])

const defaultMask = (_attribute: string, _value: unknown) => FALLBACK_MASK

/**
 * Redacts sensitive span, event and link attributes.
 *
 * `LatitudeSpanProcessor` and `RedactThenExportSpanProcessor` never modify the span: they export a
 * view built from `redactSpan()`, so other processors on the provider keep seeing raw values.
 * Registered directly on a provider, `onEnd` masks the span in place, which is the only way a bare
 * processor can affect what later processors export.
 *
 * Redaction never throws: a failing pattern or `mask` masks that value with `******`. Regex patterns
 * never match `REDACTION_EXEMPT_ATTRIBUTES`; an exact string pattern does.
 */
export class RedactSpanProcessor implements SpanProcessor {
  private readonly patterns: readonly (string | RegExp)[]
  private readonly mask: (attribute: string, value: unknown) => string

  constructor(options: RedactSpanProcessorOptions) {
    this.patterns = [...options.attributes]
    this.mask = options.mask ?? defaultMask
  }

  onStart(_span: Span, _context: otel.Context): void {
    // Noop
  }

  onEnd(span: ReadableSpan): void {
    try {
      const { attributes, events, links } = this.redactSpan(span)
      if (attributes) Object.assign(span.attributes, attributes)
      // `failClosed` drops events and strips link attributes, which the view Proxy applies wholesale.
      // In place, mask every event/link attribute instead so this path fails closed too.
      if (events) {
        for (const [i, original] of span.events.entries()) mergeInPlace(original.attributes, events[i]?.attributes)
      }
      if (links) {
        for (const [i, original] of span.links.entries()) mergeInPlace(original.attributes, links[i]?.attributes)
      }
    } catch (error) {
      console.warn("[Latitude] Failed to redact span in place", error)
    }
  }

  forceFlush(): Promise<void> {
    return Promise.resolve()
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }

  /**
   * Redacted copies of the span's attributes, events and links (only the parts that changed). Never
   * throws: if the span can't be read, every attribute value is masked and events are dropped.
   */
  redactSpan(span: ReadableSpan): SpanOverrides {
    try {
      const overrides: SpanOverrides = {}
      const attributes = this.redactAttributes(span.attributes)
      if (attributes) overrides.attributes = attributes
      const events = this.redactList(span.events ?? [])
      if (events) overrides.events = events
      const links = this.redactList(span.links ?? [])
      if (links) overrides.links = links
      return overrides
    } catch (error) {
      console.warn("[Latitude] Failed to redact span; masking all attributes", error)
      return failClosed(span)
    }
  }

  private redactList<T extends { attributes?: otel.Attributes | undefined }>(items: readonly T[]): T[] | undefined {
    let changed = false
    const out = items.map((item) => {
      const attributes = this.redactAttributes(item.attributes)
      if (!attributes) return item
      changed = true
      return { ...item, attributes }
    })
    return changed ? out : undefined
  }

  private redactAttributes(attributes: otel.Attributes | undefined): otel.Attributes | undefined {
    if (!attributes) return undefined
    let redacted: otel.Attributes | undefined
    for (const [key, value] of Object.entries(attributes)) {
      if (!this.shouldRedact(key)) continue
      redacted ??= { ...attributes }
      redacted[key] = this.masked(key, value)
    }
    return redacted
  }

  private masked(key: string, value: unknown): otel.AttributeValue {
    try {
      const masked: unknown = this.mask(key, value)
      if (typeof masked === "string" || typeof masked === "number" || typeof masked === "boolean") return masked
      console.warn(`[Latitude] Redaction mask returned a non-attribute value for "${key}"; using the fallback`)
    } catch (error) {
      console.warn(`[Latitude] Redaction mask threw for "${key}"; using the fallback`, error)
    }
    return FALLBACK_MASK
  }

  private shouldRedact(attribute: string): boolean {
    for (const pattern of this.patterns) {
      try {
        if (typeof pattern === "string") {
          if (attribute === pattern) return true
        } else if (pattern instanceof RegExp) {
          // `search` ignores `lastIndex`, so a /g or /y pattern can't skip every other match.
          if (!REDACTION_EXEMPT_ATTRIBUTES.has(attribute) && attribute.search(pattern) !== -1) return true
        }
      } catch {
        // Fail closed: a broken pattern redacts rather than leaks.
        return true
      }
    }
    return false
  }
}

/** Applies a redacted copy onto `target`; with no copy (fail-closed), masks every value. */
function mergeInPlace(target: otel.Attributes | undefined, redacted: otel.Attributes | undefined): void {
  if (!target) return
  if (redacted) {
    Object.assign(target, redacted)
    return
  }
  for (const key of Object.keys(target)) target[key] = FALLBACK_MASK
}

function failClosed(span: ReadableSpan): SpanOverrides {
  const attributes: otel.Attributes = {}
  try {
    for (const key of Object.keys(span.attributes ?? {})) attributes[key] = FALLBACK_MASK
  } catch {
    // Can't even read the keys: export no attributes.
  }
  let links: otel.Link[] = []
  try {
    links = (span.links ?? []).map((link) => ({ context: link.context }))
  } catch {
    // Drop links.
  }
  return { attributes, events: [], links }
}

/** A view of `span` with `overrides` applied; the span itself is never modified. */
export function withSpanOverrides(span: ReadableSpan, overrides: SpanOverrides): ReadableSpan {
  const { attributes, events, links } = overrides
  if (!attributes && !events && !links) return span
  return new Proxy(span, {
    get(target, prop, receiver) {
      if (prop === "attributes" && attributes) return attributes
      if (prop === "events" && events) return events
      if (prop === "links" && links) return links
      return Reflect.get(target, prop, receiver)
    },
  })
}

export const DEFAULT_REDACT_SPAN_PROCESSOR = () => new RedactSpanProcessor({ attributes: [...DEFAULT_REDACT_PATTERNS] })
