import { type Attributes, type Context, type Span, type SpanOptions, type Tracer, trace } from "@opentelemetry/api"
import { ATTRIBUTES } from "../constants/attributes.ts"
import { SCOPE_LATITUDE } from "../constants/scope.ts"
import type { ContextOptions } from "./types.ts"

/**
 * Returns an OpenTelemetry tracer scoped under Latitude's instrumentation namespace.
 * Spans created with this tracer pass the LatitudeSpanProcessor's smart filter.
 */
export function getLatitudeTracer(scope: string): Tracer {
  return trace.getTracer(`${SCOPE_LATITUDE}.${scope}`)
}

/**
 * Builds the Latitude span attributes for a context. Mirrors the keys the
 * LatitudeSpanProcessor stamps from the active context, so spans carrying these
 * attributes directly are indistinguishable from capture()-scoped spans on ingest.
 */
export function latitudeAttributesFromContext(options: ContextOptions): Attributes {
  const attributes: Attributes = {}
  const project = options.project ?? options.projectSlug

  if (options.tags && options.tags.length > 0) attributes[ATTRIBUTES.tags] = JSON.stringify(options.tags)
  if (options.metadata && Object.keys(options.metadata).length > 0) {
    attributes[ATTRIBUTES.metadata] = JSON.stringify(options.metadata)
  }
  if (options.sessionId) attributes[ATTRIBUTES.sessionId] = options.sessionId
  if (options.userId) attributes[ATTRIBUTES.userId] = options.userId
  if (options.userEmail) attributes[ATTRIBUTES.userEmail] = options.userEmail
  if (options.memoryScope) attributes[ATTRIBUTES.memoryScope] = options.memoryScope
  if (project) attributes[ATTRIBUTES.project] = project

  return attributes
}

/**
 * Wraps a tracer so every span it starts carries the given attributes. Lets a framework
 * that owns the model call (e.g. Cloudflare Think via `experimental_telemetry.tracer`)
 * attach per-turn Latitude context without an ambient context — which matters on runtimes
 * whose AsyncLocalStorage lacks `enterWith()`, such as Cloudflare Workers.
 */
export function withLatitudeAttributes(tracer: Tracer, attributes: Attributes): Tracer {
  if (Object.keys(attributes).length === 0) return tracer

  const stamp = (span: Span): Span => {
    span.setAttributes(attributes)
    return span
  }

  // The inner `startActiveSpan` is generic over the callback type; delegating through a
  // loosely-typed reference lets us splice in the attribute-stamping wrapper without the
  // overload/generic friction.
  const startActive = tracer.startActiveSpan.bind(tracer) as (name: string, ...rest: unknown[]) => unknown

  const wrapper: Tracer = {
    startSpan(name: string, options?: SpanOptions, context?: Context): Span {
      return stamp(tracer.startSpan(name, options, context))
    },
    startActiveSpan<F extends (span: Span) => unknown>(
      name: string,
      arg1: F | SpanOptions,
      arg2?: F | Context,
      arg3?: F,
    ): ReturnType<F> {
      const wrap = (fn: F) => (span: Span) => fn(stamp(span))
      if (typeof arg1 === "function") {
        return startActive(name, wrap(arg1)) as ReturnType<F>
      }
      if (typeof arg2 === "function") {
        return startActive(name, arg1, wrap(arg2)) as ReturnType<F>
      }
      return startActive(name, arg1, arg2 as Context, wrap(arg3 as F)) as ReturnType<F>
    },
  }

  return wrapper
}
