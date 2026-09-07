// @vitest-environment jsdom
import type { SessionAssessment } from "@domain/agent-score"
import { SessionId } from "@domain/shared"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { SessionAssessmentContent } from "./session-assessment.tsx"

afterEach(cleanup)

const counts = {
  evidenceCounts: { positive: 0, negative: 0, context: 0 },
  measurementCounts: { observed: 0, estimated: 0, notMeasured: 0 },
  coverage: "complete" as const,
}

const assessment: SessionAssessment = {
  sessionId: SessionId("session-1"),
  dimensions: [
    { scoreDimension: "outcome", ...counts, taskOutcome: { verdict: "success" } },
    {
      scoreDimension: "reliability",
      ...counts,
      completion: "usable",
      recoveredIncidentCount: 1,
      unrecoveredIncidentCount: 0,
    },
    { scoreDimension: "cost", ...counts, observedMicrocents: 1_000_000, measuredAvoidableMicrocents: 250_000 },
    { scoreDimension: "speed", ...counts, observedCriticalPathNs: 2_000_000_000, measuredAvoidableNs: 500_000_000 },
    { scoreDimension: "safety", ...counts, exposureCount: 0, successfulDefenseCount: 1, confirmedHarmCount: 0 },
  ],
  items: [
    {
      id: "item-1",
      evidenceKey: "item-1",
      label: "Repeated tool calls",
      source: "metric",
      signalIds: [],
      scoreIds: [],
      occurrenceCount: 3,
      effects: [
        {
          scoreDimension: "cost",
          role: "spendEfficiency",
          direction: "negative",
          measurement: "observed",
          benchmarkUse: "direct",
          impact: { kind: "spend", observedMicrocents: 1_000_000, avoidableMicrocents: 250_000 },
        },
      ],
      anchors: [],
      destinations: [],
    },
  ],
  coverage: {
    readers: [
      {
        readerId: "reader-1",
        label: "Tool-call failures",
        scoreDimensions: ["reliability", "cost", "speed"],
        status: "examined",
        findingCount: 1,
      },
    ],
  },
}

describe("SessionAssessmentContent", () => {
  it("renders all dimensions, native impacts, occurrences, and reader coverage", () => {
    render(<SessionAssessmentContent assessment={assessment} />)

    for (const dimension of ["Outcome", "Reliability", "Cost", "Speed", "Safety"]) {
      expect(screen.getAllByText(dimension).length).toBeGreaterThan(0)
    }
    expect(screen.getByText("Repeated tool calls")).toBeTruthy()
    expect(screen.getByText("3×")).toBeTruthy()
    expect(screen.getByText("Observed")).toBeTruthy()
    expect(screen.getAllByText(/avoidable/).length).toBeGreaterThan(0)
    expect(screen.getByText("Reader coverage: 1 examined")).toBeTruthy()
  })
})
