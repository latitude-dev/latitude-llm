import type { SessionAssessment } from "@domain/agent-score"
import { SessionId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import {
  SessionAssessmentQuerySchema,
  SessionAssessmentSchema,
  toSessionAssessmentResponse,
} from "./session-assessment.ts"

describe("session assessment response", () => {
  it("serializes evidence references without raw telemetry content", () => {
    const assessment = {
      sessionId: SessionId("session-1"),
      items: [
        {
          id: "finding-1",
          evidenceKey: "finding-1",
          groupKey: "issue:tool-failure:search",
          label: "Tool call failed",
          occurredAt: new Date("2026-01-01T12:34:56.000Z"),
          source: "metric",
          polarity: "negative",
          impactLevel: "medium",
          metricId: "tools.call_failed",
          signalIds: [],
          scoreIds: [],
          occurrenceCount: 1,
          effects: [],
          anchors: [
            {
              kind: "toolCall",
              traceId: "trace-1",
              toolCallId: "call-1",
              toolName: "search",
              arguments: { query: "private input" },
            },
          ],
          destinations: [{ kind: "toolCall", traceId: "trace-1", toolCallId: "call-1" }],
          rawContent: "private output",
        },
      ],
      dimensions: [
        {
          scoreDimension: "outcome",
          evidenceCounts: { positive: 0, negative: 0, context: 0 },
          measurementCounts: { observed: 0, estimated: 0, notMeasured: 0 },
          coverage: "notExamined",
        },
      ],
      coverage: { readers: [] },
    } as unknown as SessionAssessment

    const response = toSessionAssessmentResponse(assessment)

    expect(SessionAssessmentSchema.parse(response)).toEqual(response)
    expect(response.items[0]).not.toHaveProperty("rawContent")
    expect(response.items[0]?.anchors[0]).not.toHaveProperty("arguments")
    expect(response.items[0]?.occurredAt).toBe("2026-01-01T12:34:56.000Z")
  })

  it("exposes only cursor input and omits confidence or assessment filters", () => {
    expect(SessionAssessmentQuerySchema.keyof().options).toEqual(["cursor"])

    const assessment = {
      sessionId: SessionId("session-1"),
      items: [],
      dimensions: [],
      coverage: { readers: [], confidence: 0.9 },
      confidence: 0.9,
      filters: { polarity: "negative" },
    } as unknown as SessionAssessment
    const response = toSessionAssessmentResponse(assessment)

    expect(response).toEqual({ sessionId: "session-1", items: [], dimensions: [], coverage: { readers: [] } })
    expect(JSON.stringify(response)).not.toMatch(/confidence|filters/)
  })
})
