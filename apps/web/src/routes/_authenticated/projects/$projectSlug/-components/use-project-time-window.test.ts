import { describe, expect, it } from "vitest"
import {
  applyTimeFilterChange,
  applyTimeRangeSelect,
  computeHistogramRangeOverride,
  isAllTimeRead,
} from "./use-project-time-window.ts"

const DAY = 24 * 60 * 60 * 1000
const now = Date.UTC(2026, 6, 10, 12, 0, 0)
const iso = (ms: number) => new Date(ms).toISOString()
const RANGE_30D = 30 * 24 * 60 * 60

describe("isAllTimeRead", () => {
  it("true when there is no lower bound", () => {
    expect(isAllTimeRead({})).toBe(true)
    expect(isAllTimeRead({ status: [{ op: "eq", value: "error" }] })).toBe(true)
    expect(isAllTimeRead({ startTime: [{ op: "lte", value: iso(now) }] })).toBe(true)
  })

  it("false when a lower bound (gte) is set", () => {
    expect(isAllTimeRead({ startTime: [{ op: "gte", value: iso(now - 5 * DAY) }] })).toBe(false)
  })
})

describe("applyTimeFilterChange", () => {
  it("sets gte + lte for a bounded range", () => {
    const from = iso(now - 5 * DAY)
    const to = iso(now)
    expect(applyTimeFilterChange({}, from, to).startTime).toEqual([
      { op: "gte", value: from },
      { op: "lte", value: to },
    ])
  })

  it("sets only gte when there is no upper bound", () => {
    const from = iso(now - 5 * DAY)
    expect(applyTimeFilterChange({}, from, undefined).startTime).toEqual([{ op: "gte", value: from }])
  })

  it("clears back to All time (drops startTime) when both bounds are absent", () => {
    const result = applyTimeFilterChange({ startTime: [{ op: "gte", value: iso(now) }] })
    expect("startTime" in result).toBe(false)
  })

  it("preserves non-time filters", () => {
    const result = applyTimeFilterChange({ status: [{ op: "eq", value: "error" }] }, iso(now - 1 * DAY), undefined)
    expect(result.status).toEqual([{ op: "eq", value: "error" }])
  })
})

describe("applyTimeRangeSelect", () => {
  it("sets gte + lte from a brush selection", () => {
    const range = { from: iso(now - 2 * DAY), to: iso(now) }
    expect(applyTimeRangeSelect({}, range).startTime).toEqual([
      { op: "gte", value: range.from },
      { op: "lte", value: range.to },
    ])
  })

  it("clearing the brush returns to All time (drops startTime)", () => {
    const result = applyTimeRangeSelect({ startTime: [{ op: "gte", value: iso(now) }] }, null)
    expect("startTime" in result).toBe(false)
  })
})

describe("computeHistogramRangeOverride", () => {
  it("returns undefined when not All time", () => {
    expect(computeHistogramRangeOverride(false, iso(now), RANGE_30D)).toBeUndefined()
  })

  it("returns undefined when there is no latest activity", () => {
    expect(computeHistogramRangeOverride(true, null, RANGE_30D)).toBeUndefined()
  })

  it("anchors a span ending at the latest activity", () => {
    const last = iso(now - 40 * DAY)
    expect(computeHistogramRangeOverride(true, last, RANGE_30D)).toEqual({
      rangeStartIso: iso(now - 70 * DAY),
      rangeEndIso: last,
    })
  })

  it("returns undefined for an unparseable timestamp", () => {
    expect(computeHistogramRangeOverride(true, "not-a-date", RANGE_30D)).toBeUndefined()
  })
})
