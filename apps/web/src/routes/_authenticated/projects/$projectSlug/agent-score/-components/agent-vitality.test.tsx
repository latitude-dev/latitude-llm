// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type {
  AgentScoreExplanationRecord,
  AgentScoreRecord,
} from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { AgentVitality } from "./agent-vitality.tsx"

afterEach(cleanup)

const interval = { lower: 50, upper: 80 }
const snapshot: AgentScoreRecord = {
  date: "2026-09-12",
  score: 66.3,
  interval,
  dimensions: {
    outcome: { score: 82.4, interval },
    reliability: { score: 71.2, interval },
    cost: { score: 58.1, interval },
    speed: { score: 63.5, interval },
    safety: { score: 90.6, interval },
  },
  scoringVersion: "agent-score-v1-provisional",
  windowDays: 7,
  eligibleSessionCount: 841,
  policyCap: null,
}

const dimensionWeights = { outcome: 0.35, reliability: 0.25, cost: 0.15, speed: 0.15, safety: 0.1 }

const belowFloorExplanation = {
  eligibleSessionCount: 86,
  window: { stepDays: 28 },
  publication: { status: "withheld", reason: "sessionFloor", sessionFloor: 200, dimensions: [] },
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
} as unknown as NonNullable<AgentScoreExplanationRecord["explanation"]>

const dimensionExplanation = {
  eligibleSessionCount: 400,
  window: { stepDays: 28 },
  publication: {
    status: "withheld",
    reason: "unmeasuredDimensions",
    sessionFloor: 200,
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
} as unknown as NonNullable<AgentScoreExplanationRecord["explanation"]>

describe("AgentVitality", () => {
  it("renders a score-shaped placeholder while loading", () => {
    render(
      <AgentVitality snapshot={null} history={undefined} dimensionWeights={undefined} isLoading explanation={null} />,
    )

    expect(screen.getByLabelText("Loading Agent Score").getAttribute("aria-busy")).toBe("true")
    expect(screen.queryByText("—")).toBeNull()
    expect(screen.queryByText(/No score published/)).toBeNull()
  })

  it("does not compare against an older snapshot when the previous score is zero", () => {
    const previousSnapshot = { ...snapshot, date: "2026-09-11", score: 0 }
    const olderSnapshot = { ...snapshot, date: "2026-09-10", score: 50 }

    render(
      <AgentVitality
        snapshot={snapshot}
        history={[olderSnapshot, previousSnapshot]}
        dimensionWeights={dimensionWeights}
        isLoading={false}
        explanation={null}
      />,
    )

    expect(screen.queryByText(/up|down/)).toBeNull()
  })

  it("explains how an unavailable score becomes available", () => {
    render(
      <AgentVitality
        snapshot={null}
        history={[]}
        dimensionWeights={dimensionWeights}
        isLoading={false}
        explanation={belowFloorExplanation}
      />,
    )

    expect(screen.getByText("Score readiness")).toBeDefined()
    expect(screen.getByText("86 of 200 eligible sessions")).toBeDefined()
    expect(screen.getByText(/114 more sessions are needed/i)).toBeDefined()
    expect(screen.getByRole("progressbar", { name: "86 of 200 eligible sessions" })).toBeDefined()
  })

  it("lists the exact requirements blocking score publication", () => {
    render(
      <AgentVitality
        snapshot={null}
        history={[]}
        dimensionWeights={dimensionWeights}
        isLoading={false}
        explanation={dimensionExplanation}
      />,
    )

    expect(screen.getByText("3 of 5 dimensions ready")).toBeDefined()
    expect(screen.getByText("Outcome quality")).toBeDefined()
    expect(screen.getByText("12 / 100")).toBeDefined()
    expect(screen.getByText("Safety")).toBeDefined()
    expect(screen.getByText("42 / 1,000")).toBeDefined()
  })

  it("emphasizes a hovered dimension and restores the composite over the center", () => {
    const { container } = render(
      <AgentVitality
        snapshot={snapshot}
        history={[]}
        dimensionWeights={dimensionWeights}
        isLoading={false}
        explanation={null}
      />,
    )
    const outcomeHitArea = container.querySelector('[data-ring-hit-area="outcome"]')
    const vitalityHitArea = container.querySelector('[data-ring-hit-area="vitality"]')
    const outcomeSegment = container.querySelector('[data-ring-segment="outcome"]')
    const vitalitySegment = container.querySelector('[data-ring-segment="vitality"]')

    expect(screen.getByText("Agent vitality")).toBeDefined()
    expect(screen.getByText("66.3")).toBeDefined()

    fireEvent.pointerEnter(outcomeHitArea as Element)

    expect(screen.getByText("Outcome quality")).toBeDefined()
    expect(screen.getByText("82.4")).toBeDefined()
    expect(outcomeSegment?.getAttribute("opacity")).toBe("1")
    expect(outcomeSegment?.querySelector("circle")?.getAttribute("stroke-width")).toBe("7")
    expect(vitalitySegment?.getAttribute("opacity")).toBe("0.2")

    fireEvent.pointerEnter(vitalityHitArea as Element)

    expect(screen.getByText("Agent vitality")).toBeDefined()
    expect(screen.getByText("66.3")).toBeDefined()
    expect(outcomeSegment?.getAttribute("opacity")).toBe("0.5")
    expect(vitalitySegment?.getAttribute("opacity")).toBe("1")
    expect(vitalitySegment?.querySelector("circle")?.getAttribute("stroke-width")).toBe("7")
  })
})
