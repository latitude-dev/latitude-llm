import { describe, expect, it } from "vitest"
import { PRO_PLAN_CONFIG } from "../constants.ts"
import { detectBillingLimitCrossed } from "./detect-billing-limit-crossed.ts"

describe("detectBillingLimitCrossed", () => {
  it("returns included-credits when a hard-capped plan first reaches its allotment", () => {
    expect(
      detectBillingLimitCrossed({
        previousConsumedCredits: 19_999,
        consumedCredits: 20_000,
        includedCredits: 20_000,
        overageAllowed: false,
        planSlug: "free",
        spendingLimitCents: null,
      }),
    ).toBe("included-credits")
  })

  it("returns null when a hard-capped plan was already at the allotment", () => {
    expect(
      detectBillingLimitCrossed({
        previousConsumedCredits: 20_000,
        consumedCredits: 20_001,
        includedCredits: 20_000,
        overageAllowed: false,
        planSlug: "free",
        spendingLimitCents: null,
      }),
    ).toBeNull()
  })

  it("returns overage-started when an uncapped Pro plan first exceeds included credits", () => {
    expect(
      detectBillingLimitCrossed({
        previousConsumedCredits: 99_999,
        consumedCredits: 100_001,
        includedCredits: 100_000,
        overageAllowed: true,
        planSlug: "pro",
        spendingLimitCents: null,
      }),
    ).toBe("overage-started")
  })

  it("returns null when an uncapped Pro plan was already in overage", () => {
    expect(
      detectBillingLimitCrossed({
        previousConsumedCredits: 100_000,
        consumedCredits: 100_001,
        includedCredits: 100_000,
        overageAllowed: true,
        planSlug: "pro",
        spendingLimitCents: null,
      }),
    ).toBeNull()
  })

  it("does not emit overage-started when a Pro spend cap is configured", () => {
    const spendingLimitCents = PRO_PLAN_CONFIG.priceCents + 2_000
    expect(
      detectBillingLimitCrossed({
        previousConsumedCredits: 99_999,
        consumedCredits: 100_001,
        includedCredits: 100_000,
        overageAllowed: true,
        planSlug: "pro",
        spendingLimitCents,
      }),
    ).toBeNull()
  })

  it("returns spend-cap when a Pro spending limit is first reached", () => {
    const spendingLimitCents = PRO_PLAN_CONFIG.priceCents + 2_000
    expect(
      detectBillingLimitCrossed({
        previousConsumedCredits: 100_000,
        consumedCredits: 110_000,
        includedCredits: 100_000,
        overageAllowed: true,
        planSlug: "pro",
        spendingLimitCents,
      }),
    ).toBe("spend-cap")
  })

  it("returns null when a Pro spending limit was already reached", () => {
    const spendingLimitCents = PRO_PLAN_CONFIG.priceCents
    expect(
      detectBillingLimitCrossed({
        previousConsumedCredits: 100_000,
        consumedCredits: 100_001,
        includedCredits: 100_000,
        overageAllowed: true,
        planSlug: "pro",
        spendingLimitCents,
      }),
    ).toBeNull()
  })
})
