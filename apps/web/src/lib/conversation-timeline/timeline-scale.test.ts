import { describe, expect, it } from "vitest"
import {
  buildTimelineScale,
  formatGapLabel,
  GAP_TIMELINE_MS,
  segmentAt,
  timelineToPct,
  timelineToWall,
  wallToTimeline,
} from "./timeline-scale.ts"

const T0 = 1_700_000_000_000

describe("buildTimelineScale", () => {
  it("returns an empty scale for no windows", () => {
    const scale = buildTimelineScale([])
    expect(scale.segments).toEqual([])
    expect(scale.totalTimelineMs).toBe(0)
  })

  it("keeps a single window linear with no gaps", () => {
    const scale = buildTimelineScale([{ startMs: T0, endMs: T0 + 10_000 }])
    expect(scale.segments).toHaveLength(1)
    expect(scale.segments[0]).toMatchObject({ kind: "active", timelineStartMs: 0, timelineEndMs: 10_000 })
    expect(scale.totalTimelineMs).toBe(10_000)
  })

  it("compresses gaps above the threshold to a constant timeline duration", () => {
    const scale = buildTimelineScale([
      { startMs: T0, endMs: T0 + 10_000 },
      { startMs: T0 + 130_000, endMs: T0 + 140_000 },
    ])
    expect(scale.segments.map((s) => s.kind)).toEqual(["active", "gap", "active"])
    expect(scale.segments[1]).toMatchObject({
      timelineStartMs: 10_000,
      timelineEndMs: 10_000 + GAP_TIMELINE_MS,
      gapLabel: "+2m",
    })
    expect(scale.totalTimelineMs).toBe(20_000 + GAP_TIMELINE_MS)
  })

  it("merges windows separated by sub-threshold gaps into one active segment", () => {
    const scale = buildTimelineScale([
      { startMs: T0, endMs: T0 + 10_000 },
      { startMs: T0 + 12_000, endMs: T0 + 20_000 },
    ])
    expect(scale.segments).toHaveLength(1)
    expect(scale.totalTimelineMs).toBe(20_000)
  })

  it("merges overlapping windows (clock skew tolerance)", () => {
    const scale = buildTimelineScale([
      { startMs: T0, endMs: T0 + 10_000 },
      { startMs: T0 + 5_000, endMs: T0 + 8_000 },
    ])
    expect(scale.segments).toHaveLength(1)
    expect(scale.totalTimelineMs).toBe(10_000)
  })

  it("drops zero and negative duration windows", () => {
    const scale = buildTimelineScale([{ startMs: T0, endMs: T0 }])
    expect(scale.segments).toEqual([])
  })
})

describe("coordinate mapping", () => {
  const scale = buildTimelineScale([
    { startMs: T0, endMs: T0 + 10_000 },
    { startMs: T0 + 70_000, endMs: T0 + 80_000 },
  ])

  it("round-trips timeline → wall → timeline inside active segments", () => {
    for (const t of [0, 4_000, 10_000, 10_000 + GAP_TIMELINE_MS / 2, 12_000, scale.totalTimelineMs]) {
      expect(wallToTimeline(scale, timelineToWall(scale, t))).toBeCloseTo(t, 6)
    }
  })

  it("maps gap wall time proportionally into the constant gap window", () => {
    expect(wallToTimeline(scale, T0 + 40_000)).toBeCloseTo(10_000 + GAP_TIMELINE_MS / 2, 6)
    expect(timelineToWall(scale, 10_000 + GAP_TIMELINE_MS / 2)).toBeCloseTo(T0 + 40_000, 6)
  })

  it("clamps out-of-range values", () => {
    expect(wallToTimeline(scale, T0 - 5_000)).toBe(0)
    expect(wallToTimeline(scale, T0 + 100_000)).toBe(scale.totalTimelineMs)
    expect(timelineToWall(scale, -5)).toBe(T0)
    expect(timelineToWall(scale, scale.totalTimelineMs + 5)).toBe(T0 + 80_000)
  })

  it("computes percentages from the timeline domain", () => {
    expect(timelineToPct(scale, 0)).toBe(0)
    expect(timelineToPct(scale, scale.totalTimelineMs)).toBe(100)
    expect(timelineToPct(buildTimelineScale([]), 10)).toBe(0)
  })

  it("finds the segment at a timeline position", () => {
    expect(segmentAt(scale, 5_000)?.kind).toBe("active")
    expect(segmentAt(scale, 10_500)?.kind).toBe("gap")
    expect(segmentAt(scale, scale.totalTimelineMs)?.kind).toBe("active")
  })
})

describe("formatGapLabel", () => {
  it("formats compact durations", () => {
    expect(formatGapLabel(45_000)).toBe("+45s")
    expect(formatGapLabel(120_000)).toBe("+2m")
    expect(formatGapLabel(150_000)).toBe("+2m 30s")
    expect(formatGapLabel(2 * 3_600_000 + 13 * 60_000)).toBe("+2h 13m")
    expect(formatGapLabel(3_600_000)).toBe("+1h")
  })
})
