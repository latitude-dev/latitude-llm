import {
  listProjectScoresUseCase,
  listSourceScoresUseCase,
  ScoreAnalyticsRepository,
  ScoreRepository,
  scoreSchema,
  writeScoreUseCase,
} from "@domain/scores"
import { createFakeScoreAnalyticsRepository } from "@domain/scores/testing"
import {
  ChSqlClient,
  IssueId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  ScoreId,
  SessionId,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { and, eq } from "drizzle-orm"
import { Effect, Exit, Layer } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { OutboxEventWriterLive } from "../outbox-writer.ts"
import { outboxEvents } from "../schema/outbox-events.ts"
import { scores as scoresTable } from "../schema/scores.ts"
import { closeInMemoryPostgres, createInMemoryPostgres, type InMemoryPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { ScoreRepositoryLive } from "./score-repository.ts"

const evaluationSourceId = "eeeeeeeeeeeeeeeeeeeeeeee"
const customProjectId = ProjectId("pppppppppppppppppppppppp")
const annotationProjectId = ProjectId("aaaaaaaaaaaaaaaaaaaaaaaa")

const createWriteProvider = (database: InMemoryPostgres, organizationId: string) => {
  const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository()

  return <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      withPostgres(
        Layer.mergeAll(ScoreRepositoryLive, OutboxEventWriterLive),
        database.appPostgresClient,
        OrganizationId(organizationId),
      ),
      Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
      Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(organizationId) })),
    )
}

