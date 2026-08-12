import { describe, expect, it } from "vitest"
import {
  applyAnalyticsBrushSelect,
  applyAnalyticsTimeChange,
  clipRangeToCoverage,
  isAllTimeRead,
  resolveAnalyticsListRange,
  resolveAnalyticsTrendRange,
} from "./use-analytics-time-window.ts"

const DAY = 24 * 60 * 60 * 1000
const now = Date.UTC(2026, 6, 10, 12, 0, 0)
const iso = (ms: number) => new Date(ms).toISOString()
const RANGE_30D = 30 * 24 * 60 * 60

describe("isAllTimeRead", () => {
  it("true when no lower bound is picked", () => {
    expect(isAllTimeRead("")).toBe(true)
  })
  it("false when a range is picked", () => {
    expect(isAllTimeRead(iso(now))).toBe(false)
  })
})

describe("resolveAnalyticsListRange", () => {
  it("default (no params) → unbounded All time", () => {
    const r = resolveAnalyticsListRange({ timeFrom: "", timeTo: "", nowMs: now })
    expect(r).toEqual({ toIso: iso(now) })
    expect(r.fromIso).toBeUndefined()
  })

  it("All time with a concrete lower bound uses it (screens whose endpoints require one)", () => {
    const first = iso(now - 200 * DAY)
    const r = resolveAnalyticsListRange({ timeFrom: "", timeTo: "", nowMs: now, allTimeLowerBoundIso: first })
    expect(r).toEqual({ fromIso: first, toIso: iso(now) })
  })

  it("explicit range is used verbatim", () => {
    const from = iso(now - 5 * DAY)
    const to = iso(now - 1 * DAY)
    const r = resolveAnalyticsListRange({ timeFrom: from, timeTo: to, nowMs: now })
    expect(r).toEqual({ fromIso: from, toIso: to })
  })

  it("falls back safely on unparseable URL dates instead of throwing", () => {
    // Bad upper bound → now; bad lower bound → drop to All time. Both branches must stay valid ISO.
    expect(resolveAnalyticsListRange({ timeFrom: "", timeTo: "not-a-date", nowMs: now })).toEqual({ toIso: iso(now) })
    expect(resolveAnalyticsListRange({ timeFrom: "nope", timeTo: "", nowMs: now })).toEqual({ toIso: iso(now) })
    const first = iso(now - 200 * DAY)
    expect(
      resolveAnalyticsListRange({ timeFrom: "bad", timeTo: "bad", nowMs: now, allTimeLowerBoundIso: first }),
    ).toEqual({ fromIso: first, toIso: iso(now) })
  })
})

describe("resolveAnalyticsTrendRange", () => {
  it("bounded range ≤ maxSpan is used verbatim", () => {
    const from = iso(now - 10 * DAY)
    const to = iso(now - 2 * DAY)
    const r = resolveAnalyticsTrendRange({
      listRange: { fromIso: from, toIso: to },
      isAllTime: false,
      maxSpanSeconds: RANGE_30D,
      nowMs: now,
    })
    expect(r).toEqual({ fromIso: from, toIso: to })
  })

  it("clamps a > maxSpan bounded range to the most recent maxSpan of it", () => {
    const from = iso(now - 90 * DAY)
    const to = iso(now - 5 * DAY)
    const r = resolveAnalyticsTrendRange({
      listRange: { fromIso: from, toIso: to },
      isAllTime: false,
      maxSpanSeconds: RANGE_30D,
      nowMs: now,
    })
    expect(r).toEqual({ fromIso: iso(now - 35 * DAY), toIso: to })
  })

  it("All time without latest activity → last maxSpan ending now", () => {
    const r = resolveAnalyticsTrendRange({
      listRange: { toIso: iso(now) },
      isAllTime: true,
      maxSpanSeconds: RANGE_30D,
      nowMs: now,
    })
    expect(r).toEqual({ fromIso: iso(now - 30 * DAY), toIso: iso(now) })
  })

  it("All time anchors to latest activity — even with a concrete list lower bound", () => {
    const last = iso(now - 40 * DAY)
    const r = resolveAnalyticsTrendRange({
      listRange: { fromIso: iso(now - 200 * DAY), toIso: iso(now) },
      isAllTime: true,
      lastActivityIso: last,
      maxSpanSeconds: RANGE_30D,
      nowMs: now,
    })
    expect(r).toEqual({ fromIso: iso(now - 70 * DAY), toIso: last })
  })
})

