import { describe, expect, it } from "vitest"
import { pickReadAnchor, pickWrittenAnchor } from "./anchors.ts"

const renderAnchor = (a: { prefix: string; emphasis: string }) => `${a.prefix} ${a.emphasis}`.toLowerCase()

describe("pickWrittenAnchor", () => {
  it("picks something for zero", () => {
    const a = pickWrittenAnchor(0)
    expect(a.emphasis.length).toBeGreaterThan(0)
  })

  it("scales up — small counts get a small anchor", () => {
    expect(renderAnchor(pickWrittenAnchor(150))).toMatch(/haiku|ted/)
  })

  it("hits the Apollo anchor in the right range", () => {
    expect(renderAnchor(pickWrittenAnchor(20_000))).toContain("apollo")
  })

  it("uses the full-Apollo anchor at 145k+", () => {
    expect(renderAnchor(pickWrittenAnchor(145_000))).toContain("apollo")
  })

  it("hits Doom around 500k", () => {
    expect(renderAnchor(pickWrittenAnchor(700_000))).toContain("doom")
  })

  it("clamps to the Linux kernel anchor at very large counts", () => {
    expect(renderAnchor(pickWrittenAnchor(50_000_000))).toContain("linux")
  })

  it("always returns a non-empty emphasis", () => {
    for (const n of [0, 1, 100, 10_000, 1_000_000, 100_000_000]) {
      expect(pickWrittenAnchor(n).emphasis.length).toBeGreaterThan(0)
    }
  })

  it("emphasis never carries the percentage prefix (so the email can style it separately)", () => {
    const a = pickWrittenAnchor(20_000)
    expect(a.prefix).toMatch(/%/)
    expect(a.emphasis).not.toMatch(/%/)
  })
})

describe("pickReadAnchor", () => {
  it("scales up", () => {
    expect(renderAnchor(pickReadAnchor(500))).toMatch(/email|story/)
    expect(renderAnchor(pickReadAnchor(100_000))).toMatch(/novel/)
  })

  it("hits the Library of Congress at very large counts", () => {
    expect(renderAnchor(pickReadAnchor(50_000_000))).toContain("library of congress")
  })

  it("always returns a non-empty emphasis", () => {
    for (const n of [0, 1, 100, 10_000, 1_000_000, 100_000_000]) {
      expect(pickReadAnchor(n).emphasis.length).toBeGreaterThan(0)
    }
  })
})
