import { describe, expect, it } from "vitest"
import { routeAdmitsPayload, type SlackRoute } from "./slack-route.ts"

const route = (minSeverity?: SlackRoute["minSeverity"]): SlackRoute => ({
  channelId: "C123",
  channelName: "alerts",
  ...(minSeverity ? { minSeverity } : {}),
})

describe("routeAdmitsPayload", () => {
  // Escalating says the rate broke its own seasonal band — a different claim
  // from how bad the pattern is, and not one a severity threshold answers. 97%
  // of production escalations come from signals nobody triaged, so honouring the
  // threshold would silence nearly all of them.
  it("always admits a signal escalating, whatever the threshold", () => {
    expect(routeAdmitsPayload(route("urgent"), { sourceType: "signal", severity: "low" })).toBe(true)
    expect(routeAdmitsPayload(route("urgent"), { sourceType: "signal" })).toBe(true)
    expect(routeAdmitsPayload(route("urgent"), { sourceType: "signal" }, { requiresSeverity: true })).toBe(true)
  })

  // Monitor incidents are not escalations and keep the threshold.
  it("still filters a monitor incident by severity", () => {
    expect(routeAdmitsPayload(route("urgent"), { sourceType: "monitor", severity: "low" })).toBe(false)
    expect(routeAdmitsPayload(route("low"), { sourceType: "monitor", severity: "high" })).toBe(true)
  })

  it("admits everything when the route has no minimum severity", () => {
    expect(routeAdmitsPayload(route(), { severity: "low" })).toBe(true)
    expect(routeAdmitsPayload(route(), { severity: "high" })).toBe(true)
    expect(routeAdmitsPayload(route(), { severity: "urgent" })).toBe(true)
  })

  // An unset threshold and an explicit `low` are the same decision today, but
  // for different reasons — the first is "unconfigured", the second is "the
  // bottom of the scale". Pinned so a future tier below `low` breaks here.
  it("treats an unset threshold as no filter, not as low", () => {
    expect(routeAdmitsPayload(route(), { severity: "low" })).toBe(true)
    expect(routeAdmitsPayload(route("low"), { severity: "low" })).toBe(true)
  })

  it("applies the minimum progressively — medium admits medium and high", () => {
    expect(routeAdmitsPayload(route("medium"), { severity: "low" })).toBe(false)
    expect(routeAdmitsPayload(route("medium"), { severity: "medium" })).toBe(true)
    expect(routeAdmitsPayload(route("medium"), { severity: "high" })).toBe(true)
  })

  it("high admits high and urgent", () => {
    expect(routeAdmitsPayload(route("high"), { severity: "medium" })).toBe(false)
    expect(routeAdmitsPayload(route("high"), { severity: "high" })).toBe(true)
    expect(routeAdmitsPayload(route("high"), { severity: "urgent" })).toBe(true)
  })

  it("urgent admits only urgent", () => {
    expect(routeAdmitsPayload(route("urgent"), { severity: "high" })).toBe(false)
    expect(routeAdmitsPayload(route("urgent"), { severity: "urgent" })).toBe(true)
  })

  it("admits payloads from kinds with no severity concept (wrapped reports, announcements)", () => {
    expect(routeAdmitsPayload(route("high"), { wrappedReportId: "wr1" })).toBe(true)
    expect(routeAdmitsPayload(route("high"), { severity: 42 })).toBe(true)
  })

  // A kind that should carry a severity but doesn't means nobody judged the
  // source — an untriaged signal. Not delivered, threshold or no threshold.
  it("drops a severity-bearing kind whose severity is missing or unparseable", () => {
    const opts = { requiresSeverity: true }
    expect(routeAdmitsPayload(route("high"), { signalId: "i" }, opts)).toBe(false)
    expect(routeAdmitsPayload(route(), { signalId: "i" }, opts)).toBe(false)
    expect(routeAdmitsPayload(route(), { signalId: "i", severity: 42 }, opts)).toBe(false)
    expect(routeAdmitsPayload(route(), { signalId: "i", severity: "low" }, opts)).toBe(true)
  })

  // The whole point of putting `severity` on the signal payloads: a discovered
  // signal is filtered by the same route threshold as an incident, and one with
  // no level yet still gets through.
  it("filters discovered signals by the same threshold", () => {
    const discovered = (severity?: string) => ({
      signalId: "i".repeat(24),
      discoveredAt: "2026-08-05T10:00:00.000Z",
      ...(severity ? { severity } : {}),
    })
    const opts = { requiresSeverity: true }

    expect(routeAdmitsPayload(route("high"), discovered("low"), opts)).toBe(false)
    expect(routeAdmitsPayload(route("high"), discovered("urgent"), opts)).toBe(true)
    expect(routeAdmitsPayload(route("high"), discovered(), opts)).toBe(false)
  })
})
