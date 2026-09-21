// @vitest-environment jsdom
import { ProjectId } from "@domain/shared"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AgentScoreRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"
import {
  getProjectAgentScore,
  getProjectAgentScoreComputation,
  getProjectAgentScoreExplanation,
  getProjectAgentScoreHistory,
  refreshProjectAgentScore,
} from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { AgentScorePage } from "./agent-score-page.tsx"

vi.mock("../../../../../../domains/agent-score/agent-score.functions.ts", () => ({
  getProjectAgentScore: vi.fn(),
  getProjectAgentScoreComputation: vi.fn(),
  getProjectAgentScoreExplanation: vi.fn(),
  getProjectAgentScoreHistory: vi.fn(),
  refreshProjectAgentScore: vi.fn(),
}))

vi.mock("@repo/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/ui")>()),
  Chart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}))

const project = { id: ProjectId("p".repeat(24)), slug: "test-project" }
const weights = { outcome: 0.35, reliability: 0.25, cost: 0.15, speed: 0.15, safety: 0.1 }
const interval = { lower: 60, upper: 80 }
const snapshot: AgentScoreRecord = {
  date: "2026-09-19",
  score: 70,
  interval,
  dimensions: Object.fromEntries(Object.keys(weights).map((dimension) => [dimension, { score: 70, interval }])),
  scoringVersion: "agent-score-v2-provisional",
  windowDays: 7,
  eligibleSessionCount: 500,
  policyCap: null,
  createdAt: "2026-09-19T04:00:00Z",
}

function Page() {
  const [date, setDate] = useState<string>()
  return <AgentScorePage key={date ?? "latest"} project={project} selectedDate={date} onDateChange={setDate} />
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.mocked(getProjectAgentScore).mockImplementation(async ({ data }) => {
    const date = data.date ?? snapshot.date
    const selected = date === snapshot.date ? snapshot : null
    return { date, available: selected !== null, snapshot: selected, dimensionWeights: weights }
  })
  vi.mocked(getProjectAgentScoreHistory).mockResolvedValue([snapshot])
  vi.mocked(getProjectAgentScoreExplanation).mockResolvedValue({ status: "notComputed", explanation: null })
  vi.mocked(getProjectAgentScoreComputation).mockResolvedValue({
    date: snapshot.date,
    status: "idle",
    marker: "none",
  })
  vi.mocked(refreshProjectAgentScore).mockResolvedValue({ enqueued: false, date: snapshot.date })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe("AgentScorePage date selection", () => {
  it("shows a durable computation status, keeps the score visible, and disables refresh", async () => {
    vi.mocked(getProjectAgentScoreComputation).mockResolvedValue({
      date: snapshot.date,
      status: "computing",
      marker: "run-1:running:open",
    })

    renderPage()

    await screen.findByText("Computing Agent Score")
    expect(screen.getByText("This can take several minutes. You can leave this page and return later.")).toBeDefined()
    expect(screen.getByText("Score evolution")).toBeDefined()
    expect((screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("reloads displayed data when refresh does not enqueue a workflow", async () => {
    renderPage()
    await screen.findByText("Score evolution")
    const scoreCalls = vi.mocked(getProjectAgentScore).mock.calls.length
    const historyCalls = vi.mocked(getProjectAgentScoreHistory).mock.calls.length
    const explanationCalls = vi.mocked(getProjectAgentScoreExplanation).mock.calls.length

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }))

    await waitFor(() => expect(vi.mocked(getProjectAgentScore).mock.calls.length).toBeGreaterThan(scoreCalls))
    expect(vi.mocked(getProjectAgentScoreHistory).mock.calls.length).toBeGreaterThan(historyCalls)
    expect(vi.mocked(getProjectAgentScoreExplanation).mock.calls.length).toBeGreaterThan(explanationCalls)
  })

  it("shows the latest published date and its trend when today has no score", async () => {
    renderPage()
    await screen.findByText("Score evolution")
    expect((screen.getByLabelText("Score date (UTC)") as HTMLInputElement).value).toBe(snapshot.date)
    expect(screen.queryByText("Requirements for this date")).toBeNull()
    expect(getProjectAgentScoreHistory).toHaveBeenCalledWith({ data: { projectId: project.id, date: snapshot.date } })
    expect(getProjectAgentScoreExplanation).toHaveBeenCalledWith({
      data: { projectId: project.id, date: snapshot.date },
    })
  })

  it("does not keep the old score visible while an unscored date loads", async () => {
    renderPage()
    await screen.findByText("Score evolution")
    let finish: (() => void) | undefined
    vi.mocked(getProjectAgentScore).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ date: "2026-09-18", available: false, snapshot: null, dimensionWeights: weights })
        }),
    )
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }))
    await screen.findByLabelText("Loading Agent Score")
    expect(screen.queryByText("Score evolution")).toBeNull()
    await waitFor(() => expect(finish).toBeDefined())
    finish?.()
    await screen.findByText("No score was published for this date.")
    expect((screen.getByLabelText("Score date (UTC)") as HTMLInputElement).value).toBe("2026-09-18")
    expect(getProjectAgentScoreExplanation).toHaveBeenCalledWith({
      data: { projectId: project.id, date: "2026-09-18" },
    })
    expect(screen.getAllByText("Evidence is not available for this date.")).toHaveLength(5)
  })

  it("shows today's date when no score exists", async () => {
    const today = new Date().toISOString().slice(0, 10)
    vi.mocked(getProjectAgentScore).mockResolvedValue({
      date: today,
      available: false,
      snapshot: null,
      dimensionWeights: weights,
    })
    vi.mocked(getProjectAgentScoreHistory).mockResolvedValue([])
    renderPage()
    await screen.findByText("No score was published for this date.")
    expect((screen.getByLabelText("Score date (UTC)") as HTMLInputElement).value).toBe(today)
    expect(screen.getByText("Requirements for this date")).toBeDefined()
  })
})
