// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { AgentScoreExplanationRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { ScoreTrend } from "./score-trend.tsx"

afterEach(cleanup)

type Explanation = NonNullable<AgentScoreExplanationRecord["explanation"]>

const sessionFloorExplanation = {
  window: { stepDays: 28 },
  readiness: {
    sessionRequirement: {
      kind: "threshold",
      metric: "eligibleSessions",
      current: 86,
      required: 200,
      comparison: "atLeast",
      unit: "sessions",
      met: false,
    },
    dimensions: [],
  },
} as unknown as Explanation

const dimensionExplanation = {
  window: { stepDays: 28 },
  publication: {
    status: "withheld",
    dimensions: [
      { scoreDimension: "outcome", coverage: "unmeasured", unmeasuredReason: "examinedFloor" },
      { scoreDimension: "reliability", coverage: "measured" },
      { scoreDimension: "cost", coverage: "measured" },
      { scoreDimension: "speed", coverage: "measured" },
      { scoreDimension: "safety", coverage: "unmeasured", unmeasuredReason: "examinedFloor" },
    ],
  },
  readiness: {
    sessionRequirement: {
      kind: "threshold",
      metric: "eligibleSessions",
      current: 400,
      required: 200,
      comparison: "atLeast",
      unit: "sessions",
      met: true,
    },
    dimensions: [
      {
        scoreDimension: "outcome",
        requirements: [
          {
            kind: "threshold",
            metric: "outcomeEvaluations",
            current: 12,
            required: 100,
            comparison: "atLeast",
            unit: "sessions",
            met: false,
          },
        ],
      },
      { scoreDimension: "reliability", requirements: [] },
      { scoreDimension: "cost", requirements: [] },
      { scoreDimension: "speed", requirements: [] },
      {
        scoreDimension: "safety",
        requirements: [
          {
            kind: "threshold",
            metric: "safetyEvaluations",
            current: 42,
            required: 1_000,
            comparison: "atLeast",
            unit: "sessions",
            met: false,
          },
        ],
      },
    ],
  },
} as unknown as Explanation

describe("ScoreTrend", () => {
  it("uses the empty chart surface to show session progress", () => {
    render(
      <ScoreTrend
        endDate="2026-09-12"
        history={[]}
        explanation={sessionFloorExplanation}
        isCurrentSnapshot={false}
        isLoading={false}
      />,
    )

    expect(screen.getByText("Requirements for this date")).toBeDefined()
    expect(screen.getByText("Collecting automatically")).toBeDefined()
    expect(screen.getByText("86 / 200 eligible sessions")).toBeDefined()
    expect(screen.getByText(/114 more sessions needed in the selected 28-day window/i)).toBeDefined()
    expect(screen.getByRole("progressbar", { name: "86 of 200 eligible sessions" })).toBeDefined()
    expect(screen.queryByText("7d")).toBeNull()
  })

  it("shows all dimensions and the primary blocker for each unavailable score", () => {
    render(
      <ScoreTrend
        endDate="2026-09-12"
        history={[]}
        explanation={dimensionExplanation}
        isCurrentSnapshot={false}
        isLoading={false}
      />,
    )

    expect(screen.getByText("3 of 5 ready")).toBeDefined()
    for (const label of ["Outcome quality", "Reliability", "Cost", "Speed", "Safety"]) {
      expect(screen.getByText(label)).toBeDefined()
    }
    expect(screen.getByText("12 / 100 evaluated")).toBeDefined()
    expect(screen.getByText("42 / 1,000 evaluated")).toBeDefined()
    expect(screen.getAllByText("Ready")).toHaveLength(3)
    expect(screen.getByText(/Scores publish when all five dimensions are ready/)).toBeDefined()
  })

  it("explains when readiness has not been calculated", () => {
    render(
      <ScoreTrend endDate="2026-09-12" history={[]} explanation={null} isCurrentSnapshot={false} isLoading={false} />,
    )

    expect(screen.getByText("Evidence has not been calculated yet")).toBeDefined()
    expect(screen.getByText("Refresh to evaluate sessions for this date.")).toBeDefined()
  })

  it("shows selected-day requirements when that date has no score", () => {
    render(
      <ScoreTrend
        endDate="2026-09-12"
        history={[{ date: "2026-09-11", score: 66 } as never]}
        explanation={sessionFloorExplanation}
        isCurrentSnapshot={false}
        isLoading={false}
      />,
    )

    expect(screen.getByText("Requirements for this date")).toBeDefined()
    expect(screen.getByText("Sep 12, 2026 UTC")).toBeDefined()
    expect(screen.queryByText(/today/)).toBeNull()
    expect(screen.queryByText("Score evolution")).toBeNull()
  })
})
