import type Stripe from "stripe"
import { describe, expect, it } from "vitest"
import { isSubscriptionPeriodStale, pickLicensedSubscriptionPeriod } from "./stripe-subscription-period.ts"

const item = (input: {
  readonly usageType: "licensed" | "metered"
  readonly periodStart: number
  readonly periodEnd: number
}): Stripe.SubscriptionItem =>
  ({
    current_period_start: input.periodStart,
    current_period_end: input.periodEnd,
    price: {
      recurring: { usage_type: input.usageType },
    },
  }) as Stripe.SubscriptionItem

describe("pickLicensedSubscriptionPeriod", () => {
  it("prefers the licensed item over a metered overage item", () => {
    const period = pickLicensedSubscriptionPeriod([
      item({
        usageType: "metered",
        periodStart: 1_000,
        periodEnd: 2_000,
      }),
      item({
        usageType: "licensed",
        periodStart: 1_785_314_414,
        periodEnd: 1_787_992_814,
      }),
    ])

    expect(period).toEqual({
      periodStart: new Date(1_785_314_414 * 1000),
      periodEnd: new Date(1_787_992_814 * 1000),
    })
  })

  it("falls back to the first item when only metered items exist", () => {
    const period = pickLicensedSubscriptionPeriod([
      item({
        usageType: "metered",
        periodStart: 10,
        periodEnd: 20,
      }),
    ])

    expect(period).toEqual({
      periodStart: new Date(10_000),
      periodEnd: new Date(20_000),
    })
  })

  it("returns null for an empty item list", () => {
    expect(pickLicensedSubscriptionPeriod([])).toBeNull()
  })
})

describe("isSubscriptionPeriodStale", () => {
  const now = new Date("2026-07-30T14:00:00.000Z")

  it("is stale when periodEnd is in the past", () => {
    expect(isSubscriptionPeriodStale(new Date("2026-07-29T08:40:14.000Z"), now)).toBe(true)
  })

  it("is not stale when periodEnd is in the future", () => {
    expect(isSubscriptionPeriodStale(new Date("2026-08-29T08:40:14.000Z"), now)).toBe(false)
  })

  it("is not stale when periodEnd is missing", () => {
    expect(isSubscriptionPeriodStale(null, now)).toBe(false)
  })
})
