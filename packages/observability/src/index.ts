import { context, trace } from "@opentelemetry/api"

type LogLevel = "info" | "warn" | "error"

interface ObservabilityState {
  initialized: boolean
  enabled: boolean
  serviceName?: string
  environment?: string
  initialization?: Promise<void>
  shutdown?: () => Promise<void>
}

interface InitializeObservabilityOptions {
  readonly serviceName: string
  readonly environment?: string
}

interface TracesConfig {
  readonly endpoint: string
  readonly headers: Record<string, string>
}

const OBSERVABILITY_STATE_KEY = Symbol.for("latitude.observability.state")
const globalWithObservabilityState = globalThis as typeof globalThis & {
  [OBSERVABILITY_STATE_KEY]?: ObservabilityState
}

let state = globalWithObservabilityState[OBSERVABILITY_STATE_KEY]
if (!state) {
  state = {
    initialized: false,
    enabled: false,
  }
  globalWithObservabilityState[OBSERVABILITY_STATE_KEY] = state
}

const parseBooleanEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value.length === 0) {
    return fallback
  }

  const normalized = value.toLowerCase()
  if (normalized === "true") {
    return true
  }

  if (normalized === "false") {
    return false
  }

  return fallback
}

const parseHeaders = (value: string | undefined): Record<string, string> => {
  if (!value) {
    return {}
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, entry) => {
      const separatorIndex = entry.indexOf("=")
      if (separatorIndex <= 0) {
        return acc
      }

      const key = entry.slice(0, separatorIndex).trim()
      const headerValue = entry.slice(separatorIndex + 1).trim()
      if (!key || !headerValue) {
        return acc
      }

      acc[key] = headerValue
      return acc
    }, {})
}

const getEnvironment = () => process.env.LAT_OBSERVABILITY_ENVIRONMENT || process.env.NODE_ENV || "development"

const getServiceName = (scope: string) => state.serviceName || process.env.LAT_OBSERVABILITY_SERVICE_NAME || scope

const getTracesConfig = (): TracesConfig | undefined => {
  const explicitEndpoint =
    process.env.LAT_OBSERVABILITY_OTLP_TRACES_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
  if (explicitEndpoint) {
    return {
      endpoint: explicitEndpoint,
      headers: {
        ...parseHeaders(process.env.LAT_OBSERVABILITY_OTLP_HEADERS),
      },
    }
  }

  const datadogApiKey = process.env.LAT_DATADOG_API_KEY
  if (!datadogApiKey) {
    return undefined
  }

  const datadogSite = process.env.LAT_DATADOG_SITE || "datadoghq.com"
  return {
    endpoint: `https://otlp.${datadogSite}/v1/traces`,
    headers: {
      "DD-API-KEY": datadogApiKey,
      ...parseHeaders(process.env.LAT_OBSERVABILITY_OTLP_HEADERS),
    },
  }
}

const appendResourceAttribute = (key: string, value: string) => {
  const current = process.env.OTEL_RESOURCE_ATTRIBUTES
  const pairs = (current ? current.split(",") : []).filter(Boolean)
  const filteredPairs = pairs.filter((pair) => !pair.startsWith(`${key}=`))
  filteredPairs.push(`${key}=${value}`)
  process.env.OTEL_RESOURCE_ATTRIBUTES = filteredPairs.join(",")
}

const getTraceContext = () => {
  const activeSpan = trace.getSpan(context.active())
  if (!activeSpan) {
    return {}
  }

  const spanContext = activeSpan.spanContext()
  return {
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
  }
}

const toSerializable = (value: unknown): unknown => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }

  if (typeof value === "bigint") {
    return value.toString()
  }

  return value
}

const stringifyValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const emitLog = (level: LogLevel, scope: string, args: unknown[]) => {
  const environment = state.environment || getEnvironment()
  const service = getServiceName(scope)
  const values = args.map(toSerializable)
  const message = values.map(stringifyValue).join(" ")

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    scope,
    service,
    env: environment,
    ddsource: "nodejs",
    ddtags: `env:${environment},service:${service},scope:${scope}`,
    message,
    args: values,
    ...getTraceContext(),
  }

  const line = JSON.stringify(payload)
  if (level === "error") {
    console.error(line)
    return
  }

  if (level === "warn") {
    console.warn(line)
    return
  }

  console.log(line)
}

export const createLogger = (scope: string) => {
  return {
    info: (...args: unknown[]) => emitLog("info", scope, args),
    warn: (...args: unknown[]) => emitLog("warn", scope, args),
    error: (...args: unknown[]) => emitLog("error", scope, args),
  }
}

export const initializeObservability = async ({
  serviceName,
  environment,
}: InitializeObservabilityOptions): Promise<void> => {
  state.serviceName = serviceName
  const resolvedEnvironment = environment || getEnvironment()
  state.environment = resolvedEnvironment

  if (state.initialization) {
    await state.initialization
    return
  }

  if (state.initialized) {
    return
  }

  state.initialization = (async () => {
    const enabled = parseBooleanEnv(process.env.LAT_OBSERVABILITY_ENABLED, false)
    state.enabled = enabled

    if (!enabled) {
      state.initialized = true
      return
    }

    const tracesConfig = getTracesConfig()
    if (!tracesConfig) {
      emitLog("warn", "observability", [
        "LAT_OBSERVABILITY_ENABLED=true but no exporter is configured. Set LAT_DATADOG_API_KEY or LAT_OBSERVABILITY_OTLP_TRACES_ENDPOINT.",
      ])
      state.initialized = true
      return
    }

    process.env.OTEL_SERVICE_NAME = serviceName
    process.env.DD_SERVICE = serviceName
    process.env.DD_ENV = resolvedEnvironment
    appendResourceAttribute("service.name", serviceName)
    appendResourceAttribute("deployment.environment", resolvedEnvironment)

    const [{ NodeSDK }, { OTLPTraceExporter }, { getNodeAutoInstrumentations }] = await Promise.all([
      import("@opentelemetry/sdk-node"),
      import("@opentelemetry/exporter-trace-otlp-http"),
      import("@opentelemetry/auto-instrumentations-node"),
    ])

    const sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter({
        url: tracesConfig.endpoint,
        headers: tracesConfig.headers,
      }),
      instrumentations: [getNodeAutoInstrumentations()],
    })

    await sdk.start()
    state.shutdown = () => sdk.shutdown()
    state.initialized = true

    emitLog("info", "observability", [
      "Datadog OTLP tracing enabled",
      { endpoint: tracesConfig.endpoint, serviceName, environment: resolvedEnvironment },
    ])
  })()

  try {
    await state.initialization
  } catch (error) {
    delete state.initialization
    state.initialized = false
    state.enabled = false
    emitLog("error", "observability", ["Failed to initialize observability", toSerializable(error)])
  }
}

export const shutdownObservability = async () => {
  if (!state.shutdown) {
    return
  }

  await state.shutdown()
}
