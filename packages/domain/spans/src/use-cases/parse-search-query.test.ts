import { describe, expect, it } from "vitest"
import { parseSearchQuery } from "./parse-search-query.ts"

describe("parseSearchQuery", () => {
  it("returns empty phrases and empty prompt for empty input", () => {
    expect(parseSearchQuery("")).toEqual({ literalPhrases: [], tokenPhrases: [], semanticPrompt: "" })
    expect(parseSearchQuery("   ")).toEqual({ literalPhrases: [], tokenPhrases: [], semanticPrompt: "" })
  })

  it("treats unquoted text as a pure semantic prompt", () => {
    expect(parseSearchQuery("pricing complaint")).toEqual({
      literalPhrases: [],
      tokenPhrases: [],
      semanticPrompt: "pricing complaint",
    })
  })

  it("extracts a single literal phrase and drops the quotes", () => {
    expect(parseSearchQuery('"handOffToHuman"')).toEqual({
      literalPhrases: ["handOffToHuman"],
      tokenPhrases: [],
      semanticPrompt: "",
    })
  })

  it("extracts a single token phrase and drops the backticks", () => {
    expect(parseSearchQuery("`handOffToHuman: true`")).toEqual({
      literalPhrases: [],
      tokenPhrases: ["handOffToHuman: true"],
      semanticPrompt: "",
    })
  })

  it("extracts multiple adjacent phrase filters", () => {
    expect(parseSearchQuery('"handOffToHuman" `true`')).toEqual({
      literalPhrases: ["handOffToHuman"],
      tokenPhrases: ["true"],
      semanticPrompt: "",
    })
  })

  it("mixes phrase filters with a residual semantic prompt", () => {
    expect(parseSearchQuery('"property search" `billing issue` billing')).toEqual({
      literalPhrases: ["property search"],
      tokenPhrases: ["billing issue"],
      semanticPrompt: "billing",
    })
  })

  it("collapses whitespace around phrases in the residual prompt", () => {
    expect(parseSearchQuery('  customer "property search"   `billing issue`  billing  ')).toEqual({
      literalPhrases: ["property search"],
      tokenPhrases: ["billing issue"],
      semanticPrompt: "customer billing",
    })
  })

  it('drops empty phrases (`""` and ``)', () => {
    expect(parseSearchQuery('"" `` billing')).toEqual({
      literalPhrases: [],
      tokenPhrases: [],
      semanticPrompt: "billing",
    })
    expect(parseSearchQuery('"a" "" `b` ``')).toEqual({
      literalPhrases: ["a"],
      tokenPhrases: ["b"],
      semanticPrompt: "",
    })
  })

  it("treats an unmatched leading delimiter as literal semantic text", () => {
    expect(parseSearchQuery('"unmatched')).toEqual({
      literalPhrases: [],
      tokenPhrases: [],
      semanticPrompt: '"unmatched',
    })
    expect(parseSearchQuery("`unmatched")).toEqual({
      literalPhrases: [],
      tokenPhrases: [],
      semanticPrompt: "`unmatched",
    })
  })

  it("treats an unmatched trailing delimiter as literal semantic text", () => {
    // `"a"` parses cleanly; the dangling `"trailing` is literal.
    expect(parseSearchQuery('"a" "trailing')).toEqual({
      literalPhrases: ["a"],
      tokenPhrases: [],
      semanticPrompt: '"trailing',
    })
    expect(parseSearchQuery("`a` `trailing")).toEqual({
      literalPhrases: [],
      tokenPhrases: ["a"],
      semanticPrompt: "`trailing",
    })
  })

  it("preserves order of multiple phrases by type", () => {
    expect(parseSearchQuery('"alpha" middle `beta` tail "gamma"')).toEqual({
      literalPhrases: ["alpha", "gamma"],
      tokenPhrases: ["beta"],
      semanticPrompt: "middle tail",
    })
  })
})
