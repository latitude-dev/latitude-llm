import type { ObservabilityState, TracesConfig } from "./types.ts"

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

export const getEnvironment = () => process.env.LAT_OBSERVABILITY_ENVIRONMENT || process.env.NODE_ENV || "development"

export const isObservabilityEnabled = () => parseBooleanEnv(process.env.LAT_OBSERVABILITY_ENABLED, false)

export const getServiceName = (state: ObservabilityState, scope: string) =>
  state.serviceName || process.env.LAT_OBSERVABILITY_SERVICE_NAME || scope

const defaultOtlpTracesEndpointFromAgentHost = (): string | undefined => {
  const host = process.env.DD_AGENT_HOST?.trim()
  if (!host) {
    return undefined
  }

  // ECS Fargate + Datadog Agent sidecar: OTLP HTTP on 4318 (see infra/lib/ecs.ts).
  // Task definitions from the dd-trace-only era omitted LAT_OBSERVABILITY_OTLP_TRACES_ENDPOINT;
  // infer the same URL the agent exposes when DD_AGENT_HOST is set (always on our ECS tasks).
  return `http://${host}:4318/v1/traces`
}

export const getTracesConfig = (): TracesConfig | undefined => {
  const explicitEndpoint =
    process.env.LAT_OBSERVABILITY_OTLP_TRACES_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT

  const endpoint = explicitEndpoint || defaultOtlpTracesEndpointFromAgentHost()

  if (!endpoint) return undefined

  return {
    endpoint,
    headers: {
      ...parseHeaders(process.env.LAT_OBSERVABILITY_OTLP_HEADERS),
    },
  }
}
