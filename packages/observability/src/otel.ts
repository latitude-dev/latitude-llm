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
  const { getNodeAutoInstrumentations } = await import("@opentelemetry/auto-instrumentations-node")
  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http")
  const { NodeSDK } = await import("@opentelemetry/sdk-node")

  process.env.OTEL_SERVICE_NAME = serviceName
  process.env.DD_SERVICE = serviceName
  process.env.DD_ENV = environment
  appendResourceAttribute("service.name", serviceName)
  appendResourceAttribute("deployment.environment", environment)

  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({
      url: tracesConfig.endpoint,
      headers: tracesConfig.headers,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  })

  await sdk.start()

  return () => sdk.shutdown()
}
