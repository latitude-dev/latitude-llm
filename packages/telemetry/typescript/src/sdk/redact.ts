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

export const DEFAULT_REDACT_SPAN_PROCESSOR = () =>
  new RedactSpanProcessor({
    attributes: [
      /^.*auth.*$/i,
      /^.*authorization.*$/i,
      /^(?!gen_ai\.).*usage.*$/i,
      /^(?!gen_ai\.).*token.*$/i,
      /^.*secret.*$/i,
      /^.*key.*$/i,
      /^.*password.*$/i,
      /^.*cookie.*$/i,
      /^.*session.*$/i,
      /^.*credential.*$/i,
      /^.*signature.*$/i,
      /^.*oauth.*$/i,
      /^.*saml.*$/i,
      /^.*openid.*$/i,
      /^.*refresh.*$/i,
      /^.*jwt.*$/i,
      /^.*otp.*$/i,
      /^.*mfa.*$/i,
      /^.*csrf.*$/i,
      /^.*xsrf.*$/i,
      /^.*refresh.*$/i,
      /^.*x[-_]forwarded[-_]for.*$/i,
      /^.*x[-_]real[-_]ip.*$/i,
    ],
  })
