import { describe, expect, it } from "vitest"
import { stripLoneSurrogates } from "./strip-lone-surrogates.ts"

describe("stripLoneSurrogates", () => {
  it("leaves valid text untouched", () => {
    expect(stripLoneSurrogates("hello 😀 world")).toBe("hello 😀 world")
  })

  it("replaces a lone high surrogate", () => {
    expect(stripLoneSurrogates("before \uD83D after")).toBe("before � after")
  })

  it("replaces a lone low surrogate", () => {
    expect(stripLoneSurrogates("before \uDE00 after")).toBe("before � after")
  })

  it("does not touch a valid surrogate pair", () => {
    expect(stripLoneSurrogates("😀")).toBe("😀")
  })

  it("replaces both halves of a pair split apart by unrelated text", () => {
    expect(stripLoneSurrogates("\uD83D x \uDE00")).toBe("� x �")
  })
})
