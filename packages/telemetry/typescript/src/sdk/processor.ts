import type { Context } from "@opentelemetry/api"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import {
  BatchSpanProcessor,
  type ReadableSpan,
  SimpleSpanProcessor,
  type Span,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-node"
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions"
import { ATTRIBUTES } from "../constants/index.ts"
import { env } from "../env/index.ts"
import { getLatitudeContext } from "./context.ts"
import { DEFAULT_REDACT_SPAN_PROCESSOR, RedactSpanProcessor } from "./redact.ts"
import {
  buildShouldExportSpanFromFields,
  ExportFilterSpanProcessor,
  RedactThenExportSpanProcessor,
} from "./span-filter.ts"
import type { LatitudeSpanProcessorOptions } from "./types.ts"

export class LatitudeSpanProcessor implements SpanProcessor {
  private readonly tail: SpanProcessor
  private readonly serviceName: string | undefined

  constructor(apiKey: string, projectSlug: string, options?: LatitudeSpanProcessorOptions) {
    if (!apiKey || apiKey.trim() === "") {
      throw new Error("[Latitude] apiKey is required and cannot be empty")
    }
    if (!projectSlug || projectSlug.trim() === "") {
      throw new Error("[Latitude] projectSlug is required and cannot be empty")
    }

    const exporter =
      options?.exporter ??
      new OTLPTraceExporter({
        url: `${env.EXPORTER_URL}/v1/traces`,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Latitude-Project": projectSlug,
        },
        timeoutMillis: 30_000,
      })

    const redact = options?.disableRedact
      ? null
      : options?.redact
        ? new RedactSpanProcessor(options.redact)
        : DEFAULT_REDACT_SPAN_PROCESSOR()

    const batchOrSimple = options?.disableBatch ? new SimpleSpanProcessor(exporter) : new BatchSpanProcessor(exporter)

    const shouldExport = buildShouldExportSpanFromFields({
      disableSmartFilter: options?.disableSmartFilter,
      shouldExportSpan: options?.shouldExportSpan,
      blockedInstrumentationScopes: options?.blockedInstrumentationScopes,
    })

    const redactThenExport = new RedactThenExportSpanProcessor(redact, batchOrSimple)
    this.tail = new ExportFilterSpanProcessor(shouldExport, redactThenExport)

    const rawServiceName = options?.serviceName?.trim()
    this.serviceName = rawServiceName === "" ? undefined : rawServiceName
  }

  onStart(span: Span, parentContext: Context): void {
    if (this.serviceName !== undefined) {
      span.setAttribute(ATTR_SERVICE_NAME, this.serviceName)
    }

    const latitudeData = getLatitudeContext(parentContext)

    if (latitudeData) {
      if (latitudeData.name) {
        span.setAttribute(ATTRIBUTES.name, latitudeData.name)
        // Only update span name for the capture root span (has latitude.capture.root attr)
        // Child spans keep their original names (database.query, business.validate, etc.)
        if (span.attributes["latitude.capture.root"]) {
          span.updateName(latitudeData.name)
        }
      }
      if (latitudeData.tags && latitudeData.tags.length > 0) {
        span.setAttribute(ATTRIBUTES.tags, JSON.stringify(latitudeData.tags))
      }
      if (latitudeData.metadata && Object.keys(latitudeData.metadata).length > 0) {
        span.setAttribute(ATTRIBUTES.metadata, JSON.stringify(latitudeData.metadata))
      }
      if (latitudeData.sessionId) {
        span.setAttribute(ATTRIBUTES.sessionId, latitudeData.sessionId)
      }
      if (latitudeData.userId) {
        span.setAttribute(ATTRIBUTES.userId, latitudeData.userId)
      }
    }

    this.tail.onStart(span, parentContext)
  }

  onEnd(span: ReadableSpan): void {
    this.tail.onEnd(span)
  }

  async forceFlush(): Promise<void> {
    await this.tail.forceFlush()
  }

  async shutdown(): Promise<void> {
    await this.tail.shutdown()
  }
}
