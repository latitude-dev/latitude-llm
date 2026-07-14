import { describe, expect, it } from "vitest"
import { coerceOtlpKeyValues, stringAttr } from "./attributes.ts"
import type { OtlpKeyValue } from "./types.ts"

const kv = (key: string, value: string): OtlpKeyValue => ({ key, value: { stringValue: value } })

describe("coerceOtlpKeyValues", () => {
  it("returns an empty array for nullish input", () => {
    expect(coerceOtlpKeyValues(undefined)).toEqual([])
    expect(coerceOtlpKeyValues(null)).toEqual([])
  })

  it("passes through a valid KeyValue array", () => {
    const attrs = [kv("latitude.project", "primary"), kv("session.id", "sess-1")]
    expect(coerceOtlpKeyValues(attrs)).toEqual(attrs)
  })

  it("wraps a single KeyValue object", () => {
    const single = kv("latitude.project", "primary")
    expect(coerceOtlpKeyValues(single)).toEqual([single])
  })

  it("reads a plain map of AnyValue entries", () => {
    const attrs = {
      "latitude.project": { stringValue: "primary" },
      "session.id": { stringValue: "sess-1" },
    }
    expect(coerceOtlpKeyValues(attrs)).toEqual([kv("latitude.project", "primary"), kv("session.id", "sess-1")])
  })

  it("reads a plain map of primitive values", () => {
    const attrs = {
      "latitude.project": "primary",
      enabled: true,
      retries: 3,
    }
    expect(coerceOtlpKeyValues(attrs)).toEqual([
      kv("latitude.project", "primary"),
      { key: "enabled", value: { boolValue: true } },
      { key: "retries", value: { intValue: "3" } },
    ])
  })

  it("reads a KeyValueList wrapper", () => {
    const attrs = { values: [kv("latitude.project", "primary")] }
    expect(coerceOtlpKeyValues(attrs)).toEqual([kv("latitude.project", "primary")])
  })
})

describe("stringAttr", () => {
  it("does not throw when attributes are a single KeyValue object", () => {
    expect(stringAttr(kv("latitude.project", "primary"), "latitude.project")).toBe("primary")
  })
})
