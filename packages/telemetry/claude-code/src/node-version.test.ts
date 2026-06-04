import { describe, expect, it } from "vitest"
import { buildVersionError } from "./node-version.ts"

describe("buildVersionError", () => {
  it("returns null for current-era Node versions", () => {
    expect(buildVersionError("22.0.0")).toBeNull()
    expect(buildVersionError("23.5.0")).toBeNull()
    expect(buildVersionError("21.0.0")).toBeNull()
  })

  it("returns null for the minimum supported version (20.12.0)", () => {
    expect(buildVersionError("20.12.0")).toBeNull()
  })

  it("returns null for patch releases above the threshold", () => {
    expect(buildVersionError("20.12.1")).toBeNull()
    expect(buildVersionError("20.19.0")).toBeNull()
  })

  it("returns an error for Node 18", () => {
    const msg = buildVersionError("18.19.1")
    expect(msg).toContain("18.19.1")
    expect(msg).toContain("too old")
    expect(msg).toContain(">=20.12")
  })

  it("returns an error for Node 20.11 (one minor below the threshold)", () => {
    const msg = buildVersionError("20.11.9")
    expect(msg).toContain("too old")
  })

  it("returns an error for Node 20.0", () => {
    expect(buildVersionError("20.0.0")).toContain("too old")
  })

  it("error message includes the nvm PATH fix hint", () => {
    const msg = buildVersionError("18.0.0")
    expect(msg).toContain("PATH")
    expect(msg).toContain("nvm")
  })
})
