import { describe, expect, it } from "vitest"
import {
  clipRangeToLensCoverage,
  joinLensCoverageDays,
  resolveLensCoverage,
  type TaxonomyLensCoverageDay,
} from "./lens-coverage.ts"

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

const covered = (iso: string, count: number): TaxonomyLensCoverageDay => ({
  day: day(iso),
  assignedCount: count,
  clusterableCount: count,
})

describe("resolveLensCoverage", () => {
  // The reporting project from LAT-862: 986 assignments over Aug 3 - Aug 11 with
  // 39 of Aug 3's 74 rows orphaned by a rebuild, against real project volume.
  const reportedLens: TaxonomyLensCoverageDay[] = [
    { day: day("2026-08-01"), assignedCount: 0, clusterableCount: 26 },
    { day: day("2026-08-02"), assignedCount: 0, clusterableCount: 48 },
    { day: day("2026-08-03"), assignedCount: 35, clusterableCount: 155 },
    covered("2026-08-05", 217),
    covered("2026-08-06", 212),
    covered("2026-08-07", 185),
    covered("2026-08-08", 39),
    covered("2026-08-09", 48),
    covered("2026-08-10", 159),
    { day: day("2026-08-11"), assignedCount: 52, clusterableCount: 72 },
  ]

  it("clips to the fully covered band, excluding the ramp", () => {
    const coverage = resolveLensCoverage(reportedLens, { now: new Date("2026-08-11T18:00:00.000Z") })

    expect(coverage).toEqual({ from: day("2026-08-05"), to: new Date("2026-08-11T18:00:00.000Z") })
  })

  it("keeps quiet-but-complete days inside the band", () => {
    // Aug 8 and Aug 9 are 39 and 48 sessions against 217 the day before; low
    // volume, full coverage. A count-based cut would break the band here.
    const coverage = resolveLensCoverage(reportedLens, { now: new Date("2026-08-11T18:00:00.000Z") })

    expect(coverage?.from).toEqual(day("2026-08-05"))
  })

  it("does not clip a lens whose plateau sits below full coverage", () => {
    // The gardening sample is capped, so a busy project is covered uniformly at a
    // fraction. That is a scaled trend, not a ramp, and must stay selectable.
    const capped: TaxonomyLensCoverageDay[] = [
      { day: day("2026-08-05"), assignedCount: 214, clusterableCount: 900 },
      { day: day("2026-08-06"), assignedCount: 214, clusterableCount: 950 },
      { day: day("2026-08-07"), assignedCount: 214, clusterableCount: 880 },
      { day: day("2026-08-08"), assignedCount: 214, clusterableCount: 910 },
    ]

    const coverage = resolveLensCoverage(capped, { now: new Date("2026-08-08T12:00:00.000Z") })

    expect(coverage?.from).toEqual(day("2026-08-05"))
  })

  it("treats a day with no traffic as neither covered nor missing", () => {
    const withGap: TaxonomyLensCoverageDay[] = [
      covered("2026-08-05", 100),
      { day: day("2026-08-06"), assignedCount: 0, clusterableCount: 0 },
      covered("2026-08-07", 100),
    ]

    const coverage = resolveLensCoverage(withGap, { now: new Date("2026-08-07T12:00:00.000Z") })

    expect(coverage?.from).toEqual(day("2026-08-05"))
  })

  it("keeps the newest day even when it is still partial", () => {
    const partialToday: TaxonomyLensCoverageDay[] = [
      covered("2026-08-09", 100),
      covered("2026-08-10", 100),
      { day: day("2026-08-11"), assignedCount: 3, clusterableCount: 90 },
    ]

    const coverage = resolveLensCoverage(partialToday, { now: new Date("2026-08-11T02:00:00.000Z") })

    expect(coverage).toEqual({ from: day("2026-08-09"), to: new Date("2026-08-11T02:00:00.000Z") })
  })

  it("ends at the last day with membership, not at now", () => {
    const stale: TaxonomyLensCoverageDay[] = [covered("2026-08-05", 100), covered("2026-08-06", 100)]

    const coverage = resolveLensCoverage(stale, { now: new Date("2026-08-11T12:00:00.000Z") })

    expect(coverage?.to).toEqual(new Date("2026-08-07T00:00:00.000Z"))
  })

  it("is null when the slice has no membership at all", () => {
    const empty: TaxonomyLensCoverageDay[] = [{ day: day("2026-08-05"), assignedCount: 0, clusterableCount: 40 }]

    expect(resolveLensCoverage(empty, { now: new Date("2026-08-05T12:00:00.000Z") })).toBeNull()
    expect(resolveLensCoverage([], { now: new Date("2026-08-05T12:00:00.000Z") })).toBeNull()
  })

  it("stops at a mid-band collapse rather than reaching past it", () => {
    const eroded: TaxonomyLensCoverageDay[] = [
      covered("2026-08-05", 100),
      { day: day("2026-08-06"), assignedCount: 5, clusterableCount: 100 },
      covered("2026-08-07", 100),
      covered("2026-08-08", 100),
    ]

    const coverage = resolveLensCoverage(eroded, { now: new Date("2026-08-08T12:00:00.000Z") })

    expect(coverage?.from).toEqual(day("2026-08-07"))
  })
})

