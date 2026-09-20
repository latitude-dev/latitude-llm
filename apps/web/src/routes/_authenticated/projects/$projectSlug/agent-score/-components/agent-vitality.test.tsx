// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { AgentScoreRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { AgentVitality } from "./agent-vitality.tsx"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const interval = { lower: 50, upper: 80 }
const snapshot: AgentScoreRecord = {
  date: "2026-09-12",
  createdAt: "2026-09-12T04:30:00.000Z",
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
  it("renders a score-shaped placeholder while loading", () => {
    render(
      <AgentVitality explanation={null} snapshot={null} history={undefined} dimensionWeights={undefined} isLoading />,
    )

    expect(screen.getByLabelText("Loading Agent Score").getAttribute("aria-busy")).toBe("true")
    expect(screen.queryByText("—")).toBeNull()
    expect(screen.queryByText(/No score published/)).toBeNull()
  })

  it("does not compare snapshots from different scoring versions", () => {
    const previousSnapshot = { ...snapshot, date: "2026-09-11", score: 50 }
    const currentSnapshot = { ...snapshot, scoringVersion: "agent-score-v2-provisional" }

    render(
      <AgentVitality
        explanation={null}
        snapshot={currentSnapshot}
        history={[previousSnapshot]}
        dimensionWeights={dimensionWeights}
        isLoading={false}
      />,
    )

    expect(screen.queryByText(/up|down/)).toBeNull()
  })

  it("does not compare against an older snapshot when the previous score is zero", () => {
    const previousSnapshot = { ...snapshot, date: "2026-09-11", score: 0 }
    const olderSnapshot = { ...snapshot, date: "2026-09-10", score: 50 }

    render(
      <AgentVitality
        explanation={null}
        snapshot={snapshot}
        history={[olderSnapshot, previousSnapshot]}
        dimensionWeights={dimensionWeights}
        isLoading={false}
      />,
    )

    expect(screen.queryByText(/up|down/)).toBeNull()
  })

  it("keeps the score ring placeholder when a score is unavailable", () => {
    render(
      <AgentVitality
        explanation={null}
        snapshot={null}
        history={[]}
        dimensionWeights={dimensionWeights}
        isLoading={false}
      />,
    )

    expect(screen.getByText("Agent vitality")).toBeDefined()
    expect(screen.getByText("Score not ready")).toBeDefined()
    expect(screen.getByText("No score was published for this date.")).toBeDefined()
    expect(screen.getByText("—")).toBeDefined()
  })

  it("shows the selected snapshot date and computation timestamp", () => {
    render(
      <AgentVitality
        explanation={null}
        snapshot={snapshot}
        history={[]}
        dimensionWeights={dimensionWeights}
        isLoading={false}
      />,
    )

    expect(screen.getByText("Score date: Sep 12, 2026 UTC")).toBeDefined()
    expect(screen.getByText("Computed: Sep 12, 2026 at 4:30 AM UTC")).toBeDefined()
    expect(screen.queryByText("Latest available")).toBeNull()
    expect(screen.queryByText("No score was published for this date.")).toBeNull()
  })

  it("keeps the hover card open after the tooltip opening delay", () => {
    vi.useFakeTimers()
    const { container } = render(
      <AgentVitality
        explanation={null}
        snapshot={snapshot}
        history={[]}
        dimensionWeights={dimensionWeights}
        isLoading={false}
      />,
    )
    const outcomeHitArea = container.querySelector('[data-ring-hit-area="outcome"]') as Element

    act(() => {
      fireEvent.pointerEnter(outcomeHitArea)
      fireEvent.pointerMove(outcomeHitArea)
    })
    expect(screen.getByRole("tooltip").textContent).toContain("Outcome quality")

    act(() => vi.advanceTimersByTime(2_000))
    expect(screen.getByRole("tooltip").textContent).toContain("Outcome quality")

    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("tooltip")).toBeNull()
  })

  it("shows dimension details on hover while keeping the composite summary fixed", () => {
    const { container } = render(
      <AgentVitality
        explanation={null}
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

    expect(screen.getAllByText("Outcome quality")[0]).toBeDefined()
    expect(screen.getAllByText("82")[0]).toBeDefined()
    expect(outcomeSegment?.getAttribute("opacity")).toBe("1")
    expect(outcomeSegment?.querySelector("circle")?.getAttribute("stroke-width")).toBe("7")
    expect(vitalitySegment?.getAttribute("opacity")).toBe("0.2")

    expect(screen.getByText("66.3")).toBeDefined()
    expect(screen.getByText("Agent vitality")).toBeDefined()

    fireEvent.pointerLeave(container.querySelector("svg") as Element)
    expect(screen.queryByText("Outcome quality")).toBeNull()

    fireEvent.focus(vitalityHitArea as Element)

    expect(screen.getAllByText("Agent vitality")[0]).toBeDefined()
    expect(screen.getByText("66.3")).toBeDefined()
    expect(outcomeSegment?.getAttribute("opacity")).toBe("0.5")
    expect(vitalitySegment?.getAttribute("opacity")).toBe("1")
    expect(vitalitySegment?.querySelector("circle")?.getAttribute("stroke-width")).toBe("7")
  })
})
