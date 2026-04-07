import { LatitudeSpanProcessor } from "@latitude-data/telemetry"
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { NodeSDK } from "@opentelemetry/sdk-node"
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

  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({
      url: tracesConfig.endpoint,
      headers: tracesConfig.headers,
    }),
    ...(apiKey !== undefined && projectSlug !== undefined
      ? {
          spanProcessors: [
            new LatitudeSpanProcessor(apiKey, projectSlug, {
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
          ],
        }
      : {}),
    instrumentations: [getNodeAutoInstrumentations()],
  })

  sdk.start()

  return () => sdk.shutdown()
}