describe("joinLensCoverageDays", () => {
  it("outer-joins both series into one ascending day series", () => {
    const joined = joinLensCoverageDays(
      [
        { day: day("2026-08-06"), count: 12 },
        { day: day("2026-08-05"), count: 7 },
      ],
      [
        { day: day("2026-08-05"), count: 20 },
        { day: day("2026-08-07"), count: 30 },
      ],
    )

    expect(joined).toEqual([
      { day: day("2026-08-05"), assignedCount: 7, clusterableCount: 20 },
      { day: day("2026-08-06"), assignedCount: 12, clusterableCount: 0 },
      { day: day("2026-08-07"), assignedCount: 0, clusterableCount: 30 },
    ])
  })

  it("folds sub-day timestamps into their UTC day", () => {
    const joined = joinLensCoverageDays(
      [
        { day: new Date("2026-08-05T04:00:00.000Z"), count: 2 },
        { day: new Date("2026-08-05T22:00:00.000Z"), count: 3 },
      ],
      [],
    )

    expect(joined).toEqual([{ day: day("2026-08-05"), assignedCount: 5, clusterableCount: 0 }])
  })
})

describe("clipRangeToLensCoverage", () => {
  const coverage = { from: day("2026-08-05"), to: new Date("2026-08-11T18:00:00.000Z") }

  it("intersects a wider selection down to the covered band", () => {
    expect(clipRangeToLensCoverage({ from: day("2026-04-01"), to: day("2026-08-12") }, coverage)).toEqual({
      from: coverage.from,
      to: coverage.to,
    })
  })

  it("resolves an unbounded read to exactly the covered band", () => {
    expect(clipRangeToLensCoverage({}, coverage)).toEqual({ from: coverage.from, to: coverage.to })
  })

  it("leaves a narrower selection alone", () => {
    const inside = { from: day("2026-08-07"), to: day("2026-08-09") }

    expect(clipRangeToLensCoverage(inside, coverage)).toEqual(inside)
  })

  it("collapses a selection entirely outside coverage instead of inverting it", () => {
    const clipped = clipRangeToLensCoverage({ from: day("2026-04-01"), to: day("2026-05-01") }, coverage)

    expect(clipped).toEqual({ from: coverage.from, to: coverage.from })
  })

  it("passes the range through untouched when there is no coverage constraint", () => {
    const range = { from: day("2026-04-01"), to: day("2026-08-12") }

    expect(clipRangeToLensCoverage(range, null)).toEqual(range)
  })
})
