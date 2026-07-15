import { type Context, context, createContextKey, type Span, SpanStatusCode, trace } from "@opentelemetry/api"
import { warnProjectSlugDeprecated } from "./_deprecation.ts"
import type { ContextOptions } from "./types.ts"

export const LATITUDE_CONTEXT_KEY = createContextKey("latitude-internal-context")
const LATITUDE_CAPTURE_SCOPE_KEY = createContextKey("latitude-internal-capture-scope")
const CAPTURE_TRACER_NAME = "so.latitude.instrumentation.capture"
const CAPTURE_SCOPE_BRAND = Symbol("latitude-capture-scope")

function recordSpanExceptionForDatadog(span: Span, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error))
  span.recordException(err)
  span.setStatus({ code: SpanStatusCode.ERROR, message: err.message })
  span.setAttributes({
    "error.message": err.message,
    "error.stack": err.stack ?? "",
    "error.type": err.constructor.name,
  })
}

type LatitudeContextData = {
  name: string | undefined
  tags: string[] | undefined
  metadata: Record<string, unknown> | undefined
  sessionId: string | undefined
  userId: string | undefined
  userEmail: string | undefined
  memoryScope: string | undefined
  project: string | undefined
}

export type CaptureScope = {
  readonly [CAPTURE_SCOPE_BRAND]: true
  end(error?: unknown): void
}

type CaptureScopeInternal = CaptureScope & {
  previousContext: Context
  span: Span | undefined
  ended: boolean
}

type AttachCapableContextManager = {
  _asyncLocalStorage?: {
    enterWith(ctx: Context): void
  }
}

type CaptureFunction = {
  <T>(name: string, fn: () => T | Promise<T>, options?: ContextOptions): T | Promise<T>
  start(name: string, options?: ContextOptions): CaptureScope
  end(scope?: CaptureScope, error?: unknown): void
  end(error?: unknown): void
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

function shouldReuseActiveLatitudeTrace(currentContext: Context): boolean {
  return getLatitudeContext(currentContext) !== undefined
}

function getContextManager(): AttachCapableContextManager {
  const manager = (
    context as unknown as { _getContextManager?: () => AttachCapableContextManager }
  )._getContextManager?.()
  if (!manager?._asyncLocalStorage?.enterWith) {
    throw new Error("capture.start() requires the Node async-hooks OpenTelemetry context manager")
  }
  return manager
}

function attachContext(ctx: Context): void {
  getContextManager()._asyncLocalStorage?.enterWith(ctx)
}

function isCaptureScope(value: unknown): value is CaptureScopeInternal {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { [CAPTURE_SCOPE_BRAND]?: true })[CAPTURE_SCOPE_BRAND] === true
  )
}

function getCaptureScope(ctx: Context): CaptureScopeInternal | undefined {
  const scope = ctx.getValue(LATITUDE_CAPTURE_SCOPE_KEY)
  return isCaptureScope(scope) ? scope : undefined
}

function buildCaptureContext(name: string, currentContext: Context, options: ContextOptions): Context {
  const existingData = getLatitudeContext(currentContext)
  const shouldReuseTrace = shouldReuseActiveLatitudeTrace(currentContext)
  const parentContext = shouldReuseTrace ? currentContext : trace.deleteSpan(currentContext)

  if (options.project === undefined && options.projectSlug !== undefined) {
    warnProjectSlugDeprecated("capture")
  }
  const projectFromOptions = options.project ?? options.projectSlug

  const mergedData: LatitudeContextData = {
    name: options.name ?? name,
    tags: mergeArrays(existingData?.tags, options.tags),
    metadata: { ...existingData?.metadata, ...options.metadata },
    sessionId: options.sessionId ?? existingData?.sessionId,
    userId: options.userId ?? existingData?.userId,
    userEmail: options.userEmail ?? existingData?.userEmail,
    memoryScope: options.memoryScope ?? existingData?.memoryScope,
    project: projectFromOptions ?? existingData?.project,
  }

  return parentContext.setValue(LATITUDE_CONTEXT_KEY, mergedData)
}

function startCaptureScope(name: string, options: ContextOptions = {}): CaptureScope {
  const currentContext = context.active()
  const shouldReuseTrace = shouldReuseActiveLatitudeTrace(currentContext)
  let newContext = buildCaptureContext(name, currentContext, options)
  const existingSpan = trace.getSpan(currentContext)
  const span =
    existingSpan && shouldReuseTrace
      ? undefined
      : trace
          .getTracer(CAPTURE_TRACER_NAME)
          .startSpan(name, { attributes: { "latitude.capture.root": true } }, newContext)

  if (span) {
    newContext = trace.setSpan(newContext, span)
  }

  const scope: CaptureScopeInternal = {
    [CAPTURE_SCOPE_BRAND]: true,
    previousContext: currentContext,
    span,
    ended: false,
    end(error?: unknown) {
      endCaptureScope(scope, error)
    },
  }

  attachContext(newContext.setValue(LATITUDE_CAPTURE_SCOPE_KEY, scope))

  return scope
}

function endCaptureScope(scopeOrError?: CaptureScope | unknown, error?: unknown): void {
  const activeScope = getCaptureScope(context.active())
  const scope = isCaptureScope(scopeOrError) ? scopeOrError : activeScope
  const capturedError = isCaptureScope(scopeOrError) ? error : scopeOrError

  if (!scope || scope.ended) {
    return
  }

  if (capturedError !== undefined && scope.span) {
    recordSpanExceptionForDatadog(scope.span, capturedError)
  }

  scope.span?.end()
  scope.ended = true
  attachContext(scope.previousContext)
}

function captureWrapper<T>(name: string, fn: () => T | Promise<T>, options: ContextOptions = {}): T | Promise<T> {
  const currentContext = context.active()
  const newContext = buildCaptureContext(name, currentContext, options)
  const existingSpan = trace.getSpan(currentContext)
  const shouldReuseTrace = shouldReuseActiveLatitudeTrace(currentContext)

  if (existingSpan && shouldReuseTrace) {
    return context.with(newContext, fn)
  }

  const tracer = trace.getTracer(CAPTURE_TRACER_NAME)

  return tracer.startActiveSpan(name, { attributes: { "latitude.capture.root": true } }, newContext, (span) => {
    let result: T | Promise<T>
    try {
      result = fn()
    } catch (error) {
      recordSpanExceptionForDatadog(span, error)
      span.end()
      throw error
    }

    if (result instanceof Promise) {
      return result
        .catch((error) => {
          recordSpanExceptionForDatadog(span, error)
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

export const capture: CaptureFunction = Object.assign(captureWrapper, {
  start: startCaptureScope,
  end: endCaptureScope,
})
