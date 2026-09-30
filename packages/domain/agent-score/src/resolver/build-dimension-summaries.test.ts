import { describe, expect, it } from "vitest"
import type { SessionCostMetricEvaluation } from "../entities/cost-evidence.ts"
import type { CostMetricReading } from "../entities/cost-metric-reading.ts"
import type { SessionAssessmentItem, SessionDimensionSummary } from "../entities/session-assessment.ts"
import { buildSessionDimensionSummaries } from "./build-dimension-summaries.ts"

const item = (effects: SessionAssessmentItem["effects"]): SessionAssessmentItem => ({
  id: "item-1",
  evidenceKey: "item-1",
  groupKey: "issue:item-1",
  label: "Finding",
  source: "metric",
  polarity: "negative",
  impactLevel: "medium",
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

describe("Cost family summaries", () => {
  const costEffect = (costEvaluation: SessionCostMetricEvaluation): SessionAssessmentItem["effects"][number] => ({
    scoreDimension: "cost",
    role: "spendEfficiency",
    direction: "negative",
    measurement: "estimated",
    benchmarkUse: "modeled",
    costEvaluation,
  })
  const costSummary = (summaries: readonly SessionDimensionSummary[]) =>
    summaries.find((summary) => summary.scoreDimension === "cost")
  const familyStates = (summaries: readonly SessionDimensionSummary[]) => {
    const cost = costSummary(summaries)
    return cost?.scoreDimension === "cost"
      ? Object.fromEntries(cost.families.map((family) => [family.family, family.measurementState]))
      : {}
  }
  const reading = (overrides: Partial<CostMetricReading> = {}): CostMetricReading => ({
    metricId: "tools.repeated_call",
    family: "tools",
    rawUnit: "toolCalls",
    aggregation: "eventRate",
    applicability: "applicable",
    readability: "readable",
    rawValue: 0.2,
    eligibleUnits: 10,
    adverseUnits: 2,
    observations: [{ atomId: "toolCall:call-1", eligibleUnits: 10, adverseUnits: 2 }],
    evidence: "confirmed",
    limitations: [],
    ...overrides,
  })

  it("summarizes all five families as unmeasured before any Cost reader exists", () => {
    const cost = costSummary(buildSessionDimensionSummaries({ items: [] }))

    expect(cost?.scoreDimension === "cost" && cost.families).toEqual([
      { family: "spend", measurementState: "unmeasured", observedItemCount: 0, metrics: [] },
      { family: "context", measurementState: "unmeasured", observedItemCount: 0, metrics: [] },
      { family: "tools", measurementState: "unmeasured", observedItemCount: 0, metrics: [] },
      { family: "memory", measurementState: "unmeasured", observedItemCount: 0, metrics: [] },
      { family: "recovery", measurementState: "unmeasured", observedItemCount: 0, metrics: [] },
    ])
  })

  it("keeps not applicable distinct from unmeasured and measured legacy evidence", () => {
    const summaries = buildSessionDimensionSummaries({
      items: [
        item([costEffect({ family: "memory", measurementState: "notApplicable" })]),
        item([costEffect({ family: "tools", measurementState: "measured", rawValue: 0, rawUnit: "toolCalls" })]),
        item([costEffect({ family: "context", measurementState: "unmeasured" })]),
      ],
    })

    expect(familyStates(summaries)).toEqual({
      spend: "unmeasured",
      context: "unmeasured",
      tools: "measured",
      memory: "notApplicable",
      recovery: "unmeasured",
    })
  })

  it("publishes aggregate metric evidence without source observations or calibrated health", () => {
    const summaries = buildSessionDimensionSummaries({
      items: [],
      costReadings: [reading()],
    })
    const cost = costSummary(summaries)
    const tools =
      cost?.scoreDimension === "cost" ? cost.families.find((family) => family.family === "tools") : undefined

    expect(tools).toMatchObject({
      measurementState: "measured",
      metrics: [
        {
          metricId: "tools.repeated_call",
          rawValue: 0.2,
          eligibleUnits: 10,
          adverseUnits: 2,
          measurementState: "measured",
        },
      ],
    })
    expect(tools?.metrics[0]).not.toHaveProperty("observations")
    expect(tools?.metrics[0]).not.toHaveProperty("status")
    expect(tools?.metrics[0]).not.toHaveProperty("penalty")
  })

  it("marks a family partial when readable and unreadable metrics coexist", () => {
    const summaries = buildSessionDimensionSummaries({
      items: [],
      costReadings: [
        reading(),
        reading({
          metricId: "tools.thrashing",
          readability: "unreadable",
          rawValue: undefined,
          adverseUnits: undefined,
          observations: [],
          limitations: ["missingContent"],
        }),
      ],
    })

    expect(familyStates(summaries)).toMatchObject({ tools: "partial" })
  })

  it("emits no session-level Cost score", () => {
    const summaries = buildSessionDimensionSummaries({ items: [], observedMicrocents: 100 })

    expect(summaries.some((summary) => "score" in summary || "value" in summary)).toBe(false)
  })
})
