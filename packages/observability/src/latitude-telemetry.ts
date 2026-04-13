import { LatitudeSpanProcessor } from "@latitude-data/telemetry"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { parseEnvOptional } from "@platform/env"
import { Effect } from "effect"

import { resolveLatitudeTelemetryIngestBaseUrl } from "./config.ts"

export const createLatitudeSpanProcessor = (
  serviceName: string,
  environment: string,
): LatitudeSpanProcessor | undefined => {
  const apiKey = Effect.runSync(parseEnvOptional("LAT_LATITUDE_TELEMETRY_API_KEY", "string"))
  const projectSlug = Effect.runSync(parseEnvOptional("LAT_LATITUDE_TELEMETRY_PROJECT_SLUG", "string"))
  if (typeof apiKey !== "string" || typeof projectSlug !== "string") {
    return undefined
  }

  const latitudeIngestBase = resolveLatitudeTelemetryIngestBaseUrl(environment).replace(/\/$/, "")
  return new LatitudeSpanProcessor(apiKey, projectSlug, {
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
  })
}
