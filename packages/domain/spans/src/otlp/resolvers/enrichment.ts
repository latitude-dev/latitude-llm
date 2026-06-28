import type { OtlpKeyValue } from "../types.ts"
import { type Candidate, fromString, fromStringArray } from "./utils.ts"

// Parse a JSON-encoded string array (e.g. '["a","b"]' from baggage propagation)
function fromJsonStringArray(key: string): Candidate<string[]> {
  return {
    resolve: (attrs) => {
      const kv = attrs.find((a) => a.key === key)
      const v = kv?.value?.stringValue
      if (!v) return undefined
      try {
        const parsed: unknown = JSON.parse(v)
        if (Array.isArray(parsed) && parsed.every((i) => typeof i === "string")) {
          return parsed.length > 0 ? (parsed as string[]) : undefined
        }
      } catch {
        // not valid JSON
      }
      return undefined
    },
  }
}

export const tagsCandidates: Candidate<string[]>[] = [
  fromJsonStringArray("latitude.tags"), // Latitude (JSON string via baggage)
  fromStringArray("langfuse.trace.tags"), // Langfuse
  fromStringArray("braintrust.tags"), // Braintrust
  fromStringArray("tag.tags"), // OpenInference / Arize Phoenix
  // LangSmith (comma-separated string, not an array)
  fromString<string[]>("langsmith.span.tags", (v) =>
    v
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  ),
]

function toStringValue(val: unknown): string | undefined {
  if (typeof val === "string") return val
  if (typeof val === "number" || typeof val === "boolean") return String(val)
  if (val === null || val === undefined) return undefined
  return JSON.stringify(val)
}

function otlpValueToPlain(value: OtlpKeyValue["value"]): unknown {
  if (!value) return undefined
  if (value.stringValue !== undefined) return value.stringValue
  if (value.boolValue !== undefined) return value.boolValue
  if (value.intValue !== undefined) return Number(value.intValue)
  if (value.doubleValue !== undefined) return value.doubleValue
  if (value.arrayValue?.values) return value.arrayValue.values.map(otlpValueToPlain)
  if (value.kvlistValue?.values) {
    const result: Record<string, unknown> = {}
    for (const entry of value.kvlistValue.values) {
      result[entry.key] = otlpValueToPlain(entry.value)
    }
    return result
  }
  return undefined
}

function fromJsonString(key: string): Candidate<Record<string, string>> {
  return {
    resolve: (attrs) => {
      const kv = attrs.find((a) => a.key === key)
      const v = kv?.value?.stringValue
      if (!v) return undefined
      try {
        const parsed: unknown = JSON.parse(v)
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          const result: Record<string, string> = {}
          for (const [k, val] of Object.entries(parsed)) {
            const converted = toStringValue(val)
            if (converted !== undefined) result[k] = converted
          }
          return Object.keys(result).length > 0 ? result : undefined
        }
      } catch {
        // not valid JSON
      }
      return undefined
    },
  }
}

function fromDotFlattened(prefix: string): Candidate<Record<string, string>> {
  return {
    resolve: (attrs) => {
      const result: Record<string, string> = {}
      const prefixDot = `${prefix}.`
      for (const attr of attrs) {
        if (!attr.key.startsWith(prefixDot)) continue
        const subKey = attr.key.slice(prefixDot.length)
        const value = toStringValue(otlpValueToPlain(attr.value))
        if (subKey && value !== undefined) result[subKey] = value
      }
      return Object.keys(result).length > 0 ? result : undefined
    },
  }
}

export function resolveMetadata(attrs: readonly OtlpKeyValue[]): Record<string, string> {
  const candidates: Candidate<Record<string, string>>[] = [
    fromJsonString("latitude.metadata"), // Latitude (JSON string)
    fromJsonString("braintrust.metadata"), // Braintrust (JSON string)
    fromJsonString("metadata"), // OpenInference / HoneyHive (JSON string)
    fromDotFlattened("langfuse.trace.metadata"), // Langfuse (trace-level, dot-flattened)
    fromDotFlattened("langfuse.observation.metadata"), // Langfuse (span-level, dot-flattened)
    fromDotFlattened("braintrust.metadata"), // Braintrust (dot-flattened fallback)
    fromDotFlattened("traceloop.association.properties"), // Traceloop / OpenLLMetry (dot-flattened)
    fromDotFlattened("trace.metadata"), // OpenRouter Broadcast OTLP custom trace metadata
    fromDotFlattened("langsmith.metadata"), // LangSmith (dot-flattened)
    fromDotFlattened("meta.metadata"), // Datadog (dot-flattened)
  ]

  const merged: Record<string, string> = {}
  for (const c of candidates) {
    const v = c.resolve(attrs)
    if (v) Object.assign(merged, v)
  }
  return merged
}
