import { type AlertCountThreshold, type AlertIncidentKind, MonitorAlertId, MonitorId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import type { MonitorAlert } from "./entities/monitor.ts"
import { formatHumanReadableAlert } from "./helpers.ts"

const baseAlert: MonitorAlert = {
  id: MonitorAlertId("a".repeat(24)),
  monitorId: MonitorId("m".repeat(24)),
  kind: "issue.new",
  source: { type: "issue", id: null },
  condition: null,
  severity: "medium",
  createdAt: new Date("2026-05-29T10:00:00.000Z"),
}

const makeAlert = (overrides: Partial<MonitorAlert> & { kind: AlertIncidentKind }): MonitorAlert => ({
  ...baseAlert,
  ...overrides,
})

const absolute = (count: number): AlertCountThreshold => ({ mode: "absolute", count })

describe("formatHumanReadableAlert", () => {
  it("renders the issue.new system alert", () => {
    expect(formatHumanReadableAlert(baseAlert)).toBe("Alerts each time a new issue is detected.")
  })

  it("renders the issue.regressed system alert", () => {
    expect(formatHumanReadableAlert(makeAlert({ kind: "issue.regressed" }))).toBe(
      "Alerts each time a resolved issue is detected again.",
    )
  })

  it("renders the issue.escalating system alert", () => {
    expect(formatHumanReadableAlert(makeAlert({ kind: "issue.escalating" }))).toBe(
      "Alerts when an ongoing issue is being detected more than expected.",
    )
  })

  it("renders savedSearch.match using the saved search name when provided", () => {
    const alert = makeAlert({
      kind: "savedSearch.match",
      source: { type: "savedSearch", id: "s".repeat(24) },
    })
    expect(formatHumanReadableAlert(alert, { savedSearchName: "5xx" })).toBe(
      "Alerts each time a new trace matching '5xx' is detected.",
    )
  })

  it("falls back to a generic subject when the saved-search name is unavailable", () => {
    const alert = makeAlert({
      kind: "savedSearch.match",
      source: { type: "savedSearch", id: "s".repeat(24) },
    })
    expect(formatHumanReadableAlert(alert)).toBe("Alerts each time a new matching trace is detected.")
  })

  it("renders savedSearch.threshold absolute mode", () => {
    const alert = makeAlert({
      kind: "savedSearch.threshold",
      source: { type: "savedSearch", id: "s".repeat(24) },
      condition: { kind: "savedSearch.threshold", threshold: absolute(100) },
    })
    expect(formatHumanReadableAlert(alert, { savedSearchName: "5xx" })).toBe(
      "Alerts when traces matching '5xx' are detected 100 times.",
    )
  })

  it("renders savedSearch.threshold multiplier mode with an average lookback", () => {
    const alert = makeAlert({
      kind: "savedSearch.threshold",
      source: { type: "savedSearch", id: "s".repeat(24) },
      condition: {
        kind: "savedSearch.threshold",
        threshold: {
          mode: "multiplier",
          factor: 3,
          baseline: { kind: "average", lookback: { unit: "hours", hours: 72 } },
        },
      },
    })
    expect(formatHumanReadableAlert(alert, { savedSearchName: "5xx" })).toBe(
      "Alerts when traces matching '5xx' are detected 3 times more than the average of the last 72 hours.",
    )
  })

  it("renders savedSearch.threshold multiplier mode with a 7-day average lookback", () => {
    const alert = makeAlert({
      kind: "savedSearch.threshold",
      source: { type: "savedSearch", id: "s".repeat(24) },
      condition: {
        kind: "savedSearch.threshold",
        threshold: {
          mode: "multiplier",
          factor: 2,
          baseline: { kind: "average", lookback: { unit: "days", days: 7 } },
        },
      },
    })
    expect(formatHumanReadableAlert(alert, { savedSearchName: "5xx" })).toBe(
      "Alerts when traces matching '5xx' are detected 2 times more than the average of the last 7 days.",
    )
  })

  it("renders savedSearch.threshold multiplier mode with a previous-day period", () => {
    const alert = makeAlert({
      kind: "savedSearch.threshold",
      source: { type: "savedSearch", id: "s".repeat(24) },
      condition: {
        kind: "savedSearch.threshold",
        threshold: {
          mode: "multiplier",
          factor: 2,
          baseline: { kind: "period", lookback: { unit: "days", days: 1 } },
        },
      },
    })
    expect(formatHumanReadableAlert(alert, { savedSearchName: "5xx" })).toBe(
      "Alerts when traces matching '5xx' are detected 2 times more than yesterday.",
    )
  })

  it("renders savedSearch.threshold multiplier mode with a previous-week period", () => {
    const alert = makeAlert({
      kind: "savedSearch.threshold",
      source: { type: "savedSearch", id: "s".repeat(24) },
      condition: {
        kind: "savedSearch.threshold",
        threshold: {
          mode: "multiplier",
          factor: 2,
          baseline: { kind: "period", lookback: { unit: "days", days: 7 } },
        },
      },
    })
    expect(formatHumanReadableAlert(alert, { savedSearchName: "5xx" })).toBe(
      "Alerts when traces matching '5xx' are detected 2 times more than the previous week.",
    )
  })

  it("renders savedSearch.threshold expected mode with the sensitivity as the amount", () => {
    const alert = makeAlert({
      kind: "savedSearch.threshold",
      source: { type: "savedSearch", id: "s".repeat(24) },
      condition: {
        kind: "savedSearch.threshold",
        threshold: { mode: "expected", sensitivity: 2 },
      },
    })
    expect(formatHumanReadableAlert(alert, { savedSearchName: "5xx" })).toBe(
      "Alerts when traces matching '5xx' are detected 2 times more than expected.",
    )
  })

  it("renders savedSearch.escalating expected mode, with the window as sustained-for", () => {
    const alert = makeAlert({
      kind: "savedSearch.escalating",
      source: { type: "savedSearch", id: "s".repeat(24) },
      condition: {
        kind: "savedSearch.escalating",
        threshold: { mode: "expected", sensitivity: 3 },
        window: { minutes: 60 },
      },
    })
    expect(formatHumanReadableAlert(alert, { savedSearchName: "5xx" })).toBe(
      "Alerts when traces matching '5xx' are detected 3 times more than expected, sustained for at least 1 hour.",
    )
  })

  it("renders expected mode without a number when sensitivity is unset", () => {
    const alert = makeAlert({
      kind: "savedSearch.threshold",
      source: { type: "savedSearch", id: "s".repeat(24) },
      condition: {
        kind: "savedSearch.threshold",
        threshold: { mode: "expected" },
      },
    })
    expect(formatHumanReadableAlert(alert, { savedSearchName: "5xx" })).toBe(
      "Alerts when traces matching '5xx' are detected more than expected.",
    )
  })

  it("renders savedSearch.escalating absolute mode with a 5-minute window", () => {
    const alert = makeAlert({
      kind: "savedSearch.escalating",
      source: { type: "savedSearch", id: "s".repeat(24) },
      condition: {
        kind: "savedSearch.escalating",
        threshold: absolute(2000),
        window: { minutes: 5 },
      },
    })
    expect(formatHumanReadableAlert(alert, { savedSearchName: "5xx" })).toBe(
      "Alerts when traces matching '5xx' are detected 2000 times, sustained for at least 5 minutes.",
    )
  })

  it("renders savedSearch.escalating multiplier mode with an average lookback and 60-minute window", () => {
    const alert = makeAlert({
      kind: "savedSearch.escalating",
      source: { type: "savedSearch", id: "s".repeat(24) },
      condition: {
        kind: "savedSearch.escalating",
        threshold: {
          mode: "multiplier",
          factor: 2,
          baseline: { kind: "average", lookback: { unit: "days", days: 7 } },
        },
        window: { minutes: 60 },
      },
    })
    expect(formatHumanReadableAlert(alert, { savedSearchName: "5xx" })).toBe(
      "Alerts when traces matching '5xx' are detected 2 times more than the average of the last 7 days, sustained for at least 1 hour.",
    )
  })

  it("falls back to the generic line when a saved-search threshold alert is missing its condition", () => {
    const alert = makeAlert({
      kind: "savedSearch.threshold",
      source: { type: "savedSearch", id: "s".repeat(24) },
      condition: null,
    })
    expect(formatHumanReadableAlert(alert, { savedSearchName: "5xx" })).toBe(
      "Alert configured (savedSearch.threshold).",
    )
  })
})
