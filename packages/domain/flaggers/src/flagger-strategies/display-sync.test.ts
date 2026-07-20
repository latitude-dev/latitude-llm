import { describe, expect, it } from "vitest"
import { DETERMINISTIC_FLAGGER_INSTRUCTIONS, FLAGGER_DISPLAY } from "./display.ts"
import { getFlaggerStrategy, isLlmCapableStrategy, suppressorSlug } from "./index.ts"
import { FLAGGER_STRATEGY_SLUGS } from "./types.ts"

// The lightweight FLAGGER_DISPLAY table duplicates strategy metadata so the web
// never imports the prompt-bearing strategies. This test is the anti-drift
// guard: it must match the real strategies field-for-field.
describe("FLAGGER_DISPLAY", () => {
  it("covers every slug and nothing more", () => {
    expect(Object.keys(FLAGGER_DISPLAY).sort()).toEqual([...FLAGGER_STRATEGY_SLUGS].sort())
  })

  for (const slug of FLAGGER_STRATEGY_SLUGS) {
    it(`matches the ${slug} strategy`, () => {
      const strategy = getFlaggerStrategy(slug)!
      const llm = isLlmCapableStrategy(strategy)
      const details = llm ? strategy.annotator : strategy.details
      const display = FLAGGER_DISPLAY[slug]

      expect(display.name).toBe(details?.name)
      expect(display.description).toBe(details?.description)
      expect(display.mode).toBe(llm ? "llm" : "deterministic")
      expect(display.instructions).toBe(llm ? strategy.annotator.instructions : DETERMINISTIC_FLAGGER_INSTRUCTIONS)
      expect(display.suppressedBy).toEqual((strategy.suppressedBy ?? []).map(suppressorSlug))
    })
  }
})
