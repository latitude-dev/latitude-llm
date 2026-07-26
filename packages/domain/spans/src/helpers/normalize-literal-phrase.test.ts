import { describe, expect, it } from "vitest"
import { deepStripLoneSurrogates } from "./normalize-literal-phrase.ts"

describe("deepStripLoneSurrogates", () => {
  it("strips lone surrogates from string leaves, arrays, and object keys", () => {
    const input = { "\uD800key": ["before\uD83Dafter", { nested: "value\uDC00" }] }

    expect(deepStripLoneSurrogates(input)).toEqual({
      "�key": ["before�after", { nested: "value�" }],
    })
  })

  it("disambiguates rather than overwrites when two distinct keys sanitize to the same string", () => {
    const input = Object.fromEntries([
      ["\uD800", "first"],
      ["�", "second"],
    ]) as Record<string, string>

    const result = deepStripLoneSurrogates(input) as Record<string, string>

    expect(result).toEqual({ "�": "first", "��": "second" })
  })

  it("leaves non-JSON-shaped values (numbers, booleans, null) untouched", () => {
    expect(deepStripLoneSurrogates(42)).toBe(42)
    expect(deepStripLoneSurrogates(true)).toBe(true)
    expect(deepStripLoneSurrogates(null)).toBe(null)
  })
})
