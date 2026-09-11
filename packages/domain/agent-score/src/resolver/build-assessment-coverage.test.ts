import type { FlaggerScreeningDecision } from "@domain/flaggers"
import { describe, expect, it } from "vitest"
import { buildSessionAssessmentCoverage } from "./build-assessment-coverage.ts"

const decision = (overrides: Partial<FlaggerScreeningDecision> = {}): FlaggerScreeningDecision =>
  ({
    decisionId: "a".repeat(64),
    organizationId: "org-1",
    projectId: "project-1",
    sessionId: "session-1",
    flaggerSlug: "task-failure",
    analysisHash: "b".repeat(64),
    scoringArtifactVersion: "v1",
    attempt: 1,
    version: 1,
    selected: true,
    reason: "ordinary-sample",
    inclusionProbability: 0.1,
    hintKinds: [],
    retentionDays: 90,
    outcome: "unmatched",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  }) as FlaggerScreeningDecision

describe("buildSessionAssessmentCoverage", () => {
  it("distinguishes examined with no findings from no examination", () => {
    const result = buildSessionAssessmentCoverage({
      readers: [
        {
          readerId: "tools.call_failed",
          label: "Tool failures",
          scoreDimensions: ["reliability"],
          applicable: true,
          findingCount: 0,
          readableCount: 1,
          totalCount: 1,
        },
      ],
      screeningDecisions: [decision({ selected: false, outcome: undefined })],
    })

    expect(result.coverage.readers).toEqual([
      expect.objectContaining({ readerId: "tools.call_failed", status: "examined", findingCount: 0 }),
      expect.objectContaining({ readerId: "flagger:task-failure", status: "notExamined", limitation: "notSelected" }),
    ])
    expect(result.dimensions.reliability).toBe("complete")
    expect(result.dimensions.outcome).toBe("notExamined")
  })

  it("reports partial readability and derives partial dimension coverage", () => {
    const result = buildSessionAssessmentCoverage({
      readers: [
        {
          readerId: "spans.finish_failure",
          label: "Finish reasons",
          scoreDimensions: ["outcome", "reliability"],
          applicable: true,
          findingCount: 1,
          readableCount: 2,
          totalCount: 3,
          limitation: "unmappedTelemetry",
        },
      ],
      screeningDecisions: [],
    })

    expect(result.coverage.readers[0]).toMatchObject({
      status: "partiallyExamined",
      readableCount: 2,
      totalCount: 3,
      limitation: "unmappedTelemetry",
    })
    expect(result.dimensions.outcome).toBe("partial")
    expect(result.dimensions.safety).toBe("notExamined")
  })

  it("maps public skip, rate-limit, execution, pending, and not-applicable states", () => {
    const decisions = [
      decision({ flaggerSlug: "refusal", reason: "skipped", selected: false, outcome: undefined }),
      decision({ flaggerSlug: "frustration", reason: "rate-limited", selected: false, outcome: undefined }),
      decision({ flaggerSlug: "bluffing", selected: true, outcome: "error" }),
      decision({ flaggerSlug: "incompletion", selected: true, outcome: undefined }),
      decision({ flaggerSlug: "laziness", selected: true, outcome: "notApplicable" }),
    ]
    const result = buildSessionAssessmentCoverage({ readers: [], screeningDecisions: decisions })

    expect(
      result.coverage.readers.map((reader) => (reader.status === "notExamined" ? reader.limitation : reader.status)),
    ).toEqual(["skipped", "rateLimited", "executionFailed", "pending", "notApplicable"])
  })
})
