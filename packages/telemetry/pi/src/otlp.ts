import { arch, hostname, platform, release } from "node:os"
import type {
  AttrValue,
  BuildResult,
  OtlpExportRequest,
  OtlpKeyValue,
  OtlpResourceSpans,
  OtlpSpan,
  UserIdentity,
} from "./types.ts"
import { packageVersion } from "./version.ts"

const scopeName = "@latitude-data/pi-telemetry"

interface BuildOptions {
  allowConversationAccess: boolean
  identity: UserIdentity
}

export function buildOtlpRequest(result: BuildResult, options: BuildOptions): OtlpExportRequest {
  const spans = result.spans.map((span) => toOtlpSpan(span, options.allowConversationAccess))
  const rs: OtlpResourceSpans = {
    resource: { attributes: resourceAttrs(options.identity) },
    scopeSpans: [{ scope: { name: scopeName, version: packageVersion }, spans }],
  }
  return { resourceSpans: [rs] }
}

function toOtlpSpan(span: BuildResult["spans"][number], allowConversationAccess: boolean): OtlpSpan {
  const attrs: OtlpKeyValue[] = []
  for (const [rawKey, value] of Object.entries(span.attrs)) {
    if (value === undefined || value === null) continue
    const isGated = rawKey.endsWith(":gated")
    if (isGated && !allowConversationAccess) continue
    const key = isGated ? rawKey.slice(0, -":gated".length) : rawKey
    const encoded = encodeAttr(key, value)
    if (encoded) attrs.push(encoded)
  }
  attrs.push(bool("latitude.captured.content", allowConversationAccess))
  if (span.endMs !== undefined) attrs.push(int("pi.duration_ms.computed", Math.max(0, span.endMs - span.startMs)))

  const statusCode = span.outcome === "error" ? 2 : 1
  return {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    name: span.name,
    kind: 1,
    startTimeUnixNano: msToNs(span.startMs),
    endTimeUnixNano: msToNs(span.endMs ?? span.startMs),
    attributes: attrs,
    status: span.errorMessage ? { code: statusCode, message: span.errorMessage } : { code: statusCode },
  }
}

function encodeAttr(key: string, value: AttrValue): OtlpKeyValue | undefined {
  if (value === undefined) return undefined
  if (typeof value === "string") return str(key, value)
  if (typeof value === "boolean") return bool(key, value)
  if (typeof value === "number")
    return Number.isInteger(value) ? int(key, value) : { key, value: { doubleValue: value } }
  if (key === "gen_ai.response.finish_reasons" && isStringArray(value)) {
    return { key, value: { arrayValue: { values: value.map((item) => ({ stringValue: item })) } } }
  }
  return str(key, safeJson(value))
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function resourceAttrs(identity: UserIdentity): OtlpKeyValue[] {
  return stripUndef([
    str("service.name", "pi-coding-agent"),
    str("service.version", packageVersion),
    str("telemetry.sdk.name", scopeName),
    str("telemetry.sdk.version", packageVersion),
    str("host.name", hostname()),
    str("host.arch", arch()),
    str("os.type", platform()),
    str("os.version", release()),
    str("user.name", identity.userName),
    identity.email ? str("user.email", identity.email) : undefined,
    identity.fullName ? str("user.full_name", identity.fullName) : undefined,
  ])
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

function stripUndef(items: Array<OtlpKeyValue | undefined>): OtlpKeyValue[] {
  return items.filter((item): item is OtlpKeyValue => item !== undefined)
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
