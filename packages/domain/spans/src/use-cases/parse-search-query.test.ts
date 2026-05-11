import { describe, expect, it } from "vitest"
import { parseSearchQuery } from "./parse-search-query.ts"

describe("parseSearchQuery", () => {
  it("returns empty phrases and empty prompt for empty input", () => {
    expect(parseSearchQuery("")).toEqual({ phrases: [], semanticPrompt: "" })
    expect(parseSearchQuery("   ")).toEqual({ phrases: [], semanticPrompt: "" })
  })

  it("treats unquoted text as a pure semantic prompt", () => {
    expect(parseSearchQuery("pricing complaint")).toEqual({
      phrases: [],
      semanticPrompt: "pricing complaint",
    })
  })

  it("extracts a single phrase and drops the quotes", () => {
    expect(parseSearchQuery('"handOffToHuman"')).toEqual({
      phrases: ["handOffToHuman"],
      semanticPrompt: "",
    })
  })

  it("extracts multiple adjacent phrases", () => {
    expect(parseSearchQuery('"handOffToHuman" "true"')).toEqual({
      phrases: ["handOffToHuman", "true"],
      semanticPrompt: "",
    })
  })

  it("mixes phrase filters with a residual semantic prompt", () => {
    expect(parseSearchQuery('"property search" billing')).toEqual({
      phrases: ["property search"],
      semanticPrompt: "billing",
    })
  })

  it("collapses whitespace around phrases in the residual prompt", () => {
    expect(parseSearchQuery('  customer "property search"   billing  ')).toEqual({
      phrases: ["property search"],
      semanticPrompt: "customer billing",
    })
  })

  it('drops empty phrases (`""`)', () => {
    expect(parseSearchQuery('"" billing')).toEqual({
      phrases: [],
      semanticPrompt: "billing",
    })
    expect(parseSearchQuery('"a" "" "b"')).toEqual({
      phrases: ["a", "b"],
      semanticPrompt: "",
    })
  })

  it("treats an unmatched leading quote as literal semantic text", () => {
    expect(parseSearchQuery('"unmatched')).toEqual({
      phrases: [],
      semanticPrompt: '"unmatched',
    })
  })

  it("treats an unmatched trailing quote as literal semantic text", () => {
    // `"a"` parses cleanly; the dangling `"trailing` is literal.
    expect(parseSearchQuery('"a" "trailing')).toEqual({
      phrases: ["a"],
      semanticPrompt: '"trailing',
    })
  })

  it("preserves order of multiple phrases", () => {
    expect(parseSearchQuery('"alpha" middle "beta" tail "gamma"')).toEqual({
      phrases: ["alpha", "beta", "gamma"],
      semanticPrompt: "middle tail",
    })
  })
})
