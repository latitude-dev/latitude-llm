/**
 * Latitude telemetry wiring for the provider-executed tools repro app.
 *
 * Uses the local repo SDK source (`../../src`) in composable mode so a second span processor can
 * snapshot every span the AI SDK emits before Latitude's redaction rewrites it. The snapshot is
 * what `inspect.ts` reads, so the repro is diagnosable without a running Latitude instance.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { Context, Tracer } from "@opentelemetry/api"
import { hrTimeToMilliseconds } from "@opentelemetry/core"
import { NodeTracerProvider, type ReadableSpan, type Span, type SpanProcessor } from "@opentelemetry/sdk-trace-node"
import { getLatitudeTracer, isDefaultExportSpan, LatitudeSpanProcessor } from "../../src/index.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
export const SPANS_DIR = join(HERE, ".spans")

export type DumpedSpanEvent = {
  name: string
  attributes: Record<string, unknown>
}

export type DumpedSpan = {
  traceId: string
  spanId: string
  parentSpanId: string | undefined
  name: string
  scope: string
  startTimeMs: number
  durationMs: number
  passesSmartFilter: boolean
  statusCode: number
  statusMessage: string | undefined
  attributes: Record<string, unknown>
  events: DumpedSpanEvent[]
}

export type SpanDump = {
  scenario: string
  model: string
  aiSdkVersion: string
  spans: DumpedSpan[]
}

function cloneAttributes(attributes: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(attributes ?? {})) as Record<string, unknown>
}

/** Snapshots spans on end. Registered before the Latitude processor so attributes are pre-redaction. */
class SpanDumpProcessor implements SpanProcessor {
  readonly spans: DumpedSpan[] = []

  onStart(_span: Span, _parentContext: Context): void {}

  onEnd(span: ReadableSpan): void {
    this.spans.push({
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
      parentSpanId: span.parentSpanContext?.spanId,
      name: span.name,
      scope: span.instrumentationScope?.name ?? "",
      startTimeMs: hrTimeToMilliseconds(span.startTime),
      durationMs: hrTimeToMilliseconds(span.duration),
      passesSmartFilter: isDefaultExportSpan(span),
      statusCode: span.status.code,
      statusMessage: span.status.message,
      attributes: cloneAttributes(span.attributes),
      events: span.events.map((event) => ({ name: event.name, attributes: cloneAttributes(event.attributes) })),
    })
  }

  /** Empties the buffer so a multi-scenario run writes one dump per scenario. */
  drain(): DumpedSpan[] {
    return this.spans.splice(0, this.spans.length)
  }

  forceFlush(): Promise<void> {
    return Promise.resolve()
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }
}

export type Telemetry = {
  tracer: Tracer
  flush: () => Promise<void>
  /** Writes the spans buffered since the previous call and returns the file path. */
  writeDump: (dump: Omit<SpanDump, "spans">) => string
}

export function setupTelemetry(): Telemetry {
  const apiKey = process.env.LATITUDE_API_KEY
  if (!apiKey) throw new Error("LATITUDE_API_KEY is required")

  const dumper = new SpanDumpProcessor()
  const provider = new NodeTracerProvider({
    spanProcessors: [
      dumper,
      new LatitudeSpanProcessor(apiKey, process.env.LATITUDE_PROJECT_SLUG, { disableBatch: true }),
    ],
  })
  provider.register()

  return {
    tracer: getLatitudeTracer("tools-app"),
    flush: () => provider.forceFlush(),
    writeDump: (meta) => {
      const path = join(SPANS_DIR, `${meta.scenario}.json`)
      mkdirSync(dirname(path), { recursive: true })
      const dump: SpanDump = { ...meta, spans: dumper.drain() }
      writeFileSync(path, `${JSON.stringify(dump, null, 2)}\n`)
      return path
    },
  }
}
