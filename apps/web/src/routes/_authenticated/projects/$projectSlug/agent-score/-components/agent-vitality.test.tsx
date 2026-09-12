// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { AgentScoreRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"
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

describe("AgentVitality", () => {
  it("does not compare against an older snapshot when the previous score is zero", () => {
    const previousSnapshot = { ...snapshot, date: "2026-09-11", score: 0 }
    const olderSnapshot = { ...snapshot, date: "2026-09-10", score: 50 }

    render(
      <AgentVitality
        date={snapshot.date}
        snapshot={snapshot}
        history={[olderSnapshot, previousSnapshot]}
        dimensionWeights={dimensionWeights}
        isLoading={false}
      />,
    )

    expect(screen.queryByText(/up|down/)).toBeNull()
  })

  it("emphasizes a hovered dimension and restores the composite over the center", () => {
    const { container } = render(
      <AgentVitality
        date={snapshot.date}
        snapshot={snapshot}
        history={[]}
        dimensionWeights={dimensionWeights}
        isLoading={false}
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
