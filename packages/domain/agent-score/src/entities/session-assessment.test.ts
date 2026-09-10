import { describe, expect, it } from "vitest"
import {
  SESSION_ASSESSMENT_PAGE_SIZE,
  sessionAssessmentSchema,
  sessionDimensionEffectSchema,
  sessionDimensionSummarySchema,
  sessionEvidenceAnchorSchema,
  sessionEvidenceImpactSchema,
  sessionReaderCoverageSchema,
} from "./session-assessment.ts"

describe("session assessment contracts", () => {
  it("accepts a multi-dimensional item and all five dimension summaries", () => {
    const result = sessionAssessmentSchema.parse({
      sessionId: "session-1",
      items: [
        {
          id: "tool:call-1:error",
          evidenceKey: "tool:call-1:error",
          groupKey: "signal:signal-1",
          label: "Tool call failed and recovered",
          source: "metric",
          metricId: "tools.call_failed",
          signalIds: ["signal-1"],
          scoreIds: ["score-1"],
          occurrenceCount: 1,
          polarity: "negative",
          impactLevel: "medium",
          effects: [
            {
              scoreDimension: "reliability",
              role: "operationalIncident",
              direction: "context",
              measurement: "observed",
              benchmarkUse: "direct",
              impact: { kind: "incident", status: "recovered", sameSubjectRecovered: true },
            },
            {
              scoreDimension: "cost",
              role: "spendEfficiency",
              direction: "negative",
              measurement: "observed",
              benchmarkUse: "direct",
              impact: { kind: "spend", observedMicrocents: 20, avoidableMicrocents: 20 },
            },
          ],
          anchors: [{ kind: "toolCall", traceId: "trace-1", toolCallId: "call-1", toolName: "search" }],
          destinations: [
            { kind: "toolCall", traceId: "trace-1", toolCallId: "call-1" },
            { kind: "signal", signalId: "signal-1" },
          ],
        },
      ],
      nextCursor: "opaque-cursor",
      dimensions: [
        {
          scoreDimension: "outcome",
          evidenceCounts: { positive: 0, negative: 0, context: 0 },
          measurementCounts: { observed: 0, estimated: 0, notMeasured: 0 },
          coverage: "notExamined",
        },
        {
          scoreDimension: "reliability",
          evidenceCounts: { positive: 0, negative: 0, context: 1 },
          measurementCounts: { observed: 1, estimated: 0, notMeasured: 0 },
          coverage: "complete",
          completion: "usable",
          recoveredIncidentCount: 1,
          unrecoveredIncidentCount: 0,
        },
        {
          scoreDimension: "cost",
          evidenceCounts: { positive: 0, negative: 1, context: 0 },
          measurementCounts: { observed: 1, estimated: 0, notMeasured: 0 },
          coverage: "partial",
          observedMicrocents: 100,
          measuredAvoidableMicrocents: 20,
          families: [
            { family: "spend", measurementState: "unmeasured", observedItemCount: 0, metrics: [] },
            { family: "context", measurementState: "unmeasured", observedItemCount: 0, metrics: [] },
            { family: "tools", measurementState: "unmeasured", observedItemCount: 0, metrics: [] },
            { family: "memory", measurementState: "unmeasured", observedItemCount: 0, metrics: [] },
            { family: "recovery", measurementState: "unmeasured", observedItemCount: 0, metrics: [] },
          ],
        },
        {
          scoreDimension: "speed",
          evidenceCounts: { positive: 0, negative: 0, context: 0 },
          measurementCounts: { observed: 0, estimated: 0, notMeasured: 0 },
          coverage: "notExamined",
        },
        {
          scoreDimension: "safety",
          evidenceCounts: { positive: 0, negative: 0, context: 0 },
          measurementCounts: { observed: 0, estimated: 0, notMeasured: 0 },
          coverage: "notExamined",
          exposureCount: 0,
          successfulDefenseCount: 0,
          confirmedHarmCount: 0,
        },
      ],
      coverage: {
        readers: [
          {
            readerId: "tools.call_failed",
            label: "Failed tool calls",
            scoreDimensions: ["reliability", "cost", "speed"],
            status: "examined",
            findingCount: 1,
          },
        ],
      },
    })

    expect(result.items[0]?.effects).toHaveLength(2)
    expect(result.dimensions.map((dimension) => dimension.scoreDimension)).toEqual([
      "outcome",
      "reliability",
      "cost",
      "speed",
      "safety",
    ])
    expect(SESSION_ASSESSMENT_PAGE_SIZE).toBe(100)
  })

  it("keeps roles paired with their dimension", () => {
    expect(() =>
      sessionDimensionEffectSchema.parse({
        scoreDimension: "cost",
        role: "taskOutcome",
        direction: "negative",
        measurement: "observed",
        benchmarkUse: "direct",
      }),
    ).toThrow()
  })

  it("requires message positions and bounded impact values", () => {
    expect(() => sessionEvidenceAnchorSchema.parse({ kind: "message", traceId: "trace-1" })).toThrow()
    expect(() =>
      sessionEvidenceImpactSchema.parse({ kind: "taskOutcome", verdict: "success", probability: 1.1 }),
    ).toThrow()
    expect(() => sessionEvidenceImpactSchema.parse({ kind: "spend", observedMicrocents: -1 })).toThrow()
  })

  it("distinguishes all reader coverage states", () => {
    expect(
      [
        { status: "examined", findingCount: 0 },
        {
          status: "partiallyExamined",
          findingCount: 1,
          readableCount: 2,
          totalCount: 3,
          limitation: "missingTelemetry",
        },
        { status: "notExamined", limitation: "skipped" },
        { status: "notApplicable" },
      ].map((coverage) =>
        sessionReaderCoverageSchema.parse({
          readerId: "reader",
          label: "Reader",
          scoreDimensions: ["outcome"],
          ...coverage,
        }),
      ),
    ).toHaveLength(4)
  })

  it("carries a Cost family evaluation on Cost evidence only", () => {
    const costEvaluation = {
      family: "context",
      measurementState: "measured",
      rawValue: 0.42,
      rawUnit: "inputTokens",
      nativeImpact: { unit: "inputTokens", point: 1_200, upper: 2_000, interpretation: "identificationBound" },
    }

    expect(
      sessionDimensionEffectSchema.parse({
        scoreDimension: "cost",
        role: "spendEfficiency",
        direction: "negative",
        measurement: "estimated",
        benchmarkUse: "modeled",
        costEvaluation,
      }),
    ).toMatchObject({ costEvaluation })
    expect(() =>
      sessionDimensionEffectSchema.parse({
        scoreDimension: "speed",
        role: "criticalPathEfficiency",
        direction: "negative",
        measurement: "estimated",
        benchmarkUse: "modeled",
        costEvaluation,
      }),
    ).toThrow()
  })

  it("requires every Cost family exactly once in the Cost dimension summary", () => {
    const summary = {
      scoreDimension: "cost",
      evidenceCounts: { positive: 0, negative: 0, context: 0 },
      measurementCounts: { observed: 0, estimated: 0, notMeasured: 0 },
      coverage: "notExamined",
      families: [
        { family: "spend", measurementState: "unmeasured", observedItemCount: 0, metrics: [] },
        { family: "context", measurementState: "partial", observedItemCount: 1, metrics: [] },
        { family: "tools", measurementState: "notApplicable", observedItemCount: 0, metrics: [] },
        { family: "memory", measurementState: "unmeasured", observedItemCount: 0, metrics: [] },
        { family: "recovery", measurementState: "measured", observedItemCount: 2, metrics: [] },
      ],
    }

    expect(sessionDimensionSummarySchema.parse(summary)).toMatchObject({ families: summary.families })
    expect(
      sessionDimensionSummarySchema.safeParse({ ...summary, families: summary.families.slice(0, 4) }).success,
    ).toBe(false)
    expect(
      sessionDimensionSummarySchema.safeParse({
        ...summary,
        families: [
          ...summary.families,
          { family: "spend", measurementState: "measured", observedItemCount: 1, metrics: [] },
        ],
      }).success,
    ).toBe(false)
    expect(sessionDimensionSummarySchema.safeParse({ ...summary, families: [] }).success).toBe(false)
  })
})
