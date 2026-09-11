import { OutboxEventWriter } from "@domain/events"
import { ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "@domain/scores/testing"
import { ChSqlClient, OrganizationId, ProjectId, SqlClient, TraceId } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { upsertFlaggerAnnotationScore, upsertFlaggerVerdictScore } from "./upsert-flagger-annotation-score.ts"

const ORG_ID = "a".repeat(24)
const PROJECT_ID = ProjectId("b".repeat(24))
const TRACE_ID = TraceId("c".repeat(32))
const SESSION_ID = "session-1"
const ANCHOR_A = "1".repeat(64)
const ANCHOR_B = "2".repeat(64)

const makeHarness = () => {
  const { repository: scoreRepo, scores } = createFakeScoreRepository()
  const { repository: scoreAnalyticsRepo } = createFakeScoreAnalyticsRepository()
  const layer = Layer.mergeAll(
    Layer.succeed(ScoreRepository, scoreRepo),
    Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepo),
    Layer.succeed(OutboxEventWriter, { write: () => Effect.void }),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(ORG_ID) })),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(ORG_ID) })),
  )

  const upsert = (input: {
    readonly feedback: string
    readonly flaggerSlug?: string
    readonly contentHash?: string
    readonly sessionId?: string | null
    readonly flaggerTraceId?: string
    readonly flaggerFindingKey?: string
    readonly flaggerPath?: "deterministic" | "sampled"
    readonly scoringArtifactVersion?: string
    readonly analysisHash?: string
  }) =>
    Effect.runPromise(
      upsertFlaggerAnnotationScore({
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
        sessionId: input.sessionId === undefined ? SESSION_ID : input.sessionId,
        simulationId: null,
        feedback: input.feedback,
        flaggerSlug: input.flaggerSlug ?? "frustration",
        contentHash: input.contentHash,
        flaggerTraceId: input.flaggerTraceId,
        flaggerFindingKey: input.flaggerFindingKey,
        flaggerPath: input.flaggerPath,
        scoringArtifactVersion: input.scoringArtifactVersion,
        analysisHash: input.analysisHash,
      }).pipe(Effect.provide(layer)),
    )

  const upsertVerdict = (input: {
    readonly verdict: "success" | "failure"
    readonly feedback: string
    readonly analysisHash: string
    readonly contentHash?: string
    readonly flaggerSlug?: string
  }) =>
    Effect.runPromise(
      upsertFlaggerVerdictScore({
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
        sessionId: SESSION_ID,
        simulationId: null,
        flaggerSlug: input.flaggerSlug ?? "task-failure",
        verdict: input.verdict,
        feedback: input.feedback,
        analysisHash: input.analysisHash,
        contentHash: input.contentHash ?? ANCHOR_A,
      }).pipe(Effect.provide(layer)),
    )

  return { upsert, upsertVerdict, scores }
}

describe("upsertFlaggerAnnotationScore anchor dedup", () => {
  it("dedups a re-detection of the same anchor even when the LLM re-words the feedback", async () => {
    const { upsert, scores } = makeHarness()

    const first = await upsert({ feedback: "The user is clearly frustrated.", contentHash: ANCHOR_A })
    expect(first.status).toBe("written")

    const rerun = await upsert({ feedback: "User frustration is evident here.", contentHash: ANCHOR_A })
    expect(rerun).toEqual({ status: "existing", scoreId: first.scoreId })
    expect(scores.size).toBe(1)
  })

  it("lets the same flagger flag several distinct parts of one long session", async () => {
    const { upsert, scores } = makeHarness()

    await upsert({ feedback: "First refusal.", flaggerSlug: "refusal", contentHash: ANCHOR_A })
    const second = await upsert({ feedback: "Second refusal.", flaggerSlug: "refusal", contentHash: ANCHOR_B })

    expect(second.status).toBe("written")
    expect(scores.size).toBe(2)
  })

  it("scopes the anchor dedup per flagger slug", async () => {
    const { upsert, scores } = makeHarness()

    await upsert({ feedback: "Frustration here.", flaggerSlug: "frustration", contentHash: ANCHOR_A })
    const other = await upsert({ feedback: "Refusal here.", flaggerSlug: "refusal", contentHash: ANCHOR_A })

    expect(other.status).toBe("written")
    expect(scores.size).toBe(2)
  })

  it("stores the anchor hash in the score metadata", async () => {
    const { upsert, scores } = makeHarness()

    await upsert({ feedback: "Anchored flag.", contentHash: ANCHOR_A })

    expect([...scores.values()][0]?.metadata).toMatchObject({ contentHash: ANCHOR_A })
  })

  it("stores the classification's trace so the detection can be graded later", async () => {
    const { upsert, scores } = makeHarness()
    const flaggerTraceId = "f".repeat(32)

    await upsert({ feedback: "Anchored flag.", contentHash: ANCHOR_A, flaggerTraceId })

    expect([...scores.values()][0]?.metadata).toMatchObject({ flaggerTraceId })
  })

  it("writes no trace pointer for a detection that made no generation", async () => {
    const { upsert, scores } = makeHarness()

    await upsert({ feedback: "Deterministic flag.", contentHash: ANCHOR_A })

    expect([...scores.values()][0]?.metadata).not.toHaveProperty("flaggerTraceId")
  })

  it("stores a deterministic finding link without copying the finding", async () => {
    const { upsert, scores } = makeHarness()
    const flaggerFindingKey = "f".repeat(64)

    await upsert({
      feedback: "Deterministic flag.",
      contentHash: ANCHOR_A,
      flaggerFindingKey,
      flaggerPath: "deterministic",
    })

    expect([...scores.values()][0]?.metadata).toMatchObject({
      flaggerFindingKey,
      flaggerPath: "deterministic",
    })
    expect([...scores.values()][0]?.metadata).not.toHaveProperty("finding")
  })

  it("stores sampled model provenance without copying telemetry-derived facts", async () => {
    const { upsert, scores } = makeHarness()

    await upsert({
      feedback: "Sampled flag.",
      contentHash: ANCHOR_A,
      flaggerPath: "sampled",
      scoringArtifactVersion: "flagger-classification-v1",
    })

    const score = [...scores.values()][0]
    expect(score).toMatchObject({ passed: false, value: 0, feedback: "Sampled flag." })
    expect(score?.metadata).toMatchObject({
      flaggerPath: "sampled",
      scoringArtifactVersion: "flagger-classification-v1",
    })
    expect(score?.metadata).not.toEqual(
      expect.objectContaining({ recovered: expect.anything(), terminal: expect.anything() }),
    )
  })

  it("falls back to exact-feedback dedup when no anchor is available", async () => {
    const { upsert, scores } = makeHarness()

    await upsert({ feedback: "Deterministic feedback.", sessionId: null })
    const repeat = await upsert({ feedback: "Deterministic feedback.", sessionId: null })
    const reworded = await upsert({ feedback: "Different wording.", sessionId: null })

    expect(repeat.status).toBe("existing")
    expect(reworded.status).toBe("written")
    expect(scores.size).toBe(2)
  })
})

