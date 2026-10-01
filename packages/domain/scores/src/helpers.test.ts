import { ScoreId, SessionId, TraceId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import type { AnnotationScore } from "./entities/score.ts"
import { readFlaggerScoreProvenance } from "./helpers.ts"

const buildScore = (
  metadata: AnnotationScore["metadata"],
  sourceId: AnnotationScore["sourceId"] = "SYSTEM",
): AnnotationScore => {
  const now = new Date("2026-09-07T10:00:00.000Z")
  return {
    id: ScoreId("a".repeat(24)),
    organizationId: "b".repeat(24),
    projectId: "c".repeat(24),
    sessionId: SessionId("session-1"),
    traceId: TraceId("d".repeat(32)),
    spanId: null,
    sourceType: "annotation",
    sourceId,
    simulationId: null,
    signalId: null,
    value: 0,
    passed: false,
    feedback: "Flagger feedback.",
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: null,
    annotatorId: null,
    metadata,
    createdAt: now,
    updatedAt: now,
  }
}

describe("readFlaggerScoreProvenance", () => {
  it("returns a compatible deterministic finding link", () => {
    const score = buildScore({
      rawFeedback: "Flagger feedback.",
      flaggerSlug: "empty-response",
      flaggerPath: "deterministic",
      flaggerFindingKey: "f".repeat(64),
    })

    expect(readFlaggerScoreProvenance(score)).toEqual({
      status: "compatible",
      flaggerSlug: "empty-response",
      flaggerPath: "deterministic",
      flaggerFindingKey: "f".repeat(64),
    })
  })

  it("returns compatible sampled evidence with its artifact version", () => {
    const score = buildScore({
      rawFeedback: "Flagger feedback.",
      flaggerSlug: "refusal",
      flaggerPath: "sampled",
      scoringArtifactVersion: "flagger-classification-v1",
    })

    expect(readFlaggerScoreProvenance(score)).toEqual({
      status: "compatible",
      flaggerSlug: "refusal",
      flaggerPath: "sampled",
      scoringArtifactVersion: "flagger-classification-v1",
    })
  })

  it("keeps metadata without the complete compatibility tuple as legacy evidence", () => {
    const historical = buildScore({ rawFeedback: "Flagger feedback.", flaggerSlug: "empty-response" })
    const partial = buildScore({
      rawFeedback: "Flagger feedback.",
      flaggerSlug: "empty-response",
      flaggerPath: "deterministic",
    })
    const ambiguous = buildScore({
      rawFeedback: "Flagger feedback.",
      flaggerSlug: "empty-response",
      flaggerPath: "deterministic",
      flaggerFindingKey: "f".repeat(64),
      scoringArtifactVersion: "unexpected-model-version",
    })

    expect(readFlaggerScoreProvenance(historical)).toEqual({ status: "legacy", flaggerSlug: "empty-response" })
    expect(readFlaggerScoreProvenance(partial)).toEqual({ status: "legacy", flaggerSlug: "empty-response" })
    expect(readFlaggerScoreProvenance(ambiguous)).toEqual({ status: "legacy", flaggerSlug: "empty-response" })
  })

  it("does not treat ordinary annotations as flagger evidence", () => {
    const score = buildScore({ rawFeedback: "Human feedback." }, "UI")

    expect(readFlaggerScoreProvenance(score)).toEqual({ status: "not-flagger" })
  })
})
