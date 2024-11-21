import { ExportResultCode, hrTimeToNanoseconds } from '@opentelemetry/core'
import { OTLPExporterConfigBase } from '@opentelemetry/otlp-exporter-base'
import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'

interface OTLPHttpExporterConfig extends OTLPExporterConfigBase {
  projectId: number
  apiKey: string
  endpoint?: string
}

export class LatitudeExporter implements SpanExporter {
  private headers: Record<string, string>
  private url: string
  private projectId: number

  constructor(config: OTLPHttpExporterConfig) {
    this.projectId = config.projectId
    this.url = this.getDefaultUrl(config)
    this.headers = {
      ...this.headers,
      Authorization: `Bearer ${config.apiKey}`,
    }
  }

  convert(spans: ReadableSpan[]) {
    return {
      projectId: this.projectId,
      resourceSpans: [
        {
          resource: {
            attributes: this.convertAttributes(
              spans[0]?.resource?.attributes || {},
            ),
          },
          scopeSpans: [
            {
              spans: spans.map((span) => ({
                traceId: span.spanContext().traceId,
                spanId: span.spanContext().spanId,
                parentSpanId: span.parentSpanId,
                name: span.name,
                kind: this.convertKind(span.kind),
                startTimeUnixNano: hrTimeToNanoseconds(
                  span.startTime,
                ).toString(),
                endTimeUnixNano: span.endTime
                  ? hrTimeToNanoseconds(span.endTime).toString()
                  : undefined,
                attributes: this.convertAttributes(span.attributes),
                status: span.status && {
                  code: span.status.code,
                  message: span.status.message,
                },
                events: span.events?.map((event) => ({
                  timeUnixNano: hrTimeToNanoseconds(event.time).toString(),
                  name: event.name,
                  attributes: this.convertAttributes(event.attributes),
                })),
                links: span.links?.map((link) => ({
                  traceId: link.context.traceId,
                  spanId: link.context.spanId,
                  attributes: this.convertAttributes(link.attributes),
                })),
              })),
            },
          ],
        },
      ],
    }
  }

  private convertAttributes(attributes: Record<string, unknown>): Array<{
    key: string
    value: { stringValue?: string; intValue?: number; boolValue?: boolean }
  }> {
    return Object.entries(attributes).map(([key, value]) => ({
      key,
      value: this.convertAttributeValue(value),
    }))
  }

  private convertAttributeValue(value: unknown): {
    stringValue?: string
    intValue?: number
    boolValue?: boolean
  } {
    if (typeof value === 'string') return { stringValue: value }
    if (typeof value === 'number') return { intValue: value }
    if (typeof value === 'boolean') return { boolValue: value }
    return { stringValue: String(value) }
  }

  private convertKind(kind: number): number {
    // OpenTelemetry SpanKind enum matches our expected values
    return kind
  }

  getDefaultUrl(config: OTLPHttpExporterConfig): string {
    return config.endpoint || 'http://localhost:3000/api/v2/otlp/v1/traces'
  }

  async send(
    spans: ReadableSpan[],
    onSuccess: () => void,
    onError: (error: Error) => void,
  ): Promise<void> {
    if (spans.length === 0) {
      onSuccess()
      return
    }

    const serviceRequest = this.convert(spans)
    const body = JSON.stringify(serviceRequest)

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: this.headers,
        body,
      })

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`)
      }

      onSuccess()
    } catch (error) {
      onError(error as Error)
    }
  }

  async export(
    spans: ReadableSpan[],
    resultCallback: (result) => void,
  ): Promise<void> {
    await this.send(
      spans,
      () => resultCallback({ code: ExportResultCode.SUCCESS }),
      (error) => {
        resultCallback({ code: ExportResultCode.FAILED, error })
      },
    )
  }

  async shutdown(): Promise<void> {
    // No-op
  }
}
