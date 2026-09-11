// @vitest-environment jsdom
import type { SessionAssessment } from "@domain/agent-score"
import { SessionId } from "@domain/shared"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
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
    {
      scoreDimension: "cost",
      ...counts,
      observedMicrocents: 1_000_000,
      measuredAvoidableMicrocents: 250_000,
      families: [
        { family: "spend", measurementState: "unmeasured", observedItemCount: 0, metrics: [] },
        { family: "context", measurementState: "unmeasured", observedItemCount: 0, metrics: [] },
        { family: "tools", measurementState: "unmeasured", observedItemCount: 0, metrics: [] },
        { family: "memory", measurementState: "unmeasured", observedItemCount: 0, metrics: [] },
        { family: "recovery", measurementState: "unmeasured", observedItemCount: 0, metrics: [] },
      ],
    },
    { scoreDimension: "speed", ...counts, observedCriticalPathNs: 2_000_000_000, measuredAvoidableNs: 500_000_000 },
    { scoreDimension: "safety", ...counts, exposureCount: 0, successfulDefenseCount: 1, confirmedHarmCount: 0 },
  ],
  items: [
    {
      id: "item-1",
      evidenceKey: "item-1",
      groupKey: "issue:tool-repetition",
      label: "Repeated tool calls",
      occurredAt: new Date("2026-01-01T10:05:00.000Z"),
      source: "metric",
      polarity: "negative",
      impactLevel: "medium",
      metricId: "tools.thrashing",
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
      destinations: [{ kind: "sessionMessage", traceId: "trace-1", messageIndex: 2 }],
    },
    {
      id: "signal-item",
      evidenceKey: "signal-item",
      groupKey: "signal:signal-1",
      label: "Tool response did not match a call",
      source: "signal",
      polarity: "negative",
      impactLevel: "medium",
      signalIds: ["signal-1"],
      scoreIds: ["score-1"],
      occurrenceCount: 1,
      effects: [
        {
          scoreDimension: "reliability",
          role: "operationalIncident",
          direction: "negative",
          measurement: "observed",
          benchmarkUse: "direct",
        },
      ],
      anchors: [{ kind: "signal", signalId: "signal-1" }],
      destinations: [{ kind: "signal", signalId: "signal-1" }],
    },
    {
      id: "raw-item-1",
      evidenceKey: "raw-item-1",
      groupKey: "judgment:legacy-score-1",
      label: "Legacy quality score",
      description: "Stored before benchmark semantics were available.",
      source: "score",
      polarity: "unknown",
      impactLevel: "low",
      signalIds: [],
      scoreIds: ["legacy-score-1"],
      occurrenceCount: 1,
      effects: [],
      anchors: [{ kind: "score", scoreId: "legacy-score-1" }],
      destinations: [{ kind: "score", scoreId: "legacy-score-1" }],
    },
  ],
  coverage: {
    readers: [
      {
        readerId: "reader-1",
        label: "Tool-call failures",
        scoreDimensions: ["reliability", "cost", "speed"],
        status: "examined",
        findingCount: 2,
      },
    ],
  },
}

