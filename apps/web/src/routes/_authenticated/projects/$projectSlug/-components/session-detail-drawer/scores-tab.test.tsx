// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ScoresTab } from "./scores-tab.tsx"

const state = vi.hoisted(() => ({
  scores: { data: { items: [{ id: "represented" }, { id: "other" }] }, isLoading: false, isError: false },
  assessment: {
    data: undefined as { items: { scoreIds: string[] }[] } | undefined,
    isLoading: true,
    isError: false,
    isFetching: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: () => {},
  },
}))

vi.mock("../../../../../../domains/scores/scores.collection.ts", () => ({
  useScoresBySession: () => state.scores,
}))
vi.mock("../../../../../../domains/session-assessments/session-assessments.collection.ts", () => ({
  useSessionAssessment: () => state.assessment,
}))
vi.mock("../../../../../../domains/sessions/sessions.collection.ts", () => ({
  useSessionSignals: () => ({ data: [] }),
}))
vi.mock("../../../../../../domains/annotations/annotations.collection.ts", () => ({
  useUpdateAnnotation: () => ({ isPending: false, mutate: () => {} }),
}))
vi.mock("./session-assessment.tsx", () => ({
  SessionAssessmentSection: ({ isLoading, isError }: { isLoading: boolean; isError: boolean }) => (
    <div>{isLoading ? "Loading findings" : isError ? "Findings error" : "Findings ready"}</div>
  ),
}))
vi.mock("../scores/score-list.tsx", () => ({
  ScoreList: ({
    scores,
    intro,
    showCreateForm,
    isLoading,
    isError,
  }: {
    scores: { id: string }[]
    intro: ReactNode
    showCreateForm: boolean
    isLoading: boolean
    isError: boolean
  }) => (
    <div>
      {intro}
      {isLoading ? <div>Loading score list</div> : null}
      {isError ? <div>Scores error</div> : null}
      {showCreateForm ? <div>Feedback form</div> : null}
      {scores.map((score) => (
        <div key={score.id}>{score.id}</div>
      ))}
    </div>
  ),
}))

const props = {
  projectId: "project",
  sessionId: "session",
  traceIds: ["trace"],
  latestTraceId: "trace",
  traceNumberById: new Map<string, number>(),
  onOpenInConversation: () => {},
  onOpenTrace: () => {},
  onOpenSpan: () => {},
  onOpenSignal: () => {},
}

afterEach(() => {
  cleanup()
  state.scores.isLoading = false
  state.scores.isError = false
  state.assessment.data = undefined
  state.assessment.isLoading = true
  state.assessment.isError = false
  state.assessment.isFetching = false
  state.assessment.isFetchingNextPage = false
})

const resolveAssessment = () => {
  state.assessment.isLoading = false
  state.assessment.data = { items: [{ scoreIds: ["represented"] }] }
}

describe("ScoresTab initial loading", () => {
  it("withholds provisional scores until findings classify them", () => {
    const view = render(<ScoresTab {...props} />)
    expect(screen.getByText("Loading findings")).toBeTruthy()
    expect(screen.queryByText("Loading score list")).toBeNull()
    expect(screen.queryByText("represented")).toBeNull()
    expect(screen.queryByText("other")).toBeNull()
    resolveAssessment()
    view.rerender(<ScoresTab {...props} />)
    expect(screen.getByText("Findings ready")).toBeTruthy()
    expect(screen.queryByText("represented")).toBeNull()
    expect(screen.getByText("other")).toBeTruthy()
    expect(screen.queryByText("Missing something?")).toBeNull()
    expect(screen.queryByText("Feedback form")).toBeNull()
  })

  it("waits for scores when findings arrive first", () => {
    resolveAssessment()
    state.scores.isLoading = true
    const view = render(<ScoresTab {...props} />)
    expect(screen.getByText("Loading findings")).toBeTruthy()
    expect(screen.queryByText("other")).toBeNull()
    state.scores.isLoading = false
    view.rerender(<ScoresTab {...props} />)
    expect(screen.getByText("other")).toBeTruthy()
  })

  it("keeps scores accessible when findings fail", () => {
    state.assessment.isLoading = false
    state.assessment.isError = true
    render(<ScoresTab {...props} />)
    expect(screen.getByText("Findings error")).toBeTruthy()
    expect(screen.getByText("represented")).toBeTruthy()
    expect(screen.getByText("other")).toBeTruthy()
  })

  it("shows the scores error after findings settle", () => {
    resolveAssessment()
    state.scores.isError = true
    render(<ScoresTab {...props} />)
    expect(screen.getByText("Findings ready")).toBeTruthy()
    expect(screen.getByText("Scores error")).toBeTruthy()
    expect(screen.queryByText("Loading findings")).toBeNull()
  })

  it("retains loaded scores during background refresh and pagination", () => {
    resolveAssessment()
    state.assessment.isFetching = true
    state.assessment.isFetchingNextPage = true
    render(<ScoresTab {...props} />)
    expect(screen.queryByText("Loading findings")).toBeNull()
    expect(screen.getByText("other")).toBeTruthy()
  })
})