describe("applyAnalyticsTimeChange", () => {
  it("bounded selection sets both params", () => {
    const from = iso(now - 3 * DAY)
    const to = iso(now)
    expect(applyAnalyticsTimeChange(from, to)).toEqual([from, to])
  })

  it("empty selection (clear) returns to All time (empty params)", () => {
    expect(applyAnalyticsTimeChange()).toEqual(["", ""])
  })
})

describe("applyAnalyticsBrushSelect", () => {
  it("brush selection sets both params", () => {
    const range = { from: iso(now - 2 * DAY), to: iso(now) }
    expect(applyAnalyticsBrushSelect(range)).toEqual([range.from, range.to])
  })

  it("clearing the brush returns to All time (empty params)", () => {
    expect(applyAnalyticsBrushSelect(null)).toEqual(["", ""])
  })
})

describe("clipRangeToCoverage", () => {
  const coverageFromIso = iso(now - 6 * DAY)
  const coverageToIso = iso(now)

  it("clips a selection wider than coverage down to it", () => {
    const clipped = clipRangeToCoverage({
      range: { fromIso: iso(now - 120 * DAY), toIso: iso(now) },
      coverageFromIso,
      coverageToIso,
    })
    expect(clipped).toEqual({ fromIso: coverageFromIso, toIso: coverageToIso })
  })

  it("resolves an unbounded All-time read to exactly the covered band", () => {
    const clipped = clipRangeToCoverage({ range: { toIso: iso(now) }, coverageFromIso, coverageToIso })
    expect(clipped).toEqual({ fromIso: coverageFromIso, toIso: coverageToIso })
  })

  it("leaves a selection already inside coverage alone", () => {
    const range = { fromIso: iso(now - 3 * DAY), toIso: iso(now - 1 * DAY) }
    expect(clipRangeToCoverage({ range, coverageFromIso, coverageToIso })).toEqual(range)
  })

  it("collapses a selection entirely before coverage instead of inverting it", () => {
    const clipped = clipRangeToCoverage({
      range: { fromIso: iso(now - 60 * DAY), toIso: iso(now - 40 * DAY) },
      coverageFromIso,
      coverageToIso,
    })
    expect(clipped).toEqual({ fromIso: coverageFromIso, toIso: coverageFromIso })
  })

  it("pins a selection starting after a stale coverage end to that end", () => {
    // Coverage ended 4 days ago (data stopped). "Last day" starts past it; the clipped
    // window must stay inside the band the picker advertises rather than escape it.
    const staleToIso = iso(now - 4 * DAY)
    const clipped = clipRangeToCoverage({
      range: { fromIso: iso(now - 1 * DAY), toIso: iso(now) },
      coverageFromIso: iso(now - 10 * DAY),
      coverageToIso: staleToIso,
    })
    expect(clipped).toEqual({ fromIso: staleToIso, toIso: staleToIso })
  })

  it("passes the range through when no coverage constraint is given", () => {
    const range = { fromIso: iso(now - 120 * DAY), toIso: iso(now) }
    expect(clipRangeToCoverage({ range })).toEqual(range)
    expect(clipRangeToCoverage({ range, coverageFromIso })).toEqual(range)
    expect(clipRangeToCoverage({ range, coverageFromIso: "not-a-date", coverageToIso })).toEqual(range)
  })
})
