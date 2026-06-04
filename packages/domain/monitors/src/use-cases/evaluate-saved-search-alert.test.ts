import { ChSqlClient, OrganizationId, ProjectId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { MonitorAlert } from "../entities/monitor.ts"
import { createFakeSavedSearchMatchReader } from "../testing/fake-saved-search-match-reader.ts"
import { evaluateSavedSearchAlert } from "./evaluate-saved-search-alert.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const savedSearchId = "s".repeat(24)
const now = new Date("2026-06-01T12:00:00.000Z")

const alert = (overrides: Partial<MonitorAlert>): MonitorAlert => ({
  id: "a".repeat(24) as MonitorAlert["id"],
  monitorId: "m".repeat(24) as MonitorAlert["monitorId"],
  kind: "savedSearch.threshold",
  source: { type: "savedSearch", id: savedSearchId },
  condition: null,
  severity: "medium",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  ...overrides,
})

const evaluate = (input: { alert: MonitorAlert; matches: readonly Date[] }) =>
  Effect.runPromise(
    evaluateSavedSearchAlert({
      organizationId,
      projectId,
      alert: input.alert,
      target: { query: null, filterSet: {} },
      now,
    }).pipe(
      Effect.provide(createFakeSavedSearchMatchReader(input.matches).layer),
      Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId })),
    ),
  )

// Minutes-before-`now` helper keeps the window arithmetic readable.
const minsAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000)

