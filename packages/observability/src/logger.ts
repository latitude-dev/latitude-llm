import { context, trace } from "@opentelemetry/api"
import { getEnvironment, getServiceName } from "./config.ts"
import type { LogLevel, ObservabilityState } from "./types.ts"

const getTraceContext = (state: ObservabilityState) => {
  const activeSpan = trace.getSpan(context.active())
  if (activeSpan) {
    const spanContext = activeSpan.spanContext()
    return {
      trace_id: spanContext.traceId,
      span_id: spanContext.spanId,
    }
  }

  return state.resolveLogTraceContext?.() ?? {}
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

export const emitLog = (state: ObservabilityState, level: LogLevel, scope: string, args: unknown[]) => {
  const environment = state.environment || getEnvironment()
  const service = getServiceName(state, scope)
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
    ...getTraceContext(state),
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

export const createLogger = (state: ObservabilityState, scope: string) => {
  return {
    info: (...args: unknown[]) => emitLog(state, "info", scope, args),
    warn: (...args: unknown[]) => emitLog(state, "warn", scope, args),
    error: (...args: unknown[]) => emitLog(state, "error", scope, args),
  }
}

export const serializeError = (error: unknown): unknown => toSerializable(error)
