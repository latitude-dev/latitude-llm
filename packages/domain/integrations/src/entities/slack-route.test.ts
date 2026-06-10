import { describe, expect, it } from "vitest"
import { routeAdmitsPayload, type SlackRoute } from "./slack-route.ts"

const route = (minSeverity?: SlackRoute["minSeverity"]): SlackRoute => ({
  channelId: "C123",
  channelName: "alerts",
  ...(minSeverity ? { minSeverity } : {}),
})

describe("routeAdmitsPayload", () => {
  it("admits everything when the route has no minimum severity", () => {
    expect(routeAdmitsPayload(route(), { severity: "low" })).toBe(true)
    expect(routeAdmitsPayload(route(), { severity: "high" })).toBe(true)
  })

  it("applies the minimum progressively — medium admits medium and high", () => {
    expect(routeAdmitsPayload(route("medium"), { severity: "low" })).toBe(false)
    expect(routeAdmitsPayload(route("medium"), { severity: "medium" })).toBe(true)
    expect(routeAdmitsPayload(route("medium"), { severity: "high" })).toBe(true)
  })

  it("high admits only high", () => {
    expect(routeAdmitsPayload(route("high"), { severity: "medium" })).toBe(false)
    expect(routeAdmitsPayload(route("high"), { severity: "high" })).toBe(true)
  })

  it("admits payloads without a severity (wrapped reports, announcements)", () => {
    expect(routeAdmitsPayload(route("high"), { wrappedReportId: "wr1" })).toBe(true)
    expect(routeAdmitsPayload(route("high"), { severity: 42 })).toBe(true)
  })
})
