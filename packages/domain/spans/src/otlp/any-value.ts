import type { OtlpAnyValue } from "./types.ts"

/**
 * Flatten an OTLP `AnyValue` into plain JS, recursing through `arrayValue`/`kvlistValue`.
 * Shared by the transform (attr_string capture), the metadata enricher, and the GenAI content parser.
 */
export function anyValueToPlain(value: OtlpAnyValue | undefined): unknown {
  if (!value) return undefined
  if (value.stringValue !== undefined) return value.stringValue
  if (value.boolValue !== undefined) return value.boolValue
  if (value.intValue !== undefined) return Number(value.intValue)
  if (value.doubleValue !== undefined) return value.doubleValue
  if (value.arrayValue?.values) return value.arrayValue.values.map(anyValueToPlain)
  if (value.kvlistValue?.values) {
    const result: Record<string, unknown> = {}
    for (const entry of value.kvlistValue.values) {
      const plain = anyValueToPlain(entry.value)
      // Plain assignment of a `__proto__` key hijacks the object's prototype and drops the value; define it as an own prop.
      if (entry.key === "__proto__") {
        Object.defineProperty(result, entry.key, { value: plain, enumerable: true, writable: true, configurable: true })
      } else {
        result[entry.key] = plain
      }
    }
    return result
  }
  return undefined
}
