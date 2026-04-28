import { describe, expect, it } from "vitest"
import { compareCalver } from "./openclaw-cli.ts"

describe("compareCalver", () => {
  it("returns 0 for equal versions", () => {
    expect(compareCalver("2026.4.25", "2026.4.25")).toBe(0)
  })

  it("orders by year first", () => {
    expect(compareCalver("2025.12.99", "2026.1.0")).toBe(-1)
    expect(compareCalver("2026.1.0", "2025.12.99")).toBe(1)
  })

  it("orders by minor next", () => {
    expect(compareCalver("2026.4.25", "2026.5.0")).toBe(-1)
    expect(compareCalver("2026.5.0", "2026.4.25")).toBe(1)
  })

  it("orders by patch last (numeric, not lexicographic)", () => {
    // Lexicographic would put "21" > "5", numeric correctly puts "21" > "5".
    expect(compareCalver("2026.4.21", "2026.4.5")).toBe(1)
    expect(compareCalver("2026.4.5", "2026.4.21")).toBe(-1)
  })

  it("treats missing components as 0 (defensive against truncated versions)", () => {
    expect(compareCalver("2026.4", "2026.4.0")).toBe(0)
    expect(compareCalver("2026.4.1", "2026.4")).toBe(1)
  })

  it("matches the minimum-version comparison the installer uses", () => {
    // Anchor for the actual production check.
    const MIN = "2026.4.25"
    expect(compareCalver("2026.4.21", MIN)).toBe(-1) // reporter's old version → blocked
    expect(compareCalver("2026.4.25", MIN)).toBe(0) // exact match → allowed
    expect(compareCalver("2026.4.27", MIN)).toBe(1) // newer → allowed
    expect(compareCalver("2027.1.0", MIN)).toBe(1) // future year → allowed
  })

  it("doesn't crash on non-numeric suffixes (defensive)", () => {
    // OpenClaw's CalVer is bare numbers — pre-release tags like `-alpha`
    // shouldn't appear. If one does, we fall back to a per-component
    // string comparison rather than blowing up. We don't claim correct
    // semver-style ordering for these; just no crash.
    expect(() => compareCalver("2026.4.25-rc1", "2026.4.25")).not.toThrow()
  })
})
