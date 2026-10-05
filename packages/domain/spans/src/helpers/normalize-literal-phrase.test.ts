import { describe, expect, it } from "vitest"
import { deepStripLoneSurrogates, normalizeLiteralPhrase, stripLoneSurrogates } from "./normalize-literal-phrase.ts"

describe("stripLoneSurrogates", () => {
  it("replaces an unpaired high surrogate with the replacement character", () => {
    expect(stripLoneSurrogates("before\uD83Dafter")).toBe("before�after")
  })

  it("replaces an unpaired low surrogate with the replacement character", () => {
    expect(stripLoneSurrogates("before\uDC00after")).toBe("before�after")
  })

  it("leaves a valid surrogate pair (e.g. an emoji) untouched", () => {
    expect(stripLoneSurrogates("hi 😀!")).toBe("hi 😀!")
  })
})

describe("normalizeLiteralPhrase", () => {
  it("trims, collapses whitespace, and strips lone surrogates", () => {
    expect(normalizeLiteralPhrase("  hello   world\uD83D  ")).toBe("hello world�")
  })
})

describe("deepStripLoneSurrogates", () => {
  it("sanitizes strings nested in arrays and objects, including keys", () => {
    const input = { a: ["ok", "bad\uD83D"], "key\uDC00": { nested: "value\uD83D" } }

    expect(deepStripLoneSurrogates(input)).toEqual({
      a: ["ok", "bad�"],
      "key�": { nested: "value�" },
    })
  })

  it("disambiguates rather than overwrites when two distinct keys sanitize to the same string", () => {
    const input = Object.fromEntries([
      ["\uD800", "first"],
      ["�", "second"],
    ]) as Record<string, string>

    const result = deepStripLoneSurrogates(input) as Record<string, string>

    expect(result).toEqual({
      "�": "first",
      "��": "second",
    })
  })

  it("leaves non-string primitives untouched", () => {
    expect(deepStripLoneSurrogates({ n: 1, b: true, u: undefined, nul: null })).toEqual({
      n: 1,
      b: true,
      u: undefined,
      nul: null,
    })
  })
})
