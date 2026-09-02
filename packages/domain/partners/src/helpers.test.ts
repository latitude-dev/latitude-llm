import { describe, expect, it } from "vitest"
import { generateOAuthClientString } from "./helpers.ts"

describe("generateOAuthClientString", () => {
  it("produces 32 characters drawn only from [a-zA-Z]", () => {
    for (let i = 0; i < 200; i++) {
      const value = generateOAuthClientString()
      expect(value).toHaveLength(32)
      expect(value).toMatch(/^[a-zA-Z]{32}$/)
    }
  })

  it("does not repeat across calls", () => {
    const values = new Set(Array.from({ length: 200 }, generateOAuthClientString))
    expect(values.size).toBe(200)
  })

  it("covers the whole alphabet rather than the modulo-biased prefix", () => {
    const seen = new Set(Array.from({ length: 500 }, generateOAuthClientString).join(""))
    expect(seen.size).toBe(52)
  })
})
