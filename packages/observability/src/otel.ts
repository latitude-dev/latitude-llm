import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { NodeSDK } from "@opentelemetry/sdk-node"
import { BatchSpanProcessor, type SpanProcessor } from "@opentelemetry/sdk-trace-base"

import { createLatitudeSpanProcessor } from "./latitude-telemetry.ts"
import { appendResourceAttribute } from "./resource-attributes.ts"
import type { ObservabilityState, TracesConfig } from "./types.ts"

export const startTracing = async ({
  tracesConfig,
  serviceName,
  environment,
  state,
}: {
  tracesConfig: TracesConfig
  serviceName: string
  environment: string
  state: ObservabilityState
}): Promise<() => Promise<void>> => {
  delete state.resolveLogTraceContext

  process.env.OTEL_SERVICE_NAME = serviceName
  process.env.DD_SERVICE = serviceName
  process.env.DD_ENV = environment
  appendResourceAttribute("service.name", serviceName)
  appendResourceAttribute("deployment.environment", environment)

  const spanProcessors: SpanProcessor[] = [
    new BatchSpanProcessor(
      new OTLPTraceExporter({
        url: tracesConfig.endpoint,
        headers: tracesConfig.headers,
      }),
    ),
  ]

  const latitudeProcessor = createLatitudeSpanProcessor(serviceName, environment)
  if (latitudeProcessor !== undefined) {
    spanProcessors.push(latitudeProcessor)
  }

  const sdk = new NodeSDK({
    spanProcessors,
    instrumentations: [getNodeAutoInstrumentations()],
  })

  sdk.start()

  return async () => {
    await sdk.shutdown()
  }
}
