/**
 * W3C Trace Context across a call boundary that carries no ambient context.
 *
 * Two agents in separate Durable Objects share no memory and no OpenTelemetry context: the callee
 * roots its own trace unless the caller hands the active span over as data. `injectTraceContext()`
 * serializes it, `extractTraceContext()` / `withTraceContext()` reinstall it on the other side.
 *
 * The contract is the one the Hermes and Claude Code emitters already use across processes, only
 * with an argument instead of the environment: a valid traceparent means "you are a child of this
 * span", its absence means "you are a root". A malformed one makes the callee a root, never a
 * failure.
 *
 * Carrier keys are HTTP header names, so the same object works as an RPC argument and as `fetch`
 * headers.
 */

import {
  createTraceState,
  isSpanContextValid,
  type Context as OtelContext,
  context as otelContext,
  TraceFlags,
  type Tracer,
  trace,
} from "@opentelemetry/api"
import { getLatitudeContext, setLatitudeContext } from "./context.ts"
import type { Latitude } from "./init.ts"
import { withParentContext } from "./tracer.ts"
import type { ContextOptions } from "./types.ts"

const TRACEPARENT = "traceparent"
const TRACESTATE = "tracestate"
const LATITUDE_CONTEXT = "x-latitude-context"

const TRACE_ID_RE = /^[0-9a-f]{32}$/
const SPAN_ID_RE = /^[0-9a-f]{16}$/
const HEX_BYTE_RE = /^[0-9a-f]{2}$/
const NON_LATIN1_RE = /[\u0080-\uffff]/g

export type TraceContextCarrier = Record<string, string>

type HeadersLike = { get(name: string): string | null }
type RequestLike = { headers: HeadersLike }
type CarrierSource = TraceContextCarrier | HeadersLike | RequestLike | null | undefined

export type RemoteTraceParent = {
  readonly traceId: string
  readonly spanId: string
  readonly sampled: boolean
}

export type RemoteTraceContext = {
  /** The span the caller handed over, or `undefined` when this side is a root. */
  readonly parent: RemoteTraceParent | undefined
  /** Session, user, project, tags and metadata the caller carried over. */
  readonly context: ContextOptions
  /** OpenTelemetry context with the remote parent and the Latitude context installed. */
  readonly otelContext: OtelContext
  /** Runs `work` with that context active, so spans started inside join the caller's trace. */
  readonly run: <T>(work: () => T) => T
  /**
   * A tracer whose spans join the caller's trace and carry its Latitude context, for frameworks
   * that own the model call and take a tracer instead of running inside a callback — Cloudflare
   * Think's `beforeTurn()`, the AI SDK's `experimental_telemetry`.
   */
  readonly getTracer: (latitude: Pick<Latitude, "getTracer">, scope: string, overrides?: ContextOptions) => Tracer
}

function isHeadersLike(value: object): value is HeadersLike {
  return typeof (value as HeadersLike).get === "function"
}

function isRequestLike(value: object): value is RequestLike {
  const headers = (value as RequestLike).headers
  return typeof headers === "object" && headers !== null && isHeadersLike(headers)
}

function toReader(source: CarrierSource): (key: string) => string | undefined {
  if (!source || typeof source !== "object") return () => undefined

  const headers = isHeadersLike(source) ? source : isRequestLike(source) ? source.headers : undefined
  if (headers) return (key) => headers.get(key) ?? undefined

  const lowered = new Map<string, string>()
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") lowered.set(key.toLowerCase(), value)
  }
  return (key) => lowered.get(key)
}

function parseTraceparent(raw: string | undefined): RemoteTraceParent | undefined {
  const value = (raw ?? "").trim().toLowerCase()
  if (!value) return undefined

  const parts = value.split("-")
  if (parts.length < 4) return undefined

  const [version, traceId, spanId, flags] = parts as [string, string, string, string]
  if (!HEX_BYTE_RE.test(version) || version === "ff") return undefined
  // Version 00 is exactly four fields; a later version may append more, which this version must
  // ignore rather than reject (W3C forward-compatibility rule).
  if (version === "00" && parts.length !== 4) return undefined
  if (!TRACE_ID_RE.test(traceId) || !SPAN_ID_RE.test(spanId) || !HEX_BYTE_RE.test(flags)) return undefined
  if (traceId === "0".repeat(32) || spanId === "0".repeat(16)) return undefined

  return { traceId, spanId, sampled: (Number.parseInt(flags, 16) & TraceFlags.SAMPLED) !== 0 }
}

function formatTraceparent(traceId: string, spanId: string, sampled: boolean): string {
  return `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`
}

function toContextOptions(source: {
  name?: string | undefined
  tags?: readonly string[] | undefined
  metadata?: Record<string, unknown> | undefined
  sessionId?: string | undefined
  userId?: string | undefined
  userEmail?: string | undefined
  project?: string | undefined
}): ContextOptions {
  return {
    ...(source.name ? { name: source.name } : {}),
    ...(source.tags && source.tags.length > 0 ? { tags: [...source.tags] } : {}),
    ...(source.metadata && Object.keys(source.metadata).length > 0 ? { metadata: source.metadata } : {}),
    ...(source.sessionId ? { sessionId: source.sessionId } : {}),
    ...(source.userId ? { userId: source.userId } : {}),
    ...(source.userEmail ? { userEmail: source.userEmail } : {}),
    ...(source.project ? { project: source.project } : {}),
  }
}