describe("ScoreRepositoryLive + score use cases", () => {
  let database: InMemoryPostgres

  beforeAll(async () => {
    database = await createInMemoryPostgres()
  })

  afterAll(async () => {
    await closeInMemoryPostgres(database)
  })

  it("rejects invalid source metadata before persistence", async () => {
    const organizationId = "oooooooooooooooooooooooo"

    const result = await Effect.runPromiseExit(
      writeScoreUseCase({
        projectId: customProjectId,
        source: "evaluation",
        sourceId: evaluationSourceId,
        value: 0.7,
        passed: true,
        feedback: "Evaluator ran successfully.",
        metadata: {} as never,
      }).pipe(createWriteProvider(database, organizationId)),
    )

    expect(Exit.isFailure(result)).toBe(true)

    const persistedRows = await database.db
      .select()
      .from(scoresTable)
      .where(eq(scoresTable.organizationId, organizationId))

    expect(persistedRows).toHaveLength(0)
  })

  it("fails before insert when the score row organization differs from the SQL client organization", async () => {
    const sqlClientOrganizationId = "j".repeat(24)
    const rowOrganizationId = "k".repeat(24)
    const scoreId = ScoreId("m".repeat(24))

    const score = scoreSchema.parse({
      id: scoreId,
      organizationId: rowOrganizationId,
      projectId: annotationProjectId,
      sessionId: SessionId("session-rls-mismatch"),
      traceId: TraceId("n".repeat(32)),
      spanId: null,
      source: "annotation",
      sourceId: "UI",
      simulationId: null,
      issueId: null,
      value: 0,
      passed: false,
      feedback: "Tool call failed",
      metadata: { rawFeedback: "Tool call failed" },
      error: null,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      draftedAt: null,
      annotatorId: null,
      createdAt: new Date("2026-04-22T13:15:13.004Z"),
      updatedAt: new Date("2026-04-22T13:15:13.004Z"),
    })

    const result = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const repository = yield* ScoreRepository
        yield* repository.save(score)
      }).pipe(withPostgres(ScoreRepositoryLive, database.appPostgresClient, OrganizationId(sqlClientOrganizationId))),
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      const message = String(result.cause)
      expect(message).toContain("Score save organization context mismatch")
      expect(message).toContain(`row=${rowOrganizationId}`)
      expect(message).toContain(`sqlClient=${sqlClientOrganizationId}`)
    }

    const persistedRows = await database.db.select().from(scoresTable).where(eq(scoresTable.id, scoreId))

    expect(persistedRows).toHaveLength(0)
  })

  it("writes ScoreCreated with status=draft for draft writes and status=published for published writes", async () => {
    const organizationId = "dddddddddddddddddddddddd"
    const scoreId = "ssssssssssssssssssssssss"

    const draftedScore = await Effect.runPromise(
      writeScoreUseCase({
        id: ScoreId(scoreId),
        projectId: annotationProjectId,
        source: "annotation",
        sourceId: "UI",
        value: 0.2,
        passed: false,
        feedback: "Draft annotation feedback",
        metadata: {
          rawFeedback: "Draft annotation feedback",
          messageIndex: 1,
        },
        draftedAt: new Date("2026-03-24T12:00:00.000Z"),
      }).pipe(createWriteProvider(database, organizationId)),
    )

    const draftOutboxRows = await database.db
      .select()
      .from(outboxEvents)
      .where(
        and(eq(outboxEvents.organizationId, organizationId), eq(outboxEvents.aggregateId, draftedScore.id as string)),
      )

    expect(draftOutboxRows).toHaveLength(1)
    expect(draftOutboxRows[0]?.eventName).toBe("ScoreCreated")
    expect(draftOutboxRows[0]?.payload).toMatchObject({ status: "draft" })

    const publishedScore = await Effect.runPromise(
      writeScoreUseCase({
        id: draftedScore.id,
        projectId: annotationProjectId,
        source: "annotation",
        sourceId: "UI",
        value: 0.95,
        passed: true,
        feedback: "Published annotation feedback",
        metadata: {
          rawFeedback: "Published annotation feedback",
          messageIndex: 1,
        },
        draftedAt: null,
      }).pipe(createWriteProvider(database, organizationId)),
    )

    const persistedRows = await database.db
      .select()
      .from(scoresTable)
      .where(eq(scoresTable.id, draftedScore.id as string))

    expect(persistedRows).toHaveLength(1)
    expect(publishedScore.id).toBe(draftedScore.id)
    expect(publishedScore.createdAt.toISOString()).toBe(draftedScore.createdAt.toISOString())
    expect(persistedRows[0]?.feedback).toBe("Published annotation feedback")
    expect(persistedRows[0]?.draftedAt).toBeNull()

    const publicationRequests = await database.db
      .select()
      .from(outboxEvents)
      .where(
        and(eq(outboxEvents.organizationId, organizationId), eq(outboxEvents.aggregateId, draftedScore.id as string)),
      )

    expect(publicationRequests).toHaveLength(2)
    expect(publicationRequests.every((r) => r.eventName === "ScoreCreated")).toBe(true)
    expect(publicationRequests.map((r) => (r.payload as { status: string }).status)).toEqual(["draft", "published"])
  })

  it("queues ScoreCreated with status=published for failed non-draft scores that still need issue assignment", async () => {
    const organizationId = "ffffffffffffffffffffffff"

    const score = await Effect.runPromise(
      writeScoreUseCase({
        projectId: customProjectId,
        source: "custom",
        sourceId: "api-source",
        value: 0.1,
        passed: false,
        feedback: "The assistant leaks API tokens in its response.",
        metadata: { channel: "api" },
      }).pipe(createWriteProvider(database, organizationId)),
    )

    const publicationRequests = await database.db
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.organizationId, organizationId), eq(outboxEvents.aggregateId, score.id as string)))

    expect(publicationRequests).toHaveLength(1)
    expect(publicationRequests[0]?.eventName).toBe("ScoreCreated")
    expect(publicationRequests[0]?.payload).toEqual({
      organizationId,
      projectId: customProjectId,
      scoreId: score.id,
      issueId: null,
      status: "published",
    })
  })

  it("still writes ScoreCreated when the score already carries issueId (discovery worker noops)", async () => {
    const organizationId = "rrrrrrrrrrrrrrrrrrrrrrrr"

    const score = await Effect.runPromise(
      writeScoreUseCase({
        projectId: customProjectId,
        source: "custom",
        sourceId: "api-source",
        issueId: IssueId("iiiiiiiiiiiiiiiiiiiiiiii"),
        value: 0.1,
        passed: false,
        feedback: "Explicitly assigned to an issue",
        metadata: { channel: "api" },
      }).pipe(createWriteProvider(database, organizationId)),
    )

    const publicationRequests = await database.db
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.organizationId, organizationId), eq(outboxEvents.aggregateId, score.id as string)))

    expect(publicationRequests).toHaveLength(1)
    expect(publicationRequests[0]?.eventName).toBe("ScoreCreated")
  })

  it("claims score issue ownership only once with assignIssueIfUnowned", async () => {
    const organizationId = "qqqqqqqqqqqqqqqqqqqqqqqq"
    const score = await Effect.runPromise(
      writeScoreUseCase({
        projectId: customProjectId,
        source: "custom",
        sourceId: "api-source",
        value: 0.12,
        passed: false,
        feedback: "The assistant leaks API tokens in its response.",
        metadata: { channel: "api" },
      }).pipe(createWriteProvider(database, organizationId)),
    )

    const firstClaim = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* ScoreRepository
        return yield* repository.assignIssueIfUnowned({
          scoreId: score.id,
          issueId: IssueId("iiiiiiiiiiiiiiiiiiiiiiii"),
          updatedAt: new Date("2026-03-30T12:00:00.000Z"),
        })
      }).pipe(withPostgres(ScoreRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    const secondClaim = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* ScoreRepository
        return yield* repository.assignIssueIfUnowned({
          scoreId: score.id,
          issueId: IssueId("jjjjjjjjjjjjjjjjjjjjjjjj"),
          updatedAt: new Date("2026-03-30T13:00:00.000Z"),
        })
      }).pipe(withPostgres(ScoreRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    const persistedRows = await database.db
      .select()
      .from(scoresTable)
      .where(eq(scoresTable.id, score.id as string))

    expect(firstClaim).toBe(true)
    expect(secondClaim).toBe(false)
    expect(persistedRows[0]?.issueId).toBe("iiiiiiiiiiiiiiiiiiiiiiii")
  })

  it("findById fails with NotFoundError when the score does not exist", async () => {
    const organizationId = "nnnnnnnnnnnnnnnnnnnnnnnn"
    const missingId = ScoreId("zzzzzzzzzzzzzzzzzzzzzzzz")

    const program = Effect.gen(function* () {
      const repository = yield* ScoreRepository
      return yield* repository.findById(missingId)
    }).pipe(withPostgres(ScoreRepositoryLive, database.appPostgresClient, OrganizationId(organizationId)))

    await expect(Effect.runPromise(program)).rejects.toBeInstanceOf(NotFoundError)
  })

  it("existsByEvaluationIdAndScope prefers session scope when sessionId is present", async () => {
    const organizationId = "mmmmmmmmmmmmmmmmmmmmmmmm"
    const sessionId = SessionId("live-session-1")
    const storedTraceId = TraceId("11111111111111111111111111111111")
    const laterTraceId = TraceId("22222222222222222222222222222222")

    await Effect.runPromise(
      writeScoreUseCase({
        projectId: customProjectId,
        source: "evaluation",
        sourceId: evaluationSourceId,
        sessionId,
        traceId: storedTraceId,
        value: 0.91,
        passed: true,
        feedback: "Canonical evaluation score in the live session",
        metadata: { evaluationHash: "eval-hash-v1" },
      }).pipe(createWriteProvider(database, organizationId)),
    )

    const existsInSameSession = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* ScoreRepository
        return yield* repository.existsByEvaluationIdAndScope({
          projectId: customProjectId,
          evaluationId: evaluationSourceId,
          sessionId,
          traceId: laterTraceId,
        })
      }).pipe(withPostgres(ScoreRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    const existsInDifferentSession = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* ScoreRepository
        return yield* repository.existsByEvaluationIdAndScope({
          projectId: customProjectId,
          evaluationId: evaluationSourceId,
          sessionId: SessionId("live-session-2"),
          traceId: storedTraceId,
        })
      }).pipe(withPostgres(ScoreRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    expect(existsInSameSession).toBe(true)
    expect(existsInDifferentSession).toBe(false)
  })

  it("existsByEvaluationIdAndScope falls back to trace scope when sessionId is absent", async () => {
    const organizationId = "bbbbbbbbbbbbbbbbbbbbbbbb"
    const traceId = TraceId("33333333333333333333333333333333")

    await Effect.runPromise(
      writeScoreUseCase({
        projectId: customProjectId,
        source: "evaluation",
        sourceId: evaluationSourceId,
        traceId,
        value: 0.74,
        passed: true,
        feedback: "Canonical evaluation score without session scope",
        metadata: { evaluationHash: "eval-hash-v1" },
      }).pipe(createWriteProvider(database, organizationId)),
    )

    const existsForSameTrace = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* ScoreRepository
        return yield* repository.existsByEvaluationIdAndScope({
          projectId: customProjectId,
          evaluationId: evaluationSourceId,
          traceId,
        })
      }).pipe(withPostgres(ScoreRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    const existsForDifferentTrace = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* ScoreRepository
        return yield* repository.existsByEvaluationIdAndScope({
          projectId: customProjectId,
          evaluationId: evaluationSourceId,
          traceId: TraceId("44444444444444444444444444444444"),
        })
      }).pipe(withPostgres(ScoreRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    expect(existsForSameTrace).toBe(true)
    expect(existsForDifferentTrace).toBe(false)
  })

  it("existsByEvaluationIdAndTraceId ignores draft and non-evaluation rows", async () => {
    const organizationId = "cccccccccccccccccccccccc"
    const matchingTraceId = TraceId("55555555555555555555555555555555")
    const draftOnlyTraceId = TraceId("66666666666666666666666666666666")

    await Effect.runPromise(
      writeScoreUseCase({
        projectId: customProjectId,
        source: "custom",
        sourceId: evaluationSourceId,
        traceId: matchingTraceId,
        value: 0.32,
        passed: false,
        feedback: "Custom score should not count as an evaluation result",
        metadata: { channel: "api" },
      }).pipe(createWriteProvider(database, organizationId)),
    )

    await Effect.runPromise(
      writeScoreUseCase({
        projectId: customProjectId,
        source: "evaluation",
        sourceId: evaluationSourceId,
        traceId: draftOnlyTraceId,
        value: 0.48,
        passed: false,
        feedback: "Draft evaluation score should not count yet",
        metadata: { evaluationHash: "eval-hash-v1" },
        draftedAt: new Date("2026-04-10T12:00:00.000Z"),
      }).pipe(createWriteProvider(database, organizationId)),
    )

    await Effect.runPromise(
      writeScoreUseCase({
        projectId: customProjectId,
        source: "evaluation",
        sourceId: evaluationSourceId,
        traceId: matchingTraceId,
        value: 0.95,
        passed: true,
        feedback: "Canonical evaluation result for duplicate prevention",
        metadata: { evaluationHash: "eval-hash-v1" },
      }).pipe(createWriteProvider(database, organizationId)),
    )

    const matchingExists = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* ScoreRepository
        return yield* repository.existsByEvaluationIdAndTraceId({
          projectId: customProjectId,
          evaluationId: evaluationSourceId,
          traceId: matchingTraceId,
        })
      }).pipe(withPostgres(ScoreRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    const draftOnlyExists = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* ScoreRepository
        return yield* repository.existsByEvaluationIdAndTraceId({
          projectId: customProjectId,
          evaluationId: evaluationSourceId,
          traceId: draftOnlyTraceId,
        })
      }).pipe(withPostgres(ScoreRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    const missingExists = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* ScoreRepository
        return yield* repository.existsByEvaluationIdAndTraceId({
          projectId: customProjectId,
          evaluationId: evaluationSourceId,
          traceId: TraceId("77777777777777777777777777777777"),
        })
      }).pipe(withPostgres(ScoreRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    expect(matchingExists).toBe(true)
    expect(draftOnlyExists).toBe(false)
    expect(missingExists).toBe(false)
  })

  it("rejects a second canonical evaluation score for the same trace", async () => {
    const organizationId = "dddddddddddddddddddddddd"
    const matchingTraceId = TraceId("88888888888888888888888888888888")

    await Effect.runPromise(
      writeScoreUseCase({
        projectId: customProjectId,
        source: "evaluation",
        sourceId: evaluationSourceId,
        traceId: matchingTraceId,
        value: 0.95,
        passed: true,
        feedback: "Canonical evaluation result for duplicate prevention",
        metadata: { evaluationHash: "eval-hash-v1" },
      }).pipe(createWriteProvider(database, organizationId)),
    )

    await expect(
      Effect.runPromise(
        writeScoreUseCase({
          projectId: customProjectId,
          source: "evaluation",
          sourceId: evaluationSourceId,
          traceId: matchingTraceId,
          value: 0.12,
          passed: false,
          feedback: "A racing worker should not create a second canonical score",
          metadata: { evaluationHash: "eval-hash-v1" },
        }).pipe(createWriteProvider(database, organizationId)),
      ),
    ).rejects.toMatchObject({
      _tag: "RepositoryError",
    })

    const rows = await database.db
      .select({ id: scoresTable.id })
      .from(scoresTable)
      .where(
        and(
          eq(scoresTable.organizationId, organizationId),
          eq(scoresTable.projectId, customProjectId),
          eq(scoresTable.source, "evaluation"),
          eq(scoresTable.sourceId, evaluationSourceId),
          eq(scoresTable.traceId, matchingTraceId),
        ),
      )

    expect(rows).toHaveLength(1)
  })

  it("excludes drafts by default and supports draft-aware project and source reads", async () => {
    const organizationId = "llllllllllllllllllllllll"

    await Effect.runPromise(
      writeScoreUseCase({
        id: ScoreId("tttttttttttttttttttttttt"),
        projectId: customProjectId,
        source: "annotation",
        sourceId: "UI",
        value: 0.15,
        passed: false,
        feedback: "Queued draft annotation",
        metadata: { rawFeedback: "Queued draft annotation" },
        draftedAt: new Date("2026-03-24T15:00:00.000Z"),
      }).pipe(createWriteProvider(database, organizationId)),
    )

    await Effect.runPromise(
      writeScoreUseCase({
        projectId: customProjectId,
        source: "custom",
        sourceId: "api-source",
        value: 0.88,
        passed: true,
        feedback: "Custom score from API",
        metadata: { channel: "api" },
      }).pipe(createWriteProvider(database, organizationId)),
    )

    await Effect.runPromise(
      writeScoreUseCase({
        projectId: customProjectId,
        source: "evaluation",
        sourceId: evaluationSourceId,
        value: 0.61,
        passed: true,
        feedback: "Evaluation score",
        metadata: { evaluationHash: "eval-hash-v1" },
      }).pipe(createWriteProvider(database, organizationId)),
    )

    const defaultPage = await Effect.runPromise(
      listProjectScoresUseCase({ projectId: customProjectId }).pipe(
        withPostgres(ScoreRepositoryLive, database.appPostgresClient, OrganizationId(organizationId)),
      ),
    )

    expect(defaultPage.items).toHaveLength(2)
    expect(defaultPage.items.every((score) => score.draftedAt === null)).toBe(true)

    const includeDraftsPage = await Effect.runPromise(
      listProjectScoresUseCase({ projectId: customProjectId, draftMode: "include" }).pipe(
        withPostgres(ScoreRepositoryLive, database.appPostgresClient, OrganizationId(organizationId)),
      ),
    )

    expect(includeDraftsPage.items).toHaveLength(3)

    const draftOnlyPage = await Effect.runPromise(
      listProjectScoresUseCase({ projectId: customProjectId, draftMode: "only" }).pipe(
        withPostgres(ScoreRepositoryLive, database.appPostgresClient, OrganizationId(organizationId)),
      ),
    )

    expect(draftOnlyPage.items).toHaveLength(1)
    expect(draftOnlyPage.items[0]?.draftedAt).not.toBeNull()

    const customSourcePage = await Effect.runPromise(
      listSourceScoresUseCase({
        projectId: customProjectId,
        source: "custom",
        sourceId: "api-source",
      }).pipe(withPostgres(ScoreRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    expect(customSourcePage.items).toHaveLength(1)
    expect(customSourcePage.items[0]?.source).toBe("custom")
    expect(customSourcePage.items[0]?.sourceId).toBe("api-source")
  })

  it("counts annotation scores by trace and sentiment", async () => {
    const organizationId = "cccccccccccccccccccccccc"
    const positiveTraceId = TraceId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    const mixedTraceId = TraceId("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")

    await Effect.runPromise(
      writeScoreUseCase({
        projectId: annotationProjectId,
        source: "annotation",
        sourceId: "UI",
        traceId: positiveTraceId,
        value: 0.9,
        passed: true,
        feedback: "Looks good",
        metadata: { rawFeedback: "Looks good" },
      }).pipe(createWriteProvider(database, organizationId)),
    )

    await Effect.runPromise(
      writeScoreUseCase({
        projectId: annotationProjectId,
        source: "annotation",
        sourceId: "UI",
        traceId: mixedTraceId,
        value: 0.1,
        passed: false,
        feedback: "Bad answer",
        metadata: { rawFeedback: "Bad answer" },
      }).pipe(createWriteProvider(database, organizationId)),
    )

    await Effect.runPromise(
      writeScoreUseCase({
        projectId: annotationProjectId,
        source: "annotation",
        sourceId: "UI",
        traceId: mixedTraceId,
        value: 0.8,
        passed: true,
        feedback: "Draft positive",
        metadata: { rawFeedback: "Draft positive" },
        draftedAt: new Date("2026-03-24T15:00:00.000Z"),
      }).pipe(createWriteProvider(database, organizationId)),
    )

    await Effect.runPromise(
      writeScoreUseCase({
        projectId: annotationProjectId,
        source: "custom",
        sourceId: "api-source",
        traceId: mixedTraceId,
        value: 0.99,
        passed: true,
        feedback: "Custom score",
        metadata: { channel: "api" },
      }).pipe(createWriteProvider(database, organizationId)),
    )

    const counts = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* ScoreRepository
        return yield* repository.countAnnotationsByTraceIds({
          projectId: annotationProjectId,
          traceIds: [positiveTraceId, mixedTraceId, TraceId("cccccccccccccccccccccccccccccccc")],
          options: { draftMode: "include" },
        })
      }).pipe(withPostgres(ScoreRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    const countsByTraceId = new Map(counts.map((count) => [count.traceId, count]))

    expect(countsByTraceId.get(positiveTraceId)).toMatchObject({ positiveCount: 1, negativeCount: 0 })
    expect(countsByTraceId.get(mixedTraceId)).toMatchObject({ positiveCount: 1, negativeCount: 1 })
    expect(countsByTraceId.has(TraceId("cccccccccccccccccccccccccccccccc"))).toBe(false)
  })

  it("findPublishedSystemAnnotationByTraceAndFeedback finds existing system annotation score", async () => {
    const organizationId = "qqqqqqqqqqqqqqqqqqqqqqqq"
    const traceId = TraceId("tttttttttttttttttttttttttttttttt")

    const publishedScore = await Effect.runPromise(
      writeScoreUseCase({
        projectId: annotationProjectId,
        source: "annotation",
        sourceId: "SYSTEM",
        traceId: traceId,
        value: 0,
        passed: false,
        feedback: "Flagger published feedback",
        metadata: { rawFeedback: "Flagger published feedback" },
        draftedAt: null,
      }).pipe(createWriteProvider(database, organizationId)),
    )

    const found = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* ScoreRepository
        return yield* repository.findPublishedSystemAnnotationByTraceAndFeedback({
          projectId: annotationProjectId,
          traceId: traceId,
          feedback: "Flagger published feedback",
        })
      }).pipe(withPostgres(ScoreRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    expect(found).not.toBeNull()
    expect(found?.id).toBe(publishedScore.id)
    expect(found?.source).toBe("annotation")
    expect(found?.sourceId).toBe("SYSTEM")
    expect(found?.traceId).toBe(traceId)
    expect(found?.draftedAt).toBeNull()
  })

  it("findPublishedSystemAnnotationByTraceAndFeedback returns null when no published score exists", async () => {
    const organizationId = "wwwwwwwwwwwwwwwwwwwwwwww"
    const traceId = TraceId("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz")

    const found = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* ScoreRepository
        return yield* repository.findPublishedSystemAnnotationByTraceAndFeedback({
          projectId: annotationProjectId,
          traceId: traceId,
          feedback: "Missing feedback",
        })
      }).pipe(withPostgres(ScoreRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    expect(found).toBeNull()
  })

  it("findPublishedSystemAnnotationByTraceAndFeedback excludes draft system annotation scores", async () => {
    const organizationId = "xxxxxxxxxxxxxxxxxxxxxxxx"
    const traceId = TraceId("yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy")

    await Effect.runPromise(
      writeScoreUseCase({
        projectId: annotationProjectId,
        source: "annotation",
        sourceId: "SYSTEM",
        traceId: traceId,
        value: 0,
        passed: false,
        feedback: "Draft flagger feedback",
        metadata: { rawFeedback: "Draft flagger feedback" },
        draftedAt: new Date("2026-03-24T16:00:00.000Z"),
      }).pipe(createWriteProvider(database, organizationId)),
    )

    const found = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* ScoreRepository
        return yield* repository.findPublishedSystemAnnotationByTraceAndFeedback({
          projectId: annotationProjectId,
          traceId: traceId,
          feedback: "Draft flagger feedback",
        })
      }).pipe(withPostgres(ScoreRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    expect(found).toBeNull()
  })

  it("findPublishedSystemAnnotationByTraceAndFeedback filters by feedback and traceId correctly", async () => {
    const organizationId = "yyyyyyyyyyyyyyyyyyyyyyyy"
    const traceId1 = TraceId("t1111111111111111111111111111111") // 32 chars
    const traceId2 = TraceId("t2222222222222222222222222222222") // 32 chars

    const target = await Effect.runPromise(
      writeScoreUseCase({
        projectId: annotationProjectId,
        source: "annotation",
        sourceId: "SYSTEM",
        traceId: traceId1,
        value: 0,
        passed: false,
        feedback: "Target",
        metadata: { rawFeedback: "Target" },
        draftedAt: null,
      }).pipe(createWriteProvider(database, organizationId)),
    )

    await Effect.runPromise(
      writeScoreUseCase({
        projectId: annotationProjectId,
        source: "annotation",
        sourceId: "SYSTEM",
        traceId: traceId2,
        value: 0,
        passed: false,
        feedback: "Same flagger, different trace",
        metadata: { rawFeedback: "Same flagger, different trace" },
        draftedAt: null,
      }).pipe(createWriteProvider(database, organizationId)),
    )

    await Effect.runPromise(
      writeScoreUseCase({
        projectId: annotationProjectId,
        source: "annotation",
        sourceId: "SYSTEM",
        traceId: traceId1,
        value: 0,
        passed: false,
        feedback: "Same trace, different flagger",
        metadata: { rawFeedback: "Same trace, different flagger" },
        draftedAt: null,
      }).pipe(createWriteProvider(database, organizationId)),
    )

    const found = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* ScoreRepository
        return yield* repository.findPublishedSystemAnnotationByTraceAndFeedback({
          projectId: annotationProjectId,
          traceId: traceId1,
          feedback: "Target",
        })
      }).pipe(withPostgres(ScoreRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    expect(found).not.toBeNull()
    expect(found?.id).toBe(target.id)
    expect(found?.sourceId).toBe("SYSTEM")
    expect(found?.traceId).toBe(traceId1)
  })
})
