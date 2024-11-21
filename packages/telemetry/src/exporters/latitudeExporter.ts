import { ExportResultCode, hrTimeToNanoseconds } from '@opentelemetry/core'
import {
  OTLPExporterBase,
  OTLPExporterConfigBase,
} from '@opentelemetry/otlp-exporter-base'
import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'

interface OTLPHttpExporterConfig extends OTLPExporterConfigBase {
  projectId: number
  apiKey: string
  endpoint?: string
}

export class LatitudeExporter
  extends OTLPExporterBase<any, any, any>
  implements SpanExporter
{
  url: string
  private headers: Record<string, string>
  private projectId: number

  constructor(config: OTLPHttpExporterConfig) {
    super(config)

    this.projectId = config.projectId
    this.url = config.endpoint || 'http://localhost:8787/api/v2/otlp/v1/traces'
    this.headers = {
      Authorization: `Bearer ${config.apiKey}`,
    }
  }

  async export(
    spans: ReadableSpan[],
    resultCallback: (result: any) => void,
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

  async onShutdown(): Promise<void> {
    // No-op
  }

  async onInit(): Promise<void> {
    // No-op
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
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
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
                kind: span.kind,
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

  getDefaultUrl(config: any): string {
    return config.endpoint || 'http://localhost:8787/api/v2/otlp/v1/traces'
  }

  private convertAttributes(attributes: Record<string, unknown> = {}): Array<{
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
}
