import { type Context, context, createContextKey, trace } from "@opentelemetry/api"
import type { ContextOptions } from "./types.ts"

export const LATITUDE_CONTEXT_KEY = createContextKey("latitude-internal-context")
const CAPTURE_TRACER_NAME = "so.latitude.instrumentation.capture"

type LatitudeContextData = {
  tags: string[] | undefined
  metadata: Record<string, unknown> | undefined
  sessionId: string | undefined
  userId: string | undefined
}

export function getLatitudeContext(ctx: Context): LatitudeContextData | undefined {
  return ctx.getValue(LATITUDE_CONTEXT_KEY) as LatitudeContextData | undefined
}

function mergeArrays<T>(a: T[] | undefined, b: T[] | undefined): T[] | undefined {
  if (!a && !b) return undefined
  if (!a) return b
  if (!b) return a
  return [...new Set([...a, ...b])]
}

export function capture<T>(name: string, fn: () => T | Promise<T>, options: ContextOptions = {}): T | Promise<T> {
  const currentContext = context.active()
  const existingData = getLatitudeContext(currentContext)

  const mergedData: LatitudeContextData = {
    tags: mergeArrays(existingData?.tags, options.tags),
    metadata: { ...existingData?.metadata, ...options.metadata },
    sessionId: options.sessionId ?? existingData?.sessionId,
    userId: options.userId ?? existingData?.userId,
  }

  const newContext = currentContext.setValue(LATITUDE_CONTEXT_KEY, mergedData)
  const existingSpan = trace.getSpan(currentContext)

  if (existingSpan) {
    return context.with(newContext, fn)
  }

  const tracer = trace.getTracer(CAPTURE_TRACER_NAME)

  return tracer.startActiveSpan(name, { attributes: { "latitude.capture.root": true } }, newContext, (span) => {
    let result: T | Promise<T>
    try {
      result = fn()
    } catch (error) {
      span.recordException(error as Error)
      span.end()
      throw error
    }

    if (result instanceof Promise) {
      return result
        .catch((error) => {
          span.recordException(error as Error)
          throw error
        })
        .finally(() => {
          span.end()
        }) as T | Promise<T>
    }

    span.end()
    return result
  })
}
