import * as otel from '@opentelemetry/api'
import { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-node'

export interface RedactSpanProcessorOptions {
  attributes: (string | RegExp)[]
  mask?: (attribute: string, value: any) => string
}

export class RedactSpanProcessor implements SpanProcessor {
  private options: RedactSpanProcessorOptions

  constructor(options: RedactSpanProcessorOptions) {
    this.options = options

    if (!options.mask) {
      this.options.mask = (_attribute: string, _value: any) => '******'
    }
  }

  onStart(_span: ReadableSpan, _context: otel.Context): void {
    // Noop
  }

  onEnd(span: ReadableSpan): void {
    Object.assign(span.attributes, this.redactAttributes(span.attributes))
  }

  forceFlush(): Promise<void> {
    return Promise.resolve()
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }

  private shouldRedact(attribute: string) {
    return this.options.attributes.some((pattern) => {
      if (typeof pattern === 'string') {
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
        redacted[key] = this.options.mask!(key, value)
      }
    }

    return redacted
  }
}
