import { OrganizationId } from "@domain/shared"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  MAX_TRACKED_SUBSCRIPTIONS,
  reportStaleSubscriptionPeriod,
  resetStaleSubscriptionPeriodReportThrottle,
} from "./stale-subscription-period-report.ts"

const organizationId = OrganizationId("org_1")

interface ReportedLog {
  readonly level: string
  readonly args: readonly unknown[]
}

describe("reportStaleSubscriptionPeriod", () => {
  let lines: string[]

  beforeEach(() => {
    resetStaleSubscriptionPeriodReportThrottle()
    lines = []
    vi.spyOn(console, "error").mockImplementation((line: unknown) => {
      lines.push(String(line))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const reported = (): ReportedLog[] => lines.map((line) => JSON.parse(line) as ReportedLog)

  it("reports a stale period once so metering traffic cannot drive the volume", () => {
    reportStaleSubscriptionPeriod({
      organizationId,
      stripeSubscriptionId: "sub_1",
      alert: "stale_subscription_period",
      periodEnd: new Date("2026-07-29T08:40:14.000Z"),
    })
    reportStaleSubscriptionPeriod({
      organizationId,
      stripeSubscriptionId: "sub_1",
      alert: "stale_subscription_period_refresh_failed",
      errorMessage: "timeout",
    })

    const logs = reported()
    expect(logs).toHaveLength(1)
    expect(logs[0]?.level).toBe("error")
    expect(logs[0]?.args[1]).toMatchObject({
      organizationId: "org_1",
      stripeSubscriptionId: "sub_1",
      alert: "stale_subscription_period",
    })
  })

  it("throttles per organization and subscription", () => {
    reportStaleSubscriptionPeriod({
      organizationId,
      stripeSubscriptionId: "sub_1",
      alert: "stale_subscription_period",
    })
    reportStaleSubscriptionPeriod({
      organizationId,
      stripeSubscriptionId: "sub_2",
      alert: "stale_subscription_period",
    })

    expect(reported()).toHaveLength(2)
  })

  it("keeps throttling a subscription when a flood of new ones overflows the tracked set", () => {
    reportStaleSubscriptionPeriod({
      organizationId: OrganizationId("org_decoy"),
      stripeSubscriptionId: "sub_decoy",
      alert: "stale_subscription_period",
    })
    reportStaleSubscriptionPeriod({
      organizationId,
      stripeSubscriptionId: "sub_keep",
      alert: "stale_subscription_period",
    })

    for (let i = 0; i < MAX_TRACKED_SUBSCRIPTIONS - 1; i++) {
      reportStaleSubscriptionPeriod({
        organizationId: OrganizationId(`org_flood_${i}`),
        stripeSubscriptionId: `sub_flood_${i}`,
        alert: "stale_subscription_period",
      })
    }

    const before = reported().length
    reportStaleSubscriptionPeriod({
      organizationId,
      stripeSubscriptionId: "sub_keep",
      alert: "stale_subscription_period_refresh_failed",
      errorMessage: "timeout",
    })

    expect(reported()).toHaveLength(before)
  })
})