describe("upsertFlaggerVerdictScore", () => {
  const GENERATION_A = "a".repeat(64)
  const GENERATION_B = "b".repeat(64)

  it("writes a passed score for success and a failed score for failure", async () => {
    const { upsertVerdict, scores } = makeHarness()

    await upsertVerdict({ verdict: "success", feedback: "The task was completed.", analysisHash: GENERATION_A })
    await upsertVerdict({
      verdict: "failure",
      feedback: "The cancellation never happened.",
      analysisHash: GENERATION_B,
    })

    const written = [...scores.values()]
    expect(written).toHaveLength(2)
    expect(written[0]).toMatchObject({ passed: true, value: 1, sourceType: "annotation", sourceId: "SYSTEM" })
    expect(written[1]).toMatchObject({ passed: false, value: 0 })
  })

  it("dedups one verdict per analysis generation", async () => {
    const { upsertVerdict, scores } = makeHarness()

    const first = await upsertVerdict({ verdict: "success", feedback: "Done.", analysisHash: GENERATION_A })
    const rerun = await upsertVerdict({ verdict: "success", feedback: "Done again.", analysisHash: GENERATION_A })

    expect(rerun).toEqual({ status: "existing", scoreId: first.scoreId })
    expect(scores.size).toBe(1)
  })

  // The anchor dedup the detection path uses survives re-screens on purpose,
  // which would drop the newer verdict of a session that changed.
  it("records a later generation that reverses an earlier verdict on the same anchor", async () => {
    const { upsertVerdict, scores } = makeHarness()

    await upsertVerdict({ verdict: "success", feedback: "Done.", analysisHash: GENERATION_A, contentHash: ANCHOR_A })
    const reversed = await upsertVerdict({
      verdict: "failure",
      feedback: "The user came back and it was still broken.",
      analysisHash: GENERATION_B,
      contentHash: ANCHOR_A,
    })

    expect(reversed.status).toBe("written")
    expect(scores.size).toBe(2)
  })

  it("scopes the generation dedup per flagger slug", async () => {
    const { upsertVerdict, scores } = makeHarness()

    await upsertVerdict({ verdict: "success", feedback: "Done.", analysisHash: GENERATION_A })
    const other = await upsertVerdict({
      verdict: "success",
      feedback: "Done.",
      analysisHash: GENERATION_A,
      flaggerSlug: "refusal",
    })

    expect(other.status).toBe("written")
    expect(scores.size).toBe(2)
  })

  it("stores the analysis generation so window readers can pick the newest one", async () => {
    const { upsertVerdict, scores } = makeHarness()

    await upsertVerdict({ verdict: "success", feedback: "Done.", analysisHash: GENERATION_A })

    expect([...scores.values()][0]?.metadata).toMatchObject({
      analysisHash: GENERATION_A,
      flaggerSlug: "task-failure",
    })
  })
})
