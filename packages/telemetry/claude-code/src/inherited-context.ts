// W3C Trace Context import: when a parent harness (Hermes, another agent runner, a
// CI job) launches Claude Code, it exports its active span through the standard
// `traceparent` environment variable. Joining that trace is what turns two
// independently-emitted span sets into one causal tree.
//
// The contract is deliberately harness-agnostic: a valid traceparent means "you are
// a child of this span", its absence means "you are a root". Nothing here is
// specific to the harness that happens to be launching us.

import type { InheritedSpanContext } from "./types.ts"

export interface InheritedContext extends InheritedSpanContext {
  sessionId: string | undefined
}

// One interactive Claude Code session must not grow a trace it does not own without
// bound: trace-end reloads the whole trace on every late span, so an all-day session
// would re-read an ever-growing trace. Past this many spans the session stops joining
// and reverts to its own per-turn traces, keeping the shared session id.
export const MAX_INHERITED_SPANS = 2_000

const TRACE_ID_RE = /^[0-9a-f]{32}$/
const SPAN_ID_RE = /^[0-9a-f]{16}$/
const VERSION_RE = /^[0-9a-f]{2}$/
const FLAGS_RE = /^[0-9a-f]{2}$/

function inheritEnabled(env: NodeJS.ProcessEnv): boolean {
  return (env.LATITUDE_CLAUDE_CODE_INHERIT_CONTEXT ?? "1") !== "0"
}

// Read on its own because session grouping does not depend on trace joining: a
// session that never joins, or stops joining at the cap, still reports the shared id.
export function inheritedSessionId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (!inheritEnabled(env)) return undefined
  return env.LATITUDE_SESSION_ID?.trim() || undefined
}

export function parseInheritedContext(env: NodeJS.ProcessEnv = process.env): InheritedContext | undefined {
  if (!inheritEnabled(env)) return undefined
  // The Latitude-scoped name wins so a repo that already sets `TRACEPARENT` for an
  // unrelated pipeline can opt this harness in (or out) without disturbing it.
  const raw = env.LATITUDE_TRACEPARENT ?? env.TRACEPARENT ?? env.traceparent
  const parsed = parseTraceparent(raw)
  if (!parsed) return undefined
  return { ...parsed, sessionId: inheritedSessionId(env) }
}

export function parseTraceparent(raw: string | undefined): { traceId: string; parentSpanId: string } | undefined {
  const value = raw?.trim().toLowerCase()
  if (!value) return undefined
  // `$` matches before a trailing newline in JS, so a field ending in one would pass
  // the per-field patterns below. No traceparent field may contain whitespace.
  if (/\s/.test(value)) return undefined

  const parts = value.split("-")
  if (parts.length < 4) return undefined
  const [version, traceId, parentSpanId, flags] = parts as [string, string, string, string]

  if (!VERSION_RE.test(version) || version === "ff") return undefined
  // Version 00 is exactly four fields; later versions may append more, which this
  // version must ignore rather than reject (W3C forward-compatibility rule).
  if (version === "00" && parts.length !== 4) return undefined
  if (!TRACE_ID_RE.test(traceId) || !SPAN_ID_RE.test(parentSpanId)) return undefined
  if (!FLAGS_RE.test(flags)) return undefined
  if (traceId === "0".repeat(32) || parentSpanId === "0".repeat(16)) return undefined

  return { traceId, parentSpanId }
}

export function formatTraceparent(traceId: string, spanId: string, sampled = true): string {
  return `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`
}
