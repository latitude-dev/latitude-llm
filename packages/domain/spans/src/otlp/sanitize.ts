import { stripLoneSurrogates } from "../helpers/normalize-literal-phrase.ts"
import { attrArray } from "./attributes.ts"
import type {
  OtlpAnyValue,
  OtlpEvent,
  OtlpExportTraceServiceRequest,
  OtlpKeyValue,
  OtlpLink,
  OtlpResource,
  OtlpResourceSpans,
  OtlpSpan,
  OtlpStatus,
} from "./types.ts"

/**
 * OTLP payloads carry arbitrary LLM/user-generated text, which can contain a lone UTF-16
 * surrogate (e.g. truncated mid-emoji by an upstream exporter). Wherever that string ends up —
 * an attribute value, a span/event name, a status message — ClickHouse's JSON insert rejects the
 * whole batch ("missing second part of surrogate pair"). Sanitizing every consumer that reads an
 * OTLP string (resolvers, content parsers, attrString/resourceString/metadata capture) would be
 * sprawling and easy to miss a call site, so sanitize once here, immediately after decoding,
 * before any of those readers see the request.
 */
export function sanitizeOtlpRequest(request: OtlpExportTraceServiceRequest): OtlpExportTraceServiceRequest {
  return { ...optional("resourceSpans", request.resourceSpans?.map(sanitizeResourceSpans)) }
}

/**
 * Spreads `{ [key]: value }` only when `value` isn't `undefined`. `exactOptionalPropertyTypes`
 * treats an explicit `{ key: undefined }` as a different (invalid) type from omitting an optional
 * key entirely, so a plain ternary/`??` assignment doesn't type-check here.
 */
function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value !== undefined ? { [key]: value } : {}) as { [P in K]?: V }
}

/** OTLP/JSON bodies are cast, not validated, so a "string" field can arrive as any JSON type. */
function sanitizeStr(value: string | undefined): string | undefined {
  return typeof value === "string" ? stripLoneSurrogates(value) : value
}

function sanitizeResourceSpans(resourceSpans: OtlpResourceSpans): OtlpResourceSpans {
  return {
    ...resourceSpans,
    ...optional("resource", resourceSpans.resource && sanitizeResource(resourceSpans.resource)),
    ...optional(
      "scopeSpans",
      resourceSpans.scopeSpans?.map((scopeSpans) => ({
        ...scopeSpans,
        ...optional("spans", scopeSpans.spans?.map(sanitizeSpan)),
      })),
    ),
  }
}

function sanitizeResource(resource: OtlpResource): OtlpResource {
  return { ...resource, attributes: attrArray(resource.attributes).map(sanitizeKeyValue) }
}

function sanitizeSpan(span: OtlpSpan): OtlpSpan {
  return {
    ...span,
    ...optional("name", sanitizeStr(span.name)),
    ...optional("traceState", sanitizeStr(span.traceState)),
    attributes: attrArray(span.attributes).map(sanitizeKeyValue),
    ...optional("events", span.events?.map(sanitizeEvent)),
    ...optional("links", span.links?.map(sanitizeLink)),
    ...optional("status", span.status && sanitizeStatus(span.status)),
  }
}

function sanitizeEvent(event: OtlpEvent): OtlpEvent {
  return {
    ...event,
    ...optional("name", sanitizeStr(event.name)),
    attributes: attrArray(event.attributes).map(sanitizeKeyValue),
  }
}

function sanitizeLink(link: OtlpLink): OtlpLink {
  return {
    ...link,
    ...optional("traceState", sanitizeStr(link.traceState)),
    attributes: attrArray(link.attributes).map(sanitizeKeyValue),
  }
}

function sanitizeStatus(status: OtlpStatus): OtlpStatus {
  return { ...status, ...optional("message", sanitizeStr(status.message)) }
}

function sanitizeKeyValue(kv: OtlpKeyValue): OtlpKeyValue {
  return { ...kv, key: sanitizeStr(kv.key) ?? kv.key, ...optional("value", kv.value && sanitizeAnyValue(kv.value)) }
}

function sanitizeAnyValue(value: OtlpAnyValue): OtlpAnyValue {
  if (value.stringValue !== undefined) return { ...value, ...optional("stringValue", sanitizeStr(value.stringValue)) }
  if (value.arrayValue?.values) {
    return { ...value, arrayValue: { values: value.arrayValue.values.map(sanitizeAnyValue) } }
  }
  if (value.kvlistValue?.values) {
    return { ...value, kvlistValue: { values: value.kvlistValue.values.map(sanitizeKeyValue) } }
  }
  return value
}
