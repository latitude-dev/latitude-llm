import { LatitudeSpanProcessor } from "@latitude-data/telemetry"
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { NodeSDK } from "@opentelemetry/sdk-node"
import { BatchSpanProcessor, type SpanProcessor } from "@opentelemetry/sdk-trace-base"
import { parseEnv } from "@platform/env"
import { Effect } from "effect"
import type { TracesConfig } from "./types.ts"

const appendResourceAttribute = (key: string, value: string) => {
  const current = process.env.OTEL_RESOURCE_ATTRIBUTES
  const pairs = (current ? current.split(",") : []).filter(Boolean)
  const filteredPairs = pairs.filter((pair) => !pair.startsWith(`${key}=`))
  filteredPairs.push(`${key}=${value}`)
  process.env.OTEL_RESOURCE_ATTRIBUTES = filteredPairs.join(",")
}

export const startTracing = async ({
  tracesConfig,
  serviceName,
  environment,
}: {
  tracesConfig: TracesConfig
  serviceName: string
  environment: string
}): Promise<() => Promise<void>> => {
  process.env.OTEL_SERVICE_NAME = serviceName
  process.env.DD_SERVICE = serviceName
  process.env.DD_ENV = environment
  appendResourceAttribute("service.name", serviceName)
  appendResourceAttribute("deployment.environment", environment)

  const serviceVersion = process.env.DD_VERSION?.trim() || process.env.DD_GIT_COMMIT_SHA?.trim()
  if (serviceVersion) {
    appendResourceAttribute("service.version", serviceVersion)
  }

  const apiKey = Effect.runSync(parseEnv("LAT_LATITUDE_TELEMETRY_API_KEY", "string", ""))
  const latitudeIngestBase = Effect.runSync(
    parseEnv("LAT_LATITUDE_TELEMETRY_INGEST_URL", "string", "https://ingest.latitude.so"),
  )
  const spanProcessors: SpanProcessor[] = [
    new BatchSpanProcessor(
      new OTLPTraceExporter({
        url: tracesConfig.endpoint,
        headers: tracesConfig.headers,
      }),
    ),
  ]

  const isLatitudeTelemetryEnabled = false

  if (isLatitudeTelemetryEnabled && apiKey !== "") {
    const latitudeIngestTracesUrl = `${latitudeIngestBase.replace(/\/$/, "")}/v1/traces`
    // No default project: each internal AI feature routes its own spans via the
    // `latitude.project` attribute (set on `capture`) to its per-feature project
    // (`LATITUDE_TELEMETRY_PROJECT_SLUGS`). A span with no project would be rejected
    // at ingest, which is the intended loud failure for an unrouted generation.
    spanProcessors.push(
      new LatitudeSpanProcessor(apiKey, undefined, {
        serviceName,
        exporter: new OTLPTraceExporter({
          url: latitudeIngestTracesUrl,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeoutMillis: 30_000,
        }),
      }),
    )
  }

  const sdk = new NodeSDK({
    spanProcessors,
    instrumentations: [getNodeAutoInstrumentations()],
  })

  sdk.start()

  return () => sdk.shutdown()
}
