import { LatitudeSpanProcessor } from "@latitude-data/telemetry"
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { NodeSDK } from "@opentelemetry/sdk-node"
import { BatchSpanProcessor, type SpanProcessor } from "@opentelemetry/sdk-trace-base"
import { parseEnvOptional } from "@platform/env"
import { Effect } from "effect"

import { resolveLatitudeTelemetryIngestBaseUrl } from "./config.ts"
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

  const apiKey = Effect.runSync(parseEnvOptional("LAT_LATITUDE_TELEMETRY_API_KEY", "string"))
  const projectSlug = Effect.runSync(parseEnvOptional("LAT_LATITUDE_TELEMETRY_PROJECT_SLUG", "string"))
  const latitudeIngestBase = resolveLatitudeTelemetryIngestBaseUrl(environment).replace(/\/$/, "")
  const spanProcessors: SpanProcessor[] = [
    new BatchSpanProcessor(
      new OTLPTraceExporter({
        url: tracesConfig.endpoint,
        headers: tracesConfig.headers,
      }),
    ),
  ]

  if (apiKey !== undefined && projectSlug !== undefined) {
    spanProcessors.push(
      new LatitudeSpanProcessor(apiKey, projectSlug, {
        serviceName,
        exporter: new OTLPTraceExporter({
          url: `${latitudeIngestBase}/v1/traces`,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "X-Latitude-Project": projectSlug,
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
