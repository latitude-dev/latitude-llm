import type { Span, Tracer } from "@opentelemetry/api"
import { SpanStatusCode, trace } from "@opentelemetry/api"

export type { Span, Tracer }

import { getEnvironment, getTracesConfig, getTracingProvider, isObservabilityEnabled } from "./config.ts"
import { startDatadogTracing } from "./datadog-trace.ts"
import { createLogger as createLoggerWithState, emitLog, serializeError as serializeErrorImpl } from "./logger.ts"
import { startTracing } from "./otel.ts"
import { getObservabilityState } from "./state.ts"
import type { InitializeObservabilityOptions } from "./types.ts"

export { getTracingProvider, type ObservabilityTracingProvider } from "./config.ts"
export { recordSpanExceptionForDatadog } from "./record-span-exception.ts"
export { trace, SpanStatusCode }
export const createLogger = (scope: string) => createLoggerWithState(getObservabilityState(), scope)
export const serializeError = serializeErrorImpl

export const initializeObservability = async ({ serviceName }: InitializeObservabilityOptions): Promise<void> => {
  const state = getObservabilityState()
  state.serviceName = serviceName
  const resolvedEnvironment = getEnvironment()
  state.environment = resolvedEnvironment

  if (state.initialization) {
    await state.initialization
    return
  }

  if (state.initialized) {
    return
  }

  state.initialization = (async () => {
    const enabled = isObservabilityEnabled()
    state.enabled = enabled

    if (!enabled) {
      delete state.resolveLogTraceContext
      state.initialized = true
      return
    }

    const tracingProvider = getTracingProvider()

    if (tracingProvider === "datadog") {
      state.shutdown = await startDatadogTracing({
        serviceName,
        environment: resolvedEnvironment,
        state,
      })
      state.initialized = true

      emitLog(state, "info", "observability", [
        "Datadog dd-trace enabled",
        { serviceName, environment: resolvedEnvironment },
      ])
      return
    }

    const tracesConfig = getTracesConfig()
    if (!tracesConfig) {
      emitLog(state, "warn", "observability", [
        "LAT_OBSERVABILITY_ENABLED=true but LAT_OBSERVABILITY_OTLP_TRACES_ENDPOINT is not configured.",
      ])
      delete state.resolveLogTraceContext
      state.initialized = true
      return
    }

    state.shutdown = await startTracing({
      tracesConfig,
      serviceName,
      environment: resolvedEnvironment,
      state,
    })
    state.initialized = true

    emitLog(state, "info", "observability", [
      "OTLP tracing enabled",
      { endpoint: tracesConfig.endpoint, serviceName, environment: resolvedEnvironment },
    ])
  })()

  try {
    await state.initialization
  } catch (error) {
    delete state.initialization
    state.initialized = false
    state.enabled = false
    delete state.resolveLogTraceContext
    emitLog(state, "error", "observability", ["Failed to initialize observability", serializeErrorImpl(error)])
  }
}

export const shutdownObservability = async () => {
  const state = getObservabilityState()
  if (!state.shutdown) {
    return
  }

  await state.shutdown()
}
