import type { IncidentTrend } from "@domain/notifications"
import { describe, expect, it } from "vitest"
import { INCIDENT_SEVERITY_HEX } from "../../alerts/incident-markers.ts"
import { buildIncidentTrendSvg } from "./render-incident-trend.tsx"

const HOUR_12_MS = 12 * 60 * 60 * 1000

const baseTrend = (overrides: Partial<IncidentTrend> = {}): IncidentTrend => ({
  bucketDurationMs: HOUR_12_MS,
  points: [
    { t: "2026-05-06T00:00:00.000Z", count: 2, threshold: 3 },
    { t: "2026-05-06T12:00:00.000Z", count: 5, threshold: null },
    { t: "2026-05-07T00:00:00.000Z", count: 9, threshold: 7 },
    { t: "2026-05-07T12:00:00.000Z", count: 4, threshold: 6 },
  ],
  marker: { startedAt: "2026-05-07T00:00:00.000Z", endedAt: null, severity: "high" },
  ...overrides,
})

describe("buildIncidentTrendSvg", () => {
  it("renders an empty-state frame when there are no points", () => {
    const svg = buildIncidentTrendSvg(baseTrend({ points: [], marker: undefined }))
    expect(svg).toContain("No trend data")
    expect(svg).not.toContain("<rect x=")
  })

  it("renders bars, the dashed expectation curve, and day-axis labels", () => {
    const svg = buildIncidentTrendSvg(baseTrend())
    expect(svg).not.toContain("No trend data")
    // Occurrence bars.
    expect(svg).toContain("<rect x=")
    // Threshold curve uses the dedicated "4 3" dash (distinct from the "3 3" guide lines).
    expect(svg).toContain('stroke-dasharray="4 3"')
    expect(svg).toContain("<path d=")
    // Day-axis labels.
    expect(svg).toContain("<text")
  })

  it("draws the incident severity band and start dot in the severity color", () => {
    const svg = buildIncidentTrendSvg(baseTrend())
    expect(svg).toContain(INCIDENT_SEVERITY_HEX.high)
    // Band tint.
    expect(svg).toContain('fill-opacity="0.16"')
    // Start dot.
    expect(svg).toContain("<circle")
  })

  it("omits the dashed curve for a brand-new issue with no seasonal history", () => {
    const svg = buildIncidentTrendSvg(
      baseTrend({
        points: [
          { t: "2026-05-06T00:00:00.000Z", count: 2, threshold: null },
          { t: "2026-05-07T00:00:00.000Z", count: 9, threshold: null },
        ],
      }),
    )
    // No threshold curve…
    expect(svg).not.toContain('stroke-dasharray="4 3"')
    // …but the bars still render.
    expect(svg).toContain("<rect x=")
  })
})
