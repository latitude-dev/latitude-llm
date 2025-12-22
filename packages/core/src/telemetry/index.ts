import {
  DEFAULT_REDACT_SPAN_PROCESSOR,
  LatitudeTelemetry,
  BACKGROUND as ROOT,
} from '@latitude-data/telemetry'
import { propagation, SpanAttributes } from '@opentelemetry/api'
import {
  ExportResult,
  ExportResultCode,
  hrTimeToNanoseconds,
} from '@opentelemetry/core'
import { Resource } from '@opentelemetry/resources'
import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-node'
import { captureException } from '../utils/datadogCapture'
import { z } from 'zod'
import { ATTRIBUTES, Otlp } from '../constants'
import { enqueueSpans } from '../services/tracing/spans/enqueue'

export type * from '@latitude-data/telemetry'

export const internalBaggageSchema = z.object({
  workspaceId: z.number(),
  apiKeyId: z.number().optional(),
})
export type InternalBaggage = z.infer<typeof internalBaggageSchema>

export const BACKGROUND = (baggage: InternalBaggage) =>
  propagation.setBaggage(
    ROOT(),
    propagation.createBaggage({
      [ATTRIBUTES.LATITUDE.internal]: { value: JSON.stringify(baggage) },
    }),
  )

class InternalExporter implements SpanExporter {
  private resource: Resource

  constructor() {
    this.resource = new Resource({
      [ATTRIBUTES.OPENTELEMETRY.SERVICE.name]:
        process.env.npm_package_name || 'unknown',
    })
  }

  export(
    spans: ReadableSpan[],
    callback: (result: ExportResult) => void,
  ): void {
    enqueueSpans({ spans: this.convert(spans) })
      .then((r) => r.unwrap())
      .then(() => callback({ code: ExportResultCode.SUCCESS }))
      .catch((error: Error) => {
        try {
          captureException(error)
        } catch {
          console.error(error)
        }
        callback({ code: ExportResultCode.FAILED, error })
      })
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }

  forceFlush(): Promise<void> {
    return Promise.resolve()
  }

  private convertValue(value: unknown): Otlp.AttributeValue | undefined {
    if (value == null || value == undefined) return undefined
    if (typeof value === 'string') return { stringValue: value }
    if (typeof value === 'boolean') return { boolValue: value }
    if (typeof value === 'number') return { intValue: value }
    if (!Array.isArray(value)) return undefined
    const values = value.map(this.convertValue).filter((v) => v != undefined)
    return { arrayValue: { values } }
  }

  private convertAttributes(attributes: SpanAttributes): Otlp.Attribute[] {
    const serialized = []

    for (const [key, v] of Object.entries(attributes)) {
      const value = this.convertValue(v)
      if (value != undefined) serialized.push({ key, value })
    }

    return serialized
  }

  private groupScopes(spans: ReadableSpan[]): Record<string, ReadableSpan[]> {
    const scopes: Record<string, ReadableSpan[]> = {}

    for (const span of spans) {
      let scope = span.instrumentationLibrary.name
      if (span.instrumentationLibrary.version) {
        scope += `@${span.instrumentationLibrary.version}`
      }
      if (!scopes[scope]) scopes[scope] = [span]
      else scopes[scope]!.push(span)
    }

    return scopes
  }

  private convert(spans: ReadableSpan[]): Otlp.ResourceSpan[] {
    return [
      {
        resource: {
          attributes: this.convertAttributes(this.resource.attributes),
        },
        scopeSpans: Object.entries(this.groupScopes(spans)).map(
          ([scope, spans]) => ({
            scope: {
              name: scope.split('@')[0]!,
              version: scope.split('@')[1],
            },
            spans: spans.map((span) => ({
              traceId: span.spanContext().traceId,
              spanId: span.spanContext().spanId,
              parentSpanId: span.parentSpanId,
              name: span.name,
              kind: span.kind,
              startTimeUnixNano: hrTimeToNanoseconds(span.startTime).toString(),
              endTimeUnixNano: hrTimeToNanoseconds(span.endTime).toString(),
              status: span.status,
              events: span.events.map((event) => ({
                name: event.name,
                timeUnixNano: hrTimeToNanoseconds(event.time).toString(),
                attributes: this.convertAttributes(event.attributes || {}),
              })),
              links: span.links.map((link) => ({
                traceId: link.context.traceId,
                spanId: link.context.spanId,
                attributes: this.convertAttributes(link.attributes || {}),
              })),
              attributes: this.convertAttributes(span.attributes || {}),
            })),
          }),
        ),
      },
    ]
  }
}

const processors = [DEFAULT_REDACT_SPAN_PROCESSOR()]

const exporter = new InternalExporter()

export const telemetry = new LatitudeTelemetry('internal', {
  instrumentations: {},
  disableBatch: false,
  exporter: exporter,
  processors: processors,
})
