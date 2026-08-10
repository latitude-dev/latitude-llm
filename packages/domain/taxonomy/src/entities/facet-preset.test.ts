import { describe, expect, it } from "vitest"
import {
  FACET_DESCRIPTION_MAX_LENGTH,
  FACET_INSTRUCTIONS_MAX_LENGTH,
  FACET_NAME_MAX_LENGTH,
  FACET_PRESET_SLUG_PREFIX,
} from "../constants.ts"
import { FACET_PRESETS, findFacetPreset } from "./facet-preset.ts"

describe("facet preset catalog", () => {
  it("ships the five presets with the user-goal facet first", () => {
    expect(FACET_PRESETS).toHaveLength(5)
    expect(FACET_PRESETS[0]?.slug).toBe(`${FACET_PRESET_SLUG_PREFIX}user-goal`)
  })

  it("reserves the lat- prefix for every preset slug and keeps them unique", () => {
    const slugs = FACET_PRESETS.map((preset) => preset.slug)
    for (const slug of slugs) expect(slug.startsWith(FACET_PRESET_SLUG_PREFIX)).toBe(true)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it("keeps every preset's fields within the facet entity length bounds", () => {
    for (const preset of FACET_PRESETS) {
      expect(preset.name.length).toBeGreaterThan(0)
      expect(preset.name.length).toBeLessThanOrEqual(FACET_NAME_MAX_LENGTH)
      expect(preset.description.length).toBeLessThanOrEqual(FACET_DESCRIPTION_MAX_LENGTH)
      expect(preset.instructions.length).toBeLessThanOrEqual(FACET_INSTRUCTIONS_MAX_LENGTH)
    }
  })

  it("resolves a known slug and returns null for an unknown one", () => {
    expect(findFacetPreset(`${FACET_PRESET_SLUG_PREFIX}user-goal`)?.name).toBe("User goal")
    expect(findFacetPreset("nope")).toBeNull()
  })
})
