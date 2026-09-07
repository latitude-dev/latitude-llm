import { OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { flaggerScreeningDecisionSchema } from "./flagger-screening-decision.ts"

const baseDecision = {
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
  createdAt: new Date("2026-09-07T10:00:00.000Z"),
  retentionDays: 90,
} as const

describe("flaggerScreeningDecisionSchema", () => {
  it("accepts a pending selection and a terminal revision", () => {
    expect(flaggerScreeningDecisionSchema.safeParse(baseDecision).success).toBe(true)
    expect(flaggerScreeningDecisionSchema.safeParse({ ...baseDecision, version: 2, outcome: "matched" }).success).toBe(
      true,
    )
  })

  it("accepts an unselected ordinary sample without an outcome", () => {
    expect(
      flaggerScreeningDecisionSchema.safeParse({
        ...baseDecision,
        selected: false,
        reason: "ordinary-sample",
        inclusionProbability: 0.1,
        hintKinds: [],
      }).success,
    ).toBe(true)
  })

  it("rejects malformed ids, probabilities, and revisions", () => {
    expect(flaggerScreeningDecisionSchema.safeParse({ ...baseDecision, decisionId: "short" }).success).toBe(false)
    expect(flaggerScreeningDecisionSchema.safeParse({ ...baseDecision, inclusionProbability: 1.1 }).success).toBe(false)
    expect(flaggerScreeningDecisionSchema.safeParse({ ...baseDecision, version: 0 }).success).toBe(false)
  })
})
