import type { CacheFindingMeasures } from "@domain/spans"
import { CACHE_SIGNAL_STATES } from "@domain/spans"
import { describe, expect, it } from "vitest"
import { describeCacheFinding } from "./cache-finding-copy.ts"
import { SIGNAL_NAME_MAX_LENGTH } from "./constants.ts"

const measures = (overrides: Partial<CacheFindingMeasures> = {}): CacheFindingMeasures => ({
  provider: "anthropic",
  model: "claude-haiku-4-5",
  state: "investigate",
  urgency: "underusing",
  actualRate: 0.063,
  breakEvenRate: 0.2174,
  ceilingRate: 0.8531,
  modeledSavingsMicrocents: 970_178_000,
  calls: 294,
  spendMicrocents: 1_335_968_000,
  cacheLifetimeSeconds: 300,
  ...overrides,
})

describe("describeCacheFinding", () => {
  it.each(CACHE_SIGNAL_STATES)("writes a complete name and description for %s", (state) => {
    const copy = describeCacheFinding(measures({ state }))
    expect(copy.name).toContain("claude-haiku-4-5")
    expect(copy.name.length).toBeLessThanOrEqual(SIGNAL_NAME_MAX_LENGTH)
    expect(copy.description).toContain("claude-haiku-4-5")
    expect(copy.description).toContain("anthropic")
    // A signal whose text reads "NaN%" or "$undefined" is worse than no signal.
    expect(copy.description).not.toMatch(/NaN|undefined|Infinity/)
  })

  it("states every measured figure a reader needs to check the claim", () => {
    const copy = describeCacheFinding(measures())
    expect(copy.description).toContain("6.3%")
    expect(copy.description).toContain("21.7%")
    expect(copy.description).toContain("85.3%")
    expect(copy.description).toContain("294 calls")
    expect(copy.description).toContain("5m")
  })

  it("names the levers for investigate and prescribes nothing", () => {
    const copy = describeCacheFinding(measures({ state: "investigate" }))
    expect(copy.description).toContain("prompt construction")
    expect(copy.description).toContain("timestamp")
  })

  it("keeps a long model slug inside the name column", () => {
    const copy = describeCacheFinding(measures({ model: "a".repeat(400) }))
    expect(copy.name.length).toBe(SIGNAL_NAME_MAX_LENGTH)
  })

  it("rounds dollars up to whole units once they stop needing cents", () => {
    expect(describeCacheFinding(measures({ modeledSavingsMicrocents: 40_000_000 })).description).toContain("$0.40")
    expect(describeCacheFinding(measures({ modeledSavingsMicrocents: 4_200_000_000 })).description).toContain("$42")
  })
})
