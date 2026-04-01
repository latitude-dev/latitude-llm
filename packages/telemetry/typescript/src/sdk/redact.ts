import type * as otel from "@opentelemetry/api"
import type { ReadableSpan, Span, SpanProcessor } from "@opentelemetry/sdk-trace-node"

export interface RedactSpanProcessorOptions {
  attributes: (string | RegExp)[]
  mask?: (attribute: string, value: unknown) => string
}

export class RedactSpanProcessor implements SpanProcessor {
  private options: RedactSpanProcessorOptions

  constructor(options: RedactSpanProcessorOptions) {
    this.options = options

    if (!options.mask) {
      this.options.mask = (_attribute: string, _value: unknown) => "******"
    }
  }

  onStart(_span: Span, _context: otel.Context): void {
    // Noop
  }

  onEnd(span: ReadableSpan): void {
    Object.assign(span.attributes, this.redactAttributes(span.attributes))
    for (const event of span.events) {
      if (!event.attributes) continue
      Object.assign(event.attributes, this.redactAttributes(event.attributes))
    }
    for (const link of span.links) {
      if (!link.attributes) continue
      Object.assign(link.attributes, this.redactAttributes(link.attributes))
    }
  }

  forceFlush(): Promise<void> {
    return Promise.resolve()
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }

  private shouldRedact(attribute: string) {
    return this.options.attributes.some((pattern) => {
      if (typeof pattern === "string") {
        return attribute === pattern
      } else if (pattern instanceof RegExp) {
        return pattern.test(attribute)
      }
      return false
    })
  }

  private redactAttributes(attributes: otel.Attributes) {
    const redacted: otel.Attributes = {}

    for (const [key, value] of Object.entries(attributes)) {
      if (this.shouldRedact(key)) {
        redacted[key] = this.options.mask?.(key, value)
      }
    }

    return redacted
  }
}

export const DEFAULT_REDACT_SPAN_PROCESSOR = () =>
  new RedactSpanProcessor({
    attributes: [
      /^http\.request\.header\.authorization$/i,
      /^http\.request\.header\.cookie$/i,
      /^http\.request\.header\.x[-_]api[-_]key$/i,
      /^db\.statement$/i,
    ],
  })
