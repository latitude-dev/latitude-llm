import type { SpanProcessor } from "@opentelemetry/sdk-trace-base"

import { createLatitudeSpanProcessor } from "./latitude-telemetry.ts"
import { appendResourceAttribute } from "./resource-attributes.ts"
import type { ObservabilityState } from "./types.ts"

type DatadogOtelTracerProvider = {
  addSpanProcessor: (processor: SpanProcessor) => void
  register: (config?: Record<string, unknown>) => void
  shutdown: () => Promise<void>
}

/** Loads dd-trace at runtime only so SSR bundlers never crawl its optional @datadog/* graph. */
export const startDatadogTracing = async ({
  serviceName,
  environment,
  state,
}: {
  serviceName: string
  environment: string
  state: ObservabilityState
}): Promise<() => Promise<void>> => {
  const tracerModule = await import(/* @vite-ignore */ "dd-trace")
  const tracer = tracerModule.default

  const getDatadogTracerProviderConstructor = (): (new (
    config?: Record<string, unknown>,
  ) => DatadogOtelTracerProvider) =>
    tracer.TracerProvider as unknown as new (
      config?: Record<string, unknown>,
    ) => DatadogOtelTracerProvider

  const resolvedService = process.env.DD_SERVICE ?? serviceName
  const resolvedEnv = process.env.DD_ENV ?? environment

  process.env.OTEL_SERVICE_NAME = resolvedService
  process.env.DD_SERVICE = resolvedService
  process.env.DD_ENV = resolvedEnv
  appendResourceAttribute("service.name", resolvedService)
  appendResourceAttribute("deployment.environment", resolvedEnv)

  state.resolveLogTraceContext = () => {
    const span = tracer.scope().active()
    if (!span) {
      return {}
    }
    const ctx = span.context()
    return {
      trace_id: ctx.toTraceId(),
      span_id: ctx.toSpanId(),
    }
  }

  type TracerInitOptions = NonNullable<Parameters<typeof tracer.init>[0]>
  const initOptions: TracerInitOptions = {
    service: resolvedService,
    env: resolvedEnv,
  }
  const ddVersion = process.env.DD_VERSION
  if (ddVersion !== undefined && ddVersion.length > 0) {
    initOptions.version = ddVersion
  }
  tracer.init(initOptions)

  const Provider = getDatadogTracerProviderConstructor()
  const provider = new Provider()
  const latitudeProcessor = createLatitudeSpanProcessor(resolvedService, resolvedEnv)
  if (latitudeProcessor !== undefined) {
    provider.addSpanProcessor(latitudeProcessor)
  }
  provider.register()

  return async () => {
    delete state.resolveLogTraceContext
    await provider.shutdown()
  }
}
