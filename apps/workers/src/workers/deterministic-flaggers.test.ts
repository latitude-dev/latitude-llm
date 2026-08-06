import { DETERMINISTIC_FLAGGER_SLUGS } from "@domain/flaggers"
import { isDeterministicFlagger } from "@domain/signals"
import { describe, expect, it } from "vitest"

/**
 * `@domain/signals` decides whether to rate a signal with a model or leave its
 * level to volume, which depends on whether a deterministic detector opened it.
 * It cannot import `@domain/flaggers` — no dependency exists in that direction,
 * and adding one re-resolves the lockfile against the release-age gate — so it
 * carries its own copy of the list. This test lives here because `@app/workers`
 * already depends on both, and it fails the moment the two disagree.
 */
describe("deterministic flagger list", () => {
  it("matches the flagger registry", () => {
    for (const slug of DETERMINISTIC_FLAGGER_SLUGS) {
      expect(isDeterministicFlagger(slug), `${slug} should be treated as deterministic`).toBe(true)
    }
  })

  it("treats model-backed detectors as rateable", () => {
    for (const slug of ["pii-leakage", "nsfw", "jailbreaking", "frustration", "laziness", "trashing"]) {
      expect(isDeterministicFlagger(slug), `${slug} is LLM-backed and should be rated`).toBe(false)
    }
  })

  it("treats a human annotation as rateable", () => {
    expect(isDeterministicFlagger(undefined)).toBe(false)
  })
})
