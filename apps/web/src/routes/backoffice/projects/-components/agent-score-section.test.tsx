// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type {
  AdminAgentScoreDto,
  AdminAgentScoreHistoryPointDto,
  AdminAgentScoreSnapshotDto,
} from "../../../../domains/admin/agent-score.functions.ts"
import { AgentScoreSection } from "./agent-score-section.tsx"

// echarts needs a real canvas and `Tabs` measures its indicator; neither exists under jsdom, and
// neither is what these tests are about — the chart is stubbed down to its accessible label.
vi.mock("@repo/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/ui")>()),
  Chart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}))

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterEach(cleanup)

const historyPoint = (date: string, value: number): AdminAgentScoreHistoryPointDto => ({
  date,
  score: value,
  scoringVersion: "agent-score-v1",
  windowDays: 14,
  eligibleSessionCount: 1_234,
})

const history: readonly AdminAgentScoreHistoryPointDto[] = [
  historyPoint("2026-09-01", 62),
  historyPoint("2026-09-14", 70.1),
  historyPoint("2026-09-15", 71.8),
  historyPoint("2026-09-17", 74.4),
]

// The ring reads its evidence from `explanation` only while a segment is hovered, which is covered
// by the customer-page tests that own that interaction — here it stays null so the fixture is the
// shape of the payload, not a transcript of one.
const snapshot: AdminAgentScoreSnapshotDto = {
  date: "2026-09-17",
  score: 74.4,
  interval: { lower: 70.2, upper: 78.6 },
  dimensions: {
    outcome: { score: 81.1, interval: { lower: 77, upper: 85 } },
    reliability: { score: 68.2, interval: { lower: 62, upper: 74 } },
    cost: { score: 76.3, interval: { lower: 72, upper: 80 } },
    speed: { score: 70.4, interval: { lower: 65, upper: 75 } },
    safety: { score: 79.5, interval: { lower: 75, upper: 84 } },
  },
  scoringVersion: "agent-score-v1",
  windowDays: 14,
  eligibleSessionCount: 1_234,
  policyCap: null,
  createdAt: "2026-09-17T04:05:00.000Z",
}

const score: AdminAgentScoreDto = {
  customerAccessEnabled: false,
  currentDate: "2026-09-18",
  history,
  dimensionWeights: { outcome: 0.35, reliability: 0.25, cost: 0.15, speed: 0.15, safety: 0.1 },
  snapshot,
  explanation: null,
}

describe("AgentScoreSection", () => {
  it("shows the vitality ring to staff while customer access is disabled", () => {
    render(<AgentScoreSection agentScore={score} />)

    expect(screen.getByText("Customer access disabled")).toBeDefined()
    expect(screen.getByLabelText("Agent vitality and dimension scores")).toBeDefined()
    expect(screen.getByText("74")).toBeDefined()
    expect(screen.getByText("14 days")).toBeDefined()
    expect(screen.getByText("1,234")).toBeDefined()
    expect(screen.getAllByText("Sep 17, 2026")).toHaveLength(2)
    expect(screen.getByText("3.6% up")).toBeDefined()
  })

  it("leaves the per-dimension breakdown and cause list to the ring", () => {
    render(<AgentScoreSection agentScore={score} />)

    // Every dimension is on the ring as a labelled arc, so the old tile row and cause list are gone.
    expect(screen.getByRole("button", { name: "Outcome quality: 81" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Safety: 80" })).toBeDefined()
    expect(screen.queryByText("What affected this score")).toBeNull()
    expect(screen.queryByText("Outcome")).toBeNull()
    expect(screen.queryByText("Safety")).toBeNull()
  })

  it("charts the published history beside the ring and counts the gaps", () => {
    render(<AgentScoreSection agentScore={score} />)

    expect(screen.getByText("Score evolution")).toBeDefined()
    expect(screen.getByLabelText("Agent Score over the last 30 days")).toBeDefined()
    expect(screen.getByText("4 of 30 days published")).toBeDefined()
  })

  it("switches the charted range", () => {
    render(<AgentScoreSection agentScore={score} />)

    fireEvent.click(screen.getByText("7d"))

    expect(screen.getByLabelText("Agent Score over the last 7 days")).toBeDefined()
    // 2026-09-01 falls outside the seven days ending 2026-09-18, so it drops out of the count.
    expect(screen.getByText("3 of 7 days published")).toBeDefined()
  })

  it("does not draw a line through a single published day", () => {
    render(<AgentScoreSection agentScore={{ ...score, history: [historyPoint("2026-09-17", 74.4)] }} />)

    expect(screen.getByText("Not enough history to draw a trend.")).toBeDefined()
    expect(screen.getByText("Only one day in this range has a published score.")).toBeDefined()
    expect(screen.queryByLabelText(/Agent Score over the last/)).toBeNull()
  })

  it("warns when the charted range crosses scoring versions", () => {
    render(
      <AgentScoreSection
        agentScore={{
          ...score,
          history: [
            { ...historyPoint("2026-09-15", 71.8), scoringVersion: "agent-score-v0" },
            historyPoint("2026-09-17", 74.4),
          ],
        }}
      />,
    )

    expect(screen.getByText(/crosses scoring versions/)).toBeDefined()
  })

  it("surfaces a policy cap only when one was applied", () => {
    const { rerender } = render(<AgentScoreSection agentScore={score} />)
    expect(screen.queryByText(/Policy cap applied/)).toBeNull()

    rerender(<AgentScoreSection agentScore={{ ...score, snapshot: { ...snapshot, policyCap: 60 } }} />)
    expect(screen.getByText("Policy cap applied at 60.")).toBeDefined()
  })

  it("explains when no score has been published", () => {
    render(<AgentScoreSection agentScore={{ ...score, snapshot: null }} />)

    expect(screen.getByText("No published Agent Score yet.")).toBeDefined()
    expect(screen.getByText(/may not yet meet the session and dimension requirements/)).toBeDefined()
  })
})