describe("evaluateSavedSearchAlert", () => {
  describe("savedSearch.match", () => {
    const matchAlert = alert({ kind: "savedSearch.match", condition: null })

    it("fires when any trace matched in the trailing 5 minutes, reporting the first match", async () => {
      const first = minsAgo(4)
      const result = await evaluate({ alert: matchAlert, matches: [first, minsAgo(1)] })
      expect(result.isMet).toBe(true)
      expect(result.count).toBe(2)
      expect(result.firstMatchInWindow).toEqual(first)
    })

    it("does not fire when the window is empty", async () => {
      const result = await evaluate({ alert: matchAlert, matches: [minsAgo(10)] })
      expect(result).toMatchObject({ isMet: false, count: 0, firstMatchInWindow: null })
    })
  })

  describe("savedSearch.threshold absolute", () => {
    const absolute = alert({
      kind: "savedSearch.threshold",
      condition: { kind: "savedSearch.threshold", threshold: { mode: "absolute", count: 5 } },
    })

    it("counts cumulatively since the alert was created and fires at the threshold", async () => {
      // Spread 5 matches across the day (all after createdAt 00:00); cumulative window is [createdAt, now).
      const matches = [minsAgo(600), minsAgo(400), minsAgo(200), minsAgo(100), minsAgo(10)]
      const result = await evaluate({ alert: absolute, matches })
      expect(result).toMatchObject({ isMet: true, count: 5, threshold: 5 })
    })

    it("does not fire below the threshold", async () => {
      const result = await evaluate({ alert: absolute, matches: [minsAgo(300), minsAgo(120), minsAgo(30)] })
      expect(result).toMatchObject({ isMet: false, count: 3, threshold: 5 })
    })
  })

  describe("savedSearch.threshold multiplier", () => {
    it("normalises an average baseline onto the 5-minute current window", async () => {
      const multiplier = alert({
        kind: "savedSearch.threshold",
        condition: {
          kind: "savedSearch.threshold",
          threshold: {
            mode: "multiplier",
            factor: 3,
            baseline: { kind: "average", lookback: { unit: "hours", hours: 1 } },
          },
        },
      })
      // baseline = [now-60m, now): 8 matches outside the current window + 4 inside ⇒ 12.
      // normalisedBaseline = 12 × (5m / 60m) = 1; threshold = 3 × 1 = 3.
      const baselineOnly = [55, 50, 45, 40, 35, 30, 20, 10].map(minsAgo)
      const current = [4, 3, 2, 1].map(minsAgo)
      const result = await evaluate({ alert: multiplier, matches: [...baselineOnly, ...current] })
      expect(result).toMatchObject({ isMet: true, count: 4, baselineCount: 12, threshold: 3 })
    })

    it("uses the immediately-preceding window for a period baseline", async () => {
      const multiplier = alert({
        kind: "savedSearch.threshold",
        condition: {
          kind: "savedSearch.threshold",
          threshold: {
            mode: "multiplier",
            factor: 2,
            baseline: { kind: "period", lookback: { unit: "hours", hours: 1 } },
          },
        },
      })
      // period window = [now-120m, now-60m): 12 matches there; none leak into the current 5m window.
      // normalisedBaseline = 12 × (5m / 60m) = 1; threshold = 2 × 1 = 2.
      const periodWindow = [115, 110, 100, 95, 90, 85, 80, 75, 70, 68, 65, 62].map(minsAgo)
      const current = [4, 2, 1].map(minsAgo)
      const result = await evaluate({ alert: multiplier, matches: [...periodWindow, ...current] })
      expect(result).toMatchObject({ isMet: true, count: 3, baselineCount: 12, threshold: 2 })
    })

    it("never fires on an empty current window even when the baseline is zero", async () => {
      const multiplier = alert({
        kind: "savedSearch.threshold",
        condition: {
          kind: "savedSearch.threshold",
          threshold: {
            mode: "multiplier",
            factor: 2,
            baseline: { kind: "average", lookback: { unit: "hours", hours: 1 } },
          },
        },
      })
      const result = await evaluate({ alert: multiplier, matches: [] })
      expect(result).toMatchObject({ isMet: false, count: 0, baselineCount: 0, threshold: 0 })
    })
  })

  describe("savedSearch.escalating", () => {
    it("counts over the configured window for an absolute threshold", async () => {
      const escalating = alert({
        kind: "savedSearch.escalating",
        condition: {
          kind: "savedSearch.escalating",
          threshold: { mode: "absolute", count: 5 },
          window: { minutes: 10 },
        },
      })
      const result = await evaluate({ alert: escalating, matches: [9, 8, 6, 4, 2, 1].map(minsAgo) })
      expect(result).toMatchObject({ isMet: true, count: 6, threshold: 5 })
    })

    it("normalises the baseline onto the window for a multiplier threshold", async () => {
      const escalating = alert({
        kind: "savedSearch.escalating",
        condition: {
          kind: "savedSearch.escalating",
          threshold: {
            mode: "multiplier",
            factor: 2,
            baseline: { kind: "average", lookback: { unit: "hours", hours: 1 } },
          },
          window: { minutes: 10 },
        },
      })
      // window = [now-10m, now): 6 matches. baseline = [now-60m, now): 18 (12 older + 6 in window).
      // normalisedBaseline = 18 × (10m / 60m) = 3; threshold = 2 × 3 = 6 ⇒ met (6 ≥ 6).
      const baselineOlder = [55, 50, 45, 40, 35, 30, 25, 22, 18, 15, 13, 11].map(minsAgo)
      const inWindow = [9, 7, 5, 3, 2, 1].map(minsAgo)
      const result = await evaluate({ alert: escalating, matches: [...baselineOlder, ...inWindow] })
      expect(result).toMatchObject({ isMet: true, count: 6, baselineCount: 18, threshold: 6 })
    })
  })

  describe("savedSearch.threshold expected", () => {
    const expectedAlert = alert({
      kind: "savedSearch.threshold",
      condition: { kind: "savedSearch.threshold", threshold: { mode: "expected", sensitivity: 3 } },
    })
    // `count` matches inside the 5-min window ending `anchorMsAgo` before `now`.
    const windowMatches = (anchorMsAgo: number, count: number): Date[] =>
      Array.from({ length: count }, (_unused, j) => new Date(now.getTime() - anchorMsAgo - 20_000 * (j + 1)))
    const weekMatches = (week: number, count: number) => windowMatches(week * 7 * 24 * 60 * 60 * 1000, count)

    it("with no seasonal history, the band is sensitivity × the σ floor (1.0)", async () => {
      // expected 0, stddev 0 ⇒ σ = max(0, 0, 1) = 1; threshold = sensitivity(3) × 1 = 3.
      const met = await evaluate({ alert: expectedAlert, matches: windowMatches(0, 5) })
      expect(met).toMatchObject({ isMet: true, count: 5, threshold: 3 })
      // Strict `>`: a count of 3 does not exceed the threshold of 3.
      const notMet = await evaluate({ alert: expectedAlert, matches: windowMatches(0, 3) })
      expect(notMet).toMatchObject({ isMet: false, count: 3, threshold: 3 })
    })

    it("learns the band from the same-time-of-week history across prior weeks", async () => {
      // 4 matches in each of the last 4 weekly windows ⇒ expected 4, stddev 0,
      // σ = max(0, √4, 1) = 2; threshold = 4 + 3 × 2 = 10.
      const history = [1, 2, 3, 4].flatMap((week) => weekMatches(week, 4))
      const met = await evaluate({ alert: expectedAlert, matches: [...windowMatches(0, 12), ...history] })
      expect(met).toMatchObject({ isMet: true, count: 12, threshold: 10 })
      const notMet = await evaluate({ alert: expectedAlert, matches: [...windowMatches(0, 8), ...history] })
      expect(notMet).toMatchObject({ isMet: false, count: 8, threshold: 10 })
    })
  })
})
