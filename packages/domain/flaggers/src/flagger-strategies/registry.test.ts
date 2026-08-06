import { describe, expect, it } from "vitest"
import {
  assertFlaggerRegistryValid,
  getFlaggerStrategy,
  isLlmCapableStrategy,
  listFlaggerStrategySlugs,
} from "./index.ts"
import { DETERMINISTIC_FLAGGER_SLUGS } from "./types.ts"

describe("flagger strategy registry", () => {
  // Runs the suppression-graph validation that used to be a module-load IIFE
  // (moved to a test so the package stays side-effect-free and tree-shakeable).
  it("has a valid suppression graph", () => {
    expect(() => assertFlaggerRegistryValid()).not.toThrow()
  })

  // `DETERMINISTIC_FLAGGER_SLUGS` is written out by hand so importing it does not
  // pin every strategy's system prompt into the bundle. This is what keeps that
  // list honest: a strategy that gains or loses an LLM path fails here.
  it("lists exactly the strategies that decide without a model", () => {
    const deterministic = listFlaggerStrategySlugs().filter((slug) => {
      const strategy = getFlaggerStrategy(slug)
      return strategy !== null && !isLlmCapableStrategy(strategy)
    })

    expect([...deterministic].sort()).toEqual([...DETERMINISTIC_FLAGGER_SLUGS].sort())
  })

  it("gives every deterministic strategy a detection function", () => {
    for (const slug of DETERMINISTIC_FLAGGER_SLUGS) {
      expect(getFlaggerStrategy(slug)?.detectDeterministically).toBeTypeOf("function")
    }
  })
})
