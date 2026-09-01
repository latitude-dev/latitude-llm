import { OutboxEventWriter } from "@domain/events"
import { ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "@domain/scores/testing"
import { ChSqlClient, OrganizationId, ProjectId, SqlClient, TraceId } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { upsertFlaggerAnnotationScore } from "./upsert-flagger-annotation-score.ts"

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
      }).pipe(Effect.provide(layer)),
    )

  return { upsert, scores }
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
