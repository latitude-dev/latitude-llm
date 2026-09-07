import { OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { resolveFlaggerScreeningCoverage } from "./flagger-screening-coverage.ts"
import type { FlaggerScreeningDecision } from "./flagger-screening-decision.ts"

const makeDecision = (overrides: Partial<FlaggerScreeningDecision> = {}): FlaggerScreeningDecision => ({
  decisionId: "d".repeat(64),
  organizationId: OrganizationId("o".repeat(24)),
  projectId: ProjectId("p".repeat(24)),
  sessionId: SessionId("session-1"),
  flaggerSlug: "refusal",
  analysisHash: "a".repeat(64),
  scoringArtifactVersion: "flagger-screening-v1",
  attempt: 1,
  version: 1,
  selected: true,
  reason: "hinted",
  inclusionProbability: 1,
  hintKinds: ["pattern:refusal"],
  outcome: "matched",
  createdAt: new Date("2026-09-07T10:00:00.000Z"),
  retentionDays: 90,
  ...overrides,
})

describe("resolveFlaggerScreeningCoverage", () => {
  it("collapses every policy exclusion into skipped", () => {
    expect(
      resolveFlaggerScreeningCoverage(
        makeDecision({ selected: false, reason: "skipped", inclusionProbability: undefined, outcome: undefined }),
      ),
    ).toEqual({ status: "notExamined", limitation: "skipped" })
  })

  it("keeps sampling losses and rate limiting statistically distinct", () => {
    expect(
      resolveFlaggerScreeningCoverage(
        makeDecision({
          selected: false,
          reason: "ordinary-sample",
          inclusionProbability: 0.1,
          hintKinds: [],
          outcome: undefined,
        }),
      ),
    ).toEqual({
      status: "notExamined",
      limitation: "notSelected",
      selection: { method: "ordinary-sample", inclusionProbability: 0.1 },
    })
    expect(
      resolveFlaggerScreeningCoverage(makeDecision({ selected: false, reason: "rate-limited", outcome: undefined })),
    ).toEqual({
      status: "notExamined",
      limitation: "rateLimited",
      selection: { method: "hinted", inclusionProbability: 1 },
    })
  })

  it("distinguishes failed, pending, missing, and completed examination", () => {
    expect(resolveFlaggerScreeningCoverage(makeDecision({ outcome: "error" }))).toMatchObject({
      status: "notExamined",
      limitation: "executionFailed",
    })
    expect(resolveFlaggerScreeningCoverage(makeDecision({ outcome: undefined }))).toMatchObject({
      status: "notExamined",
      limitation: "pending",
    })
    expect(resolveFlaggerScreeningCoverage(null)).toEqual({
      status: "notExamined",
      limitation: "missingTelemetry",
    })
    expect(resolveFlaggerScreeningCoverage(makeDecision({ outcome: "unmatched" }))).toEqual({
      status: "examined",
      selection: { method: "hinted", inclusionProbability: 1 },
    })
  })
})
