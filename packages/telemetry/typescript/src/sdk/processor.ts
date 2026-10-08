import type { Context } from "@opentelemetry/api"
import type { ExportResult } from "@opentelemetry/core"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { resourceFromAttributes } from "@opentelemetry/resources"
import {
  BatchSpanProcessor,
  type ReadableSpan,
  SimpleSpanProcessor,
  type Span,
  type SpanExporter,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-node"
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions"
import { ATTRIBUTES } from "../constants/index.ts"
import { env } from "../env/index.ts"
import { getLatitudeContext } from "./context.ts"
import { CostResolution, type NormalizedCost, SpanCostTracker } from "./cost.ts"
import { ExportViewExporter } from "./export-view.ts"
import { DEFAULT_REDACT_SPAN_PROCESSOR, RedactSpanProcessor } from "./redact.ts"
import { buildShouldExportSpanFromFields, ExportFilterSpanProcessor } from "./span-filter.ts"
import type { LatitudeSpanProcessorOptions } from "./types.ts"

// `service.name` is a resource attribute per OTel semantic conventions, not a span attribute.
// When piggy-backing on another SDK's provider we can't change the host's resource, so we wrap
// the exporter to rewrite each exported span's resource. The original span is untouched, so other
// span processors on the host provider keep seeing the host's resource.
class ServiceNameResourceExporter implements SpanExporter {
  private readonly overlay: ReturnType<typeof resourceFromAttributes>

  constructor(
    private readonly inner: SpanExporter,
    serviceName: string,
  ) {
    this.overlay = resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName })
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    const overlay = this.overlay
    const overridden = spans.map(
      (span) =>
        new Proxy(span, {
          get(target, prop, receiver) {
            if (prop === "resource") return target.resource.merge(overlay)
            return Reflect.get(target, prop, receiver)
          },
        }),
    )
    this.inner.export(overridden, resultCallback)
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown()
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush?.() ?? Promise.resolve()
  }
}

export class LatitudeSpanProcessor implements SpanProcessor {
  private readonly tail: SpanProcessor
  private readonly costTracker: SpanCostTracker

  constructor(apiKey: string, project: string | undefined, options?: LatitudeSpanProcessorOptions) {
    if (!apiKey || apiKey.trim() === "") {
      throw new Error("[Latitude] apiKey is required and cannot be empty")
    }

    const normalizedProject = project && project.trim() !== "" ? project : undefined
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    }
    if (normalizedProject) headers["X-Latitude-Project"] = normalizedProject

    const baseExporter =
      options?.exporter ??
      new OTLPTraceExporter({
        url: `${env.EXPORTER_URL}/v1/traces`,
        headers,
        timeoutMillis: 30_000,
      })

    const rawServiceName = options?.serviceName?.trim()
    const serviceExporter = rawServiceName
      ? new ServiceNameResourceExporter(baseExporter, rawServiceName)
      : baseExporter
    this.costTracker = new SpanCostTracker(
      new CostResolution({ pricing: options?.pricing, costResolver: options?.costResolver }),
    )

    const redact = options?.disableRedact
      ? null
      : options?.redact
        ? new RedactSpanProcessor(options.redact)
        : DEFAULT_REDACT_SPAN_PROCESSOR()

    // The span object is shared with other processors, so redaction and cost are applied to an
    // export-time view, never to the span. The view wrapper is outermost: it must see the original
    // span objects to find their resolved cost.
    const exporter = new ExportViewExporter(serviceExporter, this.costTracker, redact)

    const batchOrSimple = options?.disableBatch ? new SimpleSpanProcessor(exporter) : new BatchSpanProcessor(exporter)

    const shouldExport = buildShouldExportSpanFromFields({
      disableSmartFilter: options?.disableSmartFilter,
      shouldExportSpan: options?.shouldExportSpan,
      blockedInstrumentationScopes: options?.blockedInstrumentationScopes,
    })

    this.tail = new ExportFilterSpanProcessor(shouldExport, batchOrSimple, {
      ...(options?.blockedInstrumentationScopes !== undefined
        ? { blockedInstrumentationScopes: options.blockedInstrumentationScopes }
        : {}),
    })
  }

  onStart(span: Span, parentContext: Context): void {
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
      if (latitudeData.userEmail) {
        span.setAttribute(ATTRIBUTES.userEmail, latitudeData.userEmail)
      }
      if (latitudeData.project) {
        span.setAttribute(ATTRIBUTES.project, latitudeData.project)
      }
    }

    this.recordCaptureCost(span, latitudeData?.cost)
    this.tail.onStart(span, parentContext)
  }

  // Whether this is an LLM-call span is only known at export (instrumentors often set gen_ai.* late),
  // so remember the capture cost per span and let the export wrapper decide.
  private recordCaptureCost(span: Span, cost: NormalizedCost | undefined): void {
    if (!cost || span.attributes?.["latitude.capture.root"]) return
    this.costTracker.onStart(span, cost)
  }

  onEnd(span: ReadableSpan): void {
    // Resolve cost from the unredacted span; redaction only happens in the export view.
    this.costTracker.onEnd(span)
    this.tail.onEnd(span)
  }

  async forceFlush(): Promise<void> {
    await this.tail.forceFlush()
  }

  async shutdown(): Promise<void> {
    await this.tail.shutdown()
    this.costTracker.clear()
  }
}
