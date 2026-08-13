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
    ).toEqual(["included-credits"])
  })

  it("returns empty when a hard-capped plan was already at the allotment", () => {
    expect(
      detectBillingLimitCrossed({
        previousConsumedCredits: 20_000,
        consumedCredits: 20_001,
        includedCredits: 20_000,
        overageAllowed: false,
        planSlug: "free",
        spendingLimitCents: null,
      }),
    ).toEqual([])
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
    ).toEqual(["overage-started"])
  })

  it("returns overage-started when a capped Pro plan first exceeds included credits", () => {
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
    ).toEqual(["overage-started"])
  })

  it("returns empty when an uncapped Pro plan was already in overage", () => {
    expect(
      detectBillingLimitCrossed({
        previousConsumedCredits: 100_000,
        consumedCredits: 100_001,
        includedCredits: 100_000,
        overageAllowed: true,
        planSlug: "pro",
        spendingLimitCents: null,
      }),
    ).toEqual([])
  })

  it("returns spend-cap when a Pro spending limit is first reached after overage has started", () => {
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
    ).toEqual(["spend-cap"])
  })

  it("returns both overage-started and spend-cap when a write crosses both thresholds", () => {
    const spendingLimitCents = PRO_PLAN_CONFIG.priceCents
    expect(
      detectBillingLimitCrossed({
        previousConsumedCredits: 99_999,
        consumedCredits: 100_001,
        includedCredits: 100_000,
        overageAllowed: true,
        planSlug: "pro",
        spendingLimitCents,
      }),
    ).toEqual(["overage-started", "spend-cap"])
  })

  it("returns empty when a Pro spending limit was already reached", () => {
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
    ).toEqual([])
  })
})