function mergeContextOptions(base: ContextOptions, overrides: ContextOptions | undefined): ContextOptions {
  if (!overrides) return base

  return toContextOptions({
    name: overrides.name ?? base.name,
    tags: overrides.tags ? [...new Set([...(base.tags ?? []), ...overrides.tags])] : base.tags,
    metadata: overrides.metadata ? { ...base.metadata, ...overrides.metadata } : base.metadata,
    sessionId: overrides.sessionId ?? base.sessionId,
    userId: overrides.userId ?? base.userId,
    userEmail: overrides.userEmail ?? base.userEmail,
    project: overrides.project ?? overrides.projectSlug ?? base.project ?? base.projectSlug,
  })
}

// Header values must be Latin-1, so metadata holding an accent or an emoji would throw when the
// carrier is spread into `fetch` headers. `JSON.parse` reads the escapes back natively.
function toAsciiJson(value: unknown): string {
  return JSON.stringify(value).replace(
    NON_LATIN1_RE,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  )
}

function encodeLatitudeContext(context: ContextOptions): string | undefined {
  // `name` labels one capture root, so carrying it over would relabel every span the callee emits.
  const { name: _name, projectSlug: _projectSlug, ...carried } = context
  if (Object.keys(carried).length === 0) return undefined
  return toAsciiJson(carried)
}

function decodeLatitudeContext(raw: string | undefined): ContextOptions {
  if (!raw) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {}

  const value = parsed as Record<string, unknown>
  const tags = value.tags
  const metadata = value.metadata

  return toContextOptions({
    tags: Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : undefined,
    metadata:
      typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : undefined,
    sessionId: typeof value.sessionId === "string" ? value.sessionId : undefined,
    userId: typeof value.userId === "string" ? value.userId : undefined,
    userEmail: typeof value.userEmail === "string" ? value.userEmail : undefined,
    project: typeof value.project === "string" ? value.project : undefined,
  })
}

/**
 * Serializes the active span and Latitude context into a carrier the callee can join.
 *
 * Anchors on whichever span is active, so calling it from inside a tool's `execute` makes the
 * callee a child of that tool call — the edge that distinguishes "this agent was launched by that
 * specific tool call" from "both ran during the same turn". With no active span it carries context
 * only, and the callee roots its own trace.
 */
export function injectTraceContext(context?: ContextOptions, carrier: TraceContextCarrier = {}): TraceContextCarrier {
  const active = otelContext.active()
  const spanContext = trace.getSpanContext(active)

  if (spanContext && isSpanContextValid(spanContext)) {
    carrier[TRACEPARENT] = formatTraceparent(
      spanContext.traceId,
      spanContext.spanId,
      (spanContext.traceFlags & TraceFlags.SAMPLED) !== 0,
    )
    const traceState = spanContext.traceState?.serialize()
    if (traceState) carrier[TRACESTATE] = traceState
  }

  const ambient = getLatitudeContext(active)
  const encoded = encodeLatitudeContext(mergeContextOptions(ambient ? toContextOptions(ambient) : {}, context))
  if (encoded) carrier[LATITUDE_CONTEXT] = encoded

  return carrier
}

/**
 * Reads a carrier produced by `injectTraceContext()`. Accepts a plain carrier, a `Headers`, or a
 * `Request`. Always returns a usable result: an absent or malformed carrier yields a root.
 */
export function extractTraceContext(source?: CarrierSource): RemoteTraceContext {
  const read = toReader(source)
  const parent = parseTraceparent(read(TRACEPARENT))
  const context = decodeLatitudeContext(read(LATITUDE_CONTEXT))

  let resolved = otelContext.active()

  if (parent) {
    const rawTraceState = read(TRACESTATE)
    const traceState = rawTraceState ? createTraceState(rawTraceState) : undefined
    resolved = trace.setSpanContext(resolved, {
      traceId: parent.traceId,
      spanId: parent.spanId,
      traceFlags: parent.sampled ? TraceFlags.SAMPLED : TraceFlags.NONE,
      isRemote: true,
      ...(traceState ? { traceState } : {}),
    })
  }

  if (Object.keys(context).length > 0) {
    resolved = setLatitudeContext(resolved, context)
  }

  return {
    parent,
    context,
    otelContext: resolved,
    run: (work) => otelContext.with(resolved, work),
    getTracer: (latitude, scope, overrides) => {
      const tracer = latitude.getTracer(scope, mergeContextOptions(context, overrides))
      return parent ? withParentContext(tracer, resolved) : tracer
    },
  }
}

/**
 * Runs `work` inside the caller's trace and Latitude context. The extracted context is handed to
 * `work` so a framework that needs a tracer rather than an ambient context can reach `getTracer()`.
 */
export function withTraceContext<T>(source: CarrierSource, work: (remote: RemoteTraceContext) => T): T {
  const remote = extractTraceContext(source)
  return remote.run(() => work(remote))
}
