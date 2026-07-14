import type { OtlpAnyValue, OtlpKeyValue } from "./types.ts"

function isOtlpKeyValue(value: unknown): value is OtlpKeyValue {
  return typeof value === "object" && value !== null && typeof (value as OtlpKeyValue).key === "string"
}

function isAnyValue(value: unknown): value is OtlpAnyValue {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  return (
    "stringValue" in v ||
    "boolValue" in v ||
    "intValue" in v ||
    "doubleValue" in v ||
    "arrayValue" in v ||
    "kvlistValue" in v ||
    "bytesValue" in v
  )
}

/** OTLP exporters sometimes send a single KeyValue or a plain map instead of a KeyValue[]. */
export function coerceOtlpKeyValues(attrs: unknown): readonly OtlpKeyValue[] {
  if (attrs == null) return []
  if (Array.isArray(attrs)) return attrs.filter(isOtlpKeyValue)
  if (isOtlpKeyValue(attrs)) return [attrs]

  if (typeof attrs === "object") {
    const obj = attrs as Record<string, unknown>
    if (Array.isArray(obj.values)) return obj.values.filter(isOtlpKeyValue)

    const entries = Object.entries(obj)
    if (entries.length === 0) return []

    const fromMap: OtlpKeyValue[] = []
    for (const [key, value] of entries) {
      if (typeof value === "string") {
        fromMap.push({ key, value: { stringValue: value } })
      } else if (typeof value === "boolean") {
        fromMap.push({ key, value: { boolValue: value } })
      } else if (typeof value === "number") {
        fromMap.push({
          key,
          value: Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value },
        })
      } else if (isAnyValue(value)) {
        fromMap.push({ key, value })
      }
    }
    if (fromMap.length > 0) return fromMap
  }

  return []
}

function findAttr(attrs: unknown, key: string) {
  return coerceOtlpKeyValues(attrs).find((a) => a.key === key)
}

export function stringAttr(attrs: unknown, key: string): string | undefined {
  const v = findAttr(attrs, key)?.value?.stringValue
  return v || undefined
}

export function intAttr(attrs: unknown, key: string): number | undefined {
  const kv = findAttr(attrs, key)
  if (!kv?.value) return undefined
  if (kv.value.intValue !== undefined) return Number(kv.value.intValue)
  if (kv.value.doubleValue !== undefined) return Math.round(kv.value.doubleValue)
  return undefined
}

export function floatAttr(attrs: unknown, key: string): number | undefined {
  const kv = findAttr(attrs, key)
  if (!kv?.value) return undefined
  if (kv.value.doubleValue !== undefined) return kv.value.doubleValue
  if (kv.value.intValue !== undefined) return Number(kv.value.intValue)
  return undefined
}

export function stringArrayAttr(attrs: unknown, key: string): string[] | undefined {
  const kv = findAttr(attrs, key)
  if (!kv?.value?.arrayValue?.values) return undefined
  const values = kv.value.arrayValue.values
    .filter((v) => v.stringValue !== undefined)
    .map((v) => v.stringValue as string)
  return values.length > 0 ? values : undefined
}
