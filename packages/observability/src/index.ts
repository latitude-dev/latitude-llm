import type { Span, Tracer } from "@opentelemetry/api"
import { SpanStatusCode, trace } from "@opentelemetry/api"

export type { Span, Tracer }

import { getEnvironment, getTracesConfig, isObservabilityEnabled } from "./config.ts"
import { createLogger as createLoggerWithState, emitLog, serializeError as serializeErrorImpl } from "./logger.ts"
import { startTracing } from "./otel.ts"
import { getObservabilityState } from "./state.ts"
import type { InitializeObservabilityOptions } from "./types.ts"

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
      state.initialized = true
      return
    }

    const tracesConfig = getTracesConfig(resolvedEnvironment)
    if (!tracesConfig) {
      emitLog(state, "warn", "observability", [
        "LAT_OBSERVABILITY_ENABLED=true but LAT_OBSERVABILITY_OTLP_TRACES_ENDPOINT is not configured.",
      ])
      state.initialized = true
      return
    }

    state.shutdown = await startTracing({
      tracesConfig,
      serviceName,
      environment: resolvedEnvironment,
    })
    state.initialized = true

    emitLog(state, "info", "observability", [
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
