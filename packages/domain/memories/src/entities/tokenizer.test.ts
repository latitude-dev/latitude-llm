import { describe, expect, it } from "vitest"
import { countTokens } from "./tokenizer.ts"

describe("countTokens", () => {
  it("counts tokens for ordinary text", () => {
    expect(countTokens("hello world")).toBeGreaterThan(0)
  })

  it("does not throw when the body contains a literal special-token string", () => {
    expect(() => countTokens("some content <|endoftext|> more content")).not.toThrow()
  })

  it("counts a body containing a special-token string as ordinary text, not zero", () => {
    expect(countTokens("<|endoftext|>")).toBeGreaterThan(0)
  })

  it("does not throw for other reserved special-token strings", () => {
    expect(() => countTokens("<|fim_prefix|><|fim_suffix|><|fim_middle|><|endofprompt|>")).not.toThrow()
  })
})