describe("SessionAssessmentContent", () => {
  it("separates directional findings and only shows useful metrics", () => {
    render(<SessionAssessmentContent assessment={assessment} />)

    expect(screen.getByText("Needs attention")).toBeTruthy()
    expect(screen.getByText("Needs interpretation")).toBeTruthy()
    expect(screen.getByText("Positive evidence")).toBeTruthy()
    expect(screen.getByText("Repeated tool calls")).toBeTruthy()
    expect(screen.getByText("Tool response did not match a call")).toBeTruthy()
    expect(screen.getByText("Legacy quality score")).toBeTruthy()
    expect(screen.getByText("Avoidable cost")).toBeTruthy()
    expect(screen.getByText("Avoidable time")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Positive evidence" }))
    expect(screen.getByText("Succeeded")).toBeTruthy()
    expect(screen.queryByText(/total/)).toBeNull()
    expect(screen.queryByText(/Coverage:/)).toBeNull()
  })

  it("reads an avoidable amount against the spend and critical path it came out of", () => {
    render(<SessionAssessmentContent assessment={assessment} />)

    expect(screen.getByText("$0.0025 of $0.01").className).not.toContain("font-bold")
    expect(screen.getByText("500.0ms of 2.00s").className).not.toContain("font-bold")
  })

  it("states an avoidable amount alone when the session reported no denominator", () => {
    const withoutDenominators = {
      ...assessment,
      dimensions: assessment.dimensions.map((summary) => {
        if (summary.scoreDimension === "cost") return { ...summary, observedMicrocents: undefined }
        if (summary.scoreDimension === "speed") return { ...summary, observedCriticalPathNs: undefined }
        return summary
      }),
    }
    render(<SessionAssessmentContent assessment={withoutDenominators} />)

    expect(screen.getByText("$0.0025")).toBeTruthy()
    expect(screen.getByText("500.0ms")).toBeTruthy()
  })

  it("opens grouped issue evidence and links directly to a signal", () => {
    const onOpenDestination = vi.fn()
    render(<SessionAssessmentContent assessment={assessment} onOpenDestination={onOpenDestination} />)

    fireEvent.click(screen.getByRole("button", { name: "Repeated tool calls" }))
    fireEvent.click(screen.getByRole("button", { name: "View in conversation" }))
    fireEvent.click(screen.getByRole("button", { name: "Open signal Tool response did not match a call" }))

    expect(onOpenDestination.mock.calls.map(([destination]) => destination.kind)).toEqual(["sessionMessage", "signal"])
    expect(screen.queryByText(/Msg /)).toBeNull()
  })

  it("aggregates repeated issues and keeps pagination explicit", () => {
    const repeated = assessment.items[0]
    if (!repeated) throw new Error("expected assessment fixture item")
    const onLoadMore = vi.fn()
    const largeAssessment: SessionAssessment = {
      ...assessment,
      items: Array.from({ length: 101 }, (_, index) => ({
        ...repeated,
        id: `item-${index}`,
        evidenceKey: `item-${index}`,
      })),
    }

    render(<SessionAssessmentContent assessment={largeAssessment} hasMore onLoadMore={onLoadMore} />)

    expect(screen.getAllByText("Repeated tool calls")).toHaveLength(1)
    expect(screen.getByText("303 occurrences")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Load more findings" }))
    expect(onLoadMore).toHaveBeenCalledOnce()
  })

  it("does not turn unmeasured Cost families into findings", () => {
    const unmeasured: SessionAssessment = {
      ...assessment,
      items: [],
      dimensions: assessment.dimensions.map((summary) => {
        if (summary.scoreDimension === "outcome") return { ...summary, taskOutcome: undefined }
        if (summary.scoreDimension === "reliability") return { ...summary, completion: "undetermined" as const }
        if (summary.scoreDimension === "safety") return { ...summary, successfulDefenseCount: 0 }
        return summary.scoreDimension === "cost"
          ? {
              ...summary,
              measuredAvoidableMicrocents: undefined,
              estimatedAvoidableMicrocents: undefined,
              families: summary.families.map((family) => ({
                ...family,
                measurementState: family.family === "context" ? ("unmeasured" as const) : ("notApplicable" as const),
              })),
            }
          : summary
      }),
    }

    render(<SessionAssessmentContent assessment={unmeasured} />)

    expect(screen.queryByText("Context cost")).toBeNull()
    expect(screen.queryByText("not measured")).toBeNull()
  })

  it("shows raw Cost readings without duplicating structural defect finding groups", () => {
    const structuralFinding = assessment.items[1]
    if (!structuralFinding) throw new Error("expected assessment fixture item")
    const withCostEvidence: SessionAssessment = {
      ...assessment,
      items: [
        {
          ...structuralFinding,
          id: "structural-defect",
          evidenceKey: "structural-defect",
          groupKey: "issue:tool-structure:unknown-id:tool-response-did-not-match-a-call",
          source: "metric",
          metricId: "tools.structural_defect",
          signalIds: [],
          scoreIds: [],
          occurrenceCount: 3,
          anchors: [],
          destinations: [],
        },
      ],
      dimensions: assessment.dimensions.map((summary) => {
        if (summary.scoreDimension === "outcome") return { ...summary, taskOutcome: undefined }
        if (summary.scoreDimension === "reliability") return { ...summary, completion: "undetermined" as const }
        if (summary.scoreDimension === "safety") return { ...summary, successfulDefenseCount: 0 }
        return summary.scoreDimension === "cost"
          ? {
              ...summary,
              measuredAvoidableMicrocents: undefined,
              families: summary.families.map((family) =>
                family.family === "tools"
                  ? {
                      ...family,
                      measurementState: "measured",
                      metrics: [
                        {
                          metricId: "tools.repeated_call",
                          family: "tools",
                          aggregation: "eventRate",
                          measurementState: "measured",
                          rawUnit: "toolCalls",
                          rawValue: 2 / 7,
                          eligibleUnits: 7,
                          adverseUnits: 2,
                          evidence: "confirmed",
                          limitations: [],
                        },
                        {
                          metricId: "tools.thrashing",
                          family: "tools",
                          aggregation: "eventRate",
                          measurementState: "measured",
                          rawUnit: "toolCalls",
                          rawValue: 0,
                          eligibleUnits: 7,
                          adverseUnits: 0,
                          evidence: "confirmed",
                          limitations: [],
                        },
                        {
                          metricId: "tools.structural_defect",
                          family: "tools",
                          aggregation: "eventRate",
                          measurementState: "measured",
                          rawUnit: "toolCalls",
                          rawValue: 3 / 7,
                          eligibleUnits: 7,
                          adverseUnits: 3,
                          evidence: "confirmed",
                          limitations: [],
                        },
                      ],
                    }
                  : family,
              ),
            }
          : summary
      }),
    }

    render(<SessionAssessmentContent assessment={withCostEvidence} />)

    expect(screen.getByText("Repeated tool calls")).toBeTruthy()
    expect(screen.getByText("2 of 7 tool calls")).toBeTruthy()
    expect(screen.getByText("Tool response did not match a call")).toBeTruthy()
    expect(screen.getByText("3 occurrences")).toBeTruthy()
    expect(screen.queryByText("Recovered tool-call defects")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Positive evidence" }))
    expect(screen.getByText("Tool-call loops")).toBeTruthy()
    expect(screen.getByText("0 of 7 tool calls")).toBeTruthy()
  })

  it("does not imply a positive result when nothing meaningful was evaluated", () => {
    const notEvaluated: SessionAssessment = {
      ...assessment,
      items: [],
      dimensions: assessment.dimensions.map((summary) => {
        if (summary.scoreDimension === "outcome") return { ...summary, taskOutcome: undefined }
        if (summary.scoreDimension === "reliability") return { ...summary, completion: "undetermined" as const }
        if (summary.scoreDimension === "cost") {
          return {
            ...summary,
            measuredAvoidableMicrocents: undefined,
            estimatedAvoidableMicrocents: undefined,
            families: summary.families.map((family) => ({
              ...family,
              measurementState: "notApplicable" as const,
            })),
          }
        }
        if (summary.scoreDimension === "speed") {
          return { ...summary, measuredAvoidableNs: undefined, estimatedAvoidableNs: undefined }
        }
        if (summary.scoreDimension === "safety") {
          return { ...summary, successfulDefenseCount: 0, coverage: "notExamined" as const }
        }
        return summary
      }),
    }

    render(<SessionAssessmentContent assessment={notEvaluated} />)

    expect(screen.getByText("No findings were detected for this session.")).toBeTruthy()
    expect(screen.queryByText("Positive evidence")).toBeNull()
    expect(screen.queryByText("No harm observed")).toBeNull()
  })
})
