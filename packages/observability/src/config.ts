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

export const getTracesConfig = (): TracesConfig | undefined => {
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
