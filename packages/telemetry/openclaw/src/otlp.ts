import { arch, hostname, platform, release } from "node:os"
import { type RedactConfig, redactAttributes } from "./redaction.ts"
import type { AttrValue, BuildResult, SpanRecord } from "./span-builder.ts"
import type { OtlpExportRequest, OtlpKeyValue, OtlpResourceSpans, OtlpSpan } from "./types.ts"

const SCOPE_NAME = "@latitude-data/openclaw-telemetry"

/**
 * Build-time-baked package version: `__SCOPE_VERSION__` is replaced by tsdown's
 * `define` with `package.json`'s version, so the bundle never reads a file at
 * runtime. The `typeof` guard covers vitest, which runs the source directly.
 */
declare const __SCOPE_VERSION__: string
export const SCOPE_VERSION = typeof __SCOPE_VERSION__ === "string" ? __SCOPE_VERSION__ : "0.0.0-dev"

const GATED_SUFFIX = ":gated"
// Keys Latitude reads as a native OTLP string array rather than a JSON string.
const ARRAY_VALUE_KEYS: ReadonlySet<string> = new Set(["gen_ai.response.finish_reasons"])
const TRUNCATION_MARKER = "\n…[truncated by latitude-openclaw]…\n"

interface BuildOptions {
  /**
   * When false, attributes whose key ends in `:gated` are dropped before
   * export: messages, system instructions, tool arguments and results, memory
   * bodies and queries, error messages. Timing, usage, ids and names always ship.
   */
  allowConversationAccess: boolean
  redact?: RedactConfig | undefined
  serviceName?: string
  /** Per-attribute budget in UTF-16 units; larger values are truncated from the middle. */
  maxContentChars?: number
}

export function buildOtlpRequest(results: readonly BuildResult[], options: BuildOptions): OtlpExportRequest {
  const spans = results.flatMap((result) => result.spans.map((span) => toOtlpSpan(span, options)))
  const rs: OtlpResourceSpans = {
    resource: { attributes: resourceAttrs(options.serviceName ?? "openclaw") },
    scopeSpans: [{ scope: { name: SCOPE_NAME, version: SCOPE_VERSION }, spans }],
  }
  return { resourceSpans: [rs] }
}

function toOtlpSpan(span: SpanRecord, options: BuildOptions): OtlpSpan {
  const attrs: OtlpKeyValue[] = []
  for (const [rawKey, value] of Object.entries(span.attrs)) {
    if (value === undefined || value === null) continue
    const isGated = rawKey.endsWith(GATED_SUFFIX)
    if (isGated && !options.allowConversationAccess) continue
    const key = isGated ? rawKey.slice(0, -GATED_SUFFIX.length) : rawKey
    const kv = encodeAttr(key, value, options.maxContentChars)
    if (kv !== undefined) attrs.push(kv)
  }
  attrs.push(bool("latitude.captured.content", options.allowConversationAccess))

  return {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    name: span.name,
    kind: span.kind,
    startTimeUnixNano: msToNs(span.startMs),
    endTimeUnixNano: msToNs(span.endMs ?? span.startMs),
    attributes: redactAttributes(attrs, options.redact),
    status: { code: span.outcome === "error" ? 2 : 1 },
  }
}

function encodeAttr(key: string, value: AttrValue, maxChars: number | undefined): OtlpKeyValue | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === "string") return str(key, budget(value, maxChars))
  if (typeof value === "boolean") return bool(key, value)
  if (typeof value === "number") {
    return Number.isInteger(value) ? int(key, value) : { key, value: { doubleValue: value } }
  }
  if (ARRAY_VALUE_KEYS.has(key) && Array.isArray(value)) {
    return { key, value: { arrayValue: { values: value.map((v) => ({ stringValue: String(v) })) } } }
  }
  // Arrays and objects ship as JSON strings; Latitude parses the gen_ai.* ones.
  return str(key, budget(safeJson(value), maxChars))
}

function budget(value: string, maxChars: number | undefined): string {
  if (!maxChars || value.length <= maxChars) return value
  const keep = Math.max(0, Math.floor((maxChars - TRUNCATION_MARKER.length) / 2))
  return `${value.slice(0, keep)}${TRUNCATION_MARKER}${value.slice(value.length - keep)}`
}

function resourceAttrs(serviceName: string): OtlpKeyValue[] {
  return [
    str("service.name", serviceName),
    str("service.version", SCOPE_VERSION),
    str("telemetry.sdk.name", SCOPE_NAME),
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
