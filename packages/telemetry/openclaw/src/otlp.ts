import { arch, hostname, platform, release } from "node:os"
import type { AttrValue, BuildResult, SpanRecord } from "./span-builder.ts"
import type { OtlpExportRequest, OtlpKeyValue, OtlpResourceSpans, OtlpSpan } from "./types.ts"

const SCOPE_NAME = "@latitude-data/openclaw-telemetry"

/**
 * Build-time-baked package version.
 *
 * `__SCOPE_VERSION__` is replaced at bundle time by tsdown's `define` (see
 * `tsdown.config.ts`) with a string literal of `package.json`'s `version`,
 * so the released bundle ships a constant — no runtime file read.
 *
 * Earlier versions read `package.json` at runtime via `readFileSync` to keep
 * one source of truth for the version. That tripped OpenClaw 2026.4.26's
 * `plugins.code_safety` scanner with a "potential-exfiltration: File read
 * combined with network send" warning (we have `fetch(` in `client.ts`).
 * Build-time bake preserves the single source of truth (the build reads
 * `package.json` and inlines the value) while keeping the runtime free of
 * `node:fs`.
 *
 * The `typeof` check is a runtime fallback for environments where the
 * `define` substitution didn't run — chiefly vitest, which executes the
 * source files directly without going through the build. `typeof` of an
 * undeclared identifier returns `"undefined"` rather than throwing, which
 * keeps tests working.
 */
declare const __SCOPE_VERSION__: string
const SCOPE_VERSION = typeof __SCOPE_VERSION__ === "string" ? __SCOPE_VERSION__ : "0.0.0-dev"

interface BuildOptions {
  /**
   * When false, attributes whose key ends in `:gated` are scrubbed from
   * spans before export — that's `gen_ai.input.messages`,
   * `gen_ai.output.messages`, `gen_ai.system_instructions`, `user_prompt`,
   * `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result`,
   * `before_compaction.messages`, `before_agent_start.{prompt,messages}`,
   * `agent_end.messages`, and `openclaw.error.message` (the last because
   * error strings can leak prompt/response content). Timing, token usage,
   * model name, ids, agent name, durations, byte counts, and the
   * `latitude.captured.content` boolean are always emitted.
   */
  allowConversationAccess: boolean
}

/** Build an OTLP export request for a single completed agent run. */
export function buildOtlpRequest(result: BuildResult, options: BuildOptions): OtlpExportRequest {
  const spans = result.spans.map((span) => toOtlpSpan(span, options))
  const rs: OtlpResourceSpans = {
    resource: { attributes: resourceAttrs() },
    scopeSpans: [{ scope: { name: SCOPE_NAME, version: SCOPE_VERSION }, spans }],
  }
  return { resourceSpans: [rs] }
}

// ─── SpanRecord → OtlpSpan ─────────────────────────────────────────────────

function toOtlpSpan(span: SpanRecord, options: BuildOptions): OtlpSpan {
  const startNs = msToNs(span.startMs)
  const endNs = msToNs(span.endMs ?? span.startMs)

  const attrs: OtlpKeyValue[] = []
  for (const [rawKey, value] of Object.entries(span.attrs)) {
    if (value === undefined || value === null) continue
    const isGated = rawKey.endsWith(":gated")
    if (isGated && !options.allowConversationAccess) continue
    const key = isGated ? rawKey.slice(0, -":gated".length) : rawKey
    const kv = encodeAttr(key, value)
    if (kv !== undefined) attrs.push(kv)
  }

  // Always emit the gate state so operators can see it in the UI without
  // needing to grep the original config.
  attrs.push(bool("latitude.captured.content", options.allowConversationAccess))
  // Mirror duration into the canonical name as well, when present.
  if (span.endMs !== undefined) {
    attrs.push(int("openclaw.duration_ms.computed", Math.max(0, span.endMs - span.startMs)))
  }

  const statusCode = span.outcome === "error" ? 2 : 1
  return {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    name: span.name,
    // OTel SpanKind: 1 = INTERNAL. None of agent/model_call/tool_call/
    // compaction/subagent map cleanly to CLIENT/SERVER/PRODUCER/CONSUMER —
    // OpenClaw is the source-of-truth runtime for all of them.
    kind: 1,
    startTimeUnixNano: startNs,
    endTimeUnixNano: endNs,
    attributes: attrs,
    status: { code: statusCode },
  }
}

function encodeAttr(key: string, value: AttrValue): OtlpKeyValue | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === "string") return str(key, value)
  if (typeof value === "boolean") return bool(key, value)
  if (typeof value === "number") {
    return Number.isInteger(value) ? int(key, value) : { key, value: { doubleValue: value } }
  }
  // Arrays + objects → JSON string. The Latitude UI parses the gen_ai.* keys
  // as JSON; anything else lands as opaque string and is queryable as a
  // contains-substring filter.
  return str(key, safeJson(value))
}

// ─── Resource + helper attribute encoders ──────────────────────────────────

function resourceAttrs(): OtlpKeyValue[] {
  return [
    str("service.name", "openclaw"),
    str("service.version", SCOPE_VERSION),
    str("host.name", hostname()),
    str("host.arch", arch()),
    str("os.type", platform()),
    str("os.version", release()),
  ]
}

function str(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } }
}

function int(key: string, value: number): OtlpKeyValue {
  return { key, value: { intValue: String(Math.trunc(value)) } }
}

function bool(key: string, value: boolean): OtlpKeyValue {
  return { key, value: { boolValue: value } }
}

function msToNs(ms: number): string {
  return (BigInt(Math.trunc(ms)) * 1_000_000n).toString()
}

function safeJson(value: unknown): string {
  try {
    if (typeof value === "string") return value
    return JSON.stringify(value)
  } catch {
    return ""
  }
}
