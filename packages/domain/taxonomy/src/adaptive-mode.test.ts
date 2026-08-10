import { describe, expect, it } from "vitest"
import {
  isAdaptiveModeActive,
  parseTaxonomyAdaptiveModeBaseline,
  resolveTaxonomyAdaptiveMode,
} from "./adaptive-mode.ts"

describe("parseTaxonomyAdaptiveModeBaseline", () => {
  it("accepts the two known modes", () => {
    expect(parseTaxonomyAdaptiveModeBaseline("off")).toBe("off")
    expect(parseTaxonomyAdaptiveModeBaseline("enforced")).toBe("enforced")
  })

  it("falls back to off for anything unrecognized", () => {
    expect(parseTaxonomyAdaptiveModeBaseline(undefined)).toBe("off")
    expect(parseTaxonomyAdaptiveModeBaseline("")).toBe("off")
    expect(parseTaxonomyAdaptiveModeBaseline("ENFORCED")).toBe("off")
    expect(parseTaxonomyAdaptiveModeBaseline("shadow")).toBe("off")
  })
})

describe("resolveTaxonomyAdaptiveMode", () => {
  it("off baseline is a hard kill switch that overrides the flag", () => {
    expect(resolveTaxonomyAdaptiveMode({ envBaseline: "off", flagEnabledForOrg: true })).toBe("off")
    expect(resolveTaxonomyAdaptiveMode({ envBaseline: "off", flagEnabledForOrg: false })).toBe("off")
  })

  it("the flag alone selects adaptive, and unsetting it reverts to static", () => {
    expect(resolveTaxonomyAdaptiveMode({ envBaseline: "enforced", flagEnabledForOrg: true })).toBe("enforced")
    expect(resolveTaxonomyAdaptiveMode({ envBaseline: "enforced", flagEnabledForOrg: false })).toBe("off")
  })
})

describe("isAdaptiveModeActive", () => {
  it("is false only for off", () => {
    expect(isAdaptiveModeActive("off")).toBe(false)
    expect(isAdaptiveModeActive("enforced")).toBe(true)
  })
})
