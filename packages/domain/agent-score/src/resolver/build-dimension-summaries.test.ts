import { describe, expect, it } from "vitest"
import type { SessionAssessmentItem } from "../entities/session-assessment.ts"
import { buildSessionDimensionSummaries } from "./build-dimension-summaries.ts"

const item = (effects: SessionAssessmentItem["effects"]): SessionAssessmentItem => ({
  id: "item-1",
  evidenceKey: "item-1",
  label: "Finding",
  source: "metric",
  signalIds: [],
  scoreIds: [],
  occurrenceCount: 1,
  effects,
  anchors: [],
  destinations: [],
})

describe("buildSessionDimensionSummaries", () => {
  it("always returns all five dimensions and counts direction separately from measurement", () => {
    const summaries = buildSessionDimensionSummaries({
      items: [
        item([
          {
            scoreDimension: "reliability",
            role: "operationalIncident",
            direction: "context",
            measurement: "observed",
            benchmarkUse: "direct",
            impact: { kind: "incident", status: "recovered" },
          },
          {
            scoreDimension: "cost",
            role: "spendEfficiency",
            direction: "negative",
            measurement: "notMeasured",
            benchmarkUse: "attributionOnly",
          },
        ]),
      ],
      coverage: { reliability: "complete", cost: "partial" },
    })

    expect(summaries.map((summary) => summary.scoreDimension)).toEqual([
      "outcome",
      "reliability",
      "cost",
      "speed",
      "safety",
    ])
    expect(summaries.find((summary) => summary.scoreDimension === "reliability")).toMatchObject({
      evidenceCounts: { positive: 0, negative: 0, context: 1 },
      measurementCounts: { observed: 1, estimated: 0, notMeasured: 0 },
      coverage: "complete",
      completion: "undetermined",
      recoveredIncidentCount: 1,
    })
    expect(summaries.find((summary) => summary.scoreDimension === "cost")).toMatchObject({
      evidenceCounts: { positive: 0, negative: 1, context: 0 },
      measurementCounts: { observed: 0, estimated: 0, notMeasured: 1 },
      coverage: "partial",
    })
  })

  it("distinguishes a measured zero from an unknown native value", () => {
    const withZero = buildSessionDimensionSummaries({ items: [], observedMicrocents: 0 })
    const unknown = buildSessionDimensionSummaries({ items: [] })

    expect(withZero.find((summary) => summary.scoreDimension === "cost")).toHaveProperty("observedMicrocents", 0)
    expect(unknown.find((summary) => summary.scoreDimension === "cost")).not.toHaveProperty("observedMicrocents")
    expect(withZero.find((summary) => summary.scoreDimension === "cost")).not.toHaveProperty(
      "measuredAvoidableMicrocents",
    )
  })

  it("sums only measured native impacts and reports terminal completion", () => {
    const summaries = buildSessionDimensionSummaries({
      items: [
        item([
          {
            scoreDimension: "reliability",
            role: "completionOutcome",
            direction: "negative",
            measurement: "observed",
            benchmarkUse: "direct",
            impact: { kind: "completion", status: "terminalFailure" },
          },
          {
            scoreDimension: "cost",
            role: "spendEfficiency",
            direction: "negative",
            measurement: "observed",
            benchmarkUse: "direct",
            impact: { kind: "spend", observedMicrocents: 12, avoidableMicrocents: 5 },
          },
        ]),
      ],
    })

    expect(summaries.find((summary) => summary.scoreDimension === "reliability")).toMatchObject({
      completion: "terminalFailure",
    })
    expect(summaries.find((summary) => summary.scoreDimension === "cost")).toMatchObject({
      measuredAvoidableMicrocents: 5,
    })
    expect(summaries.some((summary) => "score" in summary)).toBe(false)
  })
})
