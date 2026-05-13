import { describe, expect, it } from "vitest"
import { pickReadAnchor, pickWrittenAnchor } from "./anchors.ts"

describe("pickWrittenAnchor", () => {
  it("picks something for zero", () => {
    expect(pickWrittenAnchor(0)).toBeTruthy()
  })

  it("scales up — small counts get a small anchor", () => {
    expect(pickWrittenAnchor(150).toLowerCase()).toMatch(/haiku|ted/)
  })

  it("hits the Apollo anchor in the right range", () => {
    expect(pickWrittenAnchor(20_000).toLowerCase()).toContain("apollo")
  })

  it("uses the full-Apollo anchor at 145k+", () => {
    expect(pickWrittenAnchor(145_000).toLowerCase()).toContain("apollo")
  })

  it("hits Doom around 500k", () => {
    expect(pickWrittenAnchor(700_000).toLowerCase()).toContain("doom")
  })

  it("clamps to the Linux kernel anchor at very large counts", () => {
    const out = pickWrittenAnchor(50_000_000).toLowerCase()
    expect(out).toContain("linux")
  })

  it("always returns a non-empty string", () => {
    for (const n of [0, 1, 100, 10_000, 1_000_000, 100_000_000]) {
      expect(pickWrittenAnchor(n).length).toBeGreaterThan(0)
    }
  })
})

describe("pickReadAnchor", () => {
  it("scales up", () => {
    expect(pickReadAnchor(500).toLowerCase()).toMatch(/email|story/)
    expect(pickReadAnchor(100_000).toLowerCase()).toMatch(/novel/)
  })

  it("hits the Library of Congress at very large counts", () => {
    expect(pickReadAnchor(50_000_000).toLowerCase()).toContain("library of congress")
  })

  it("always returns a non-empty string", () => {
    for (const n of [0, 1, 100, 10_000, 1_000_000, 100_000_000]) {
      expect(pickReadAnchor(n).length).toBeGreaterThan(0)
    }
  })
})
