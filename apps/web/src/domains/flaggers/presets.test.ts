import { SAFETY_SUITE_SLUGS } from "@domain/flaggers"
import { describe, expect, it } from "vitest"
import { FLAGGER_USE_CASE_PRESETS } from "./presets.ts"

describe("FLAGGER_USE_CASE_PRESETS", () => {
  // Onboarding disables every slug its chosen preset omits, and Safety needs the
  // whole suite to complete before it can be measured at all. A preset that drops
  // one member leaves the dimension permanently unmeasured, and the all-five
  // publication gate then withholds the entire Agent Score, including the four
  // dimensions that were measured. The slug union is exhaustiveness-checked;
  // preset membership is not, so this is the only thing that catches it.
  it.each(
    FLAGGER_USE_CASE_PRESETS.map((preset) => [preset.id, preset] as const),
  )("%s enables the whole Safety suite", (_id, preset) => {
    expect([...preset.enabledSlugs]).toEqual(expect.arrayContaining([...SAFETY_SUITE_SLUGS]))
  })

  it("enables the Outcome judge everywhere for the same reason", () => {
    for (const preset of FLAGGER_USE_CASE_PRESETS) {
      expect(preset.enabledSlugs).toContain("task-failure")
    }
  })
})
