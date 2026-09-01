import { describe, expect, it } from "vitest"
import { PROMOTION_MAX_SESSIONS, PROMOTION_MIN_SESSIONS } from "./constants.ts"
import { promotionThreshold } from "./promotion.ts"

describe("promotionThreshold", () => {
  it("holds at the floor for low-traffic projects", () => {
    expect(promotionThreshold(0)).toBe(PROMOTION_MIN_SESSIONS)
    expect(promotionThreshold(300)).toBe(PROMOTION_MIN_SESSIONS)
    expect(promotionThreshold(4_000)).toBe(PROMOTION_MIN_SESSIONS)
  })

  it("scales with volume between the clamps", () => {
    expect(promotionThreshold(6_000)).toBe(3)
    expect(promotionThreshold(10_000)).toBe(5)
    expect(promotionThreshold(20_000)).toBe(10)
  })

  it("holds at the cap for high-traffic projects", () => {
    expect(promotionThreshold(30_000)).toBe(PROMOTION_MAX_SESSIONS)
    expect(promotionThreshold(3_000_000)).toBe(PROMOTION_MAX_SESSIONS)
  })

  it("clamps at the documented boundaries", () => {
    // The floor stops binding above 4,000 sessions and the cap starts binding at
    // 28,001; the spec quotes both, so a change to either constant fails here.
    expect(promotionThreshold(4_001)).toBe(PROMOTION_MIN_SESSIONS + 1)
    expect(promotionThreshold(28_000)).toBe(PROMOTION_MAX_SESSIONS - 1)
    expect(promotionThreshold(28_001)).toBe(PROMOTION_MAX_SESSIONS)
  })

  it("never returns less than the floor for nonsense input", () => {
    expect(promotionThreshold(-1)).toBe(PROMOTION_MIN_SESSIONS)
  })
})
