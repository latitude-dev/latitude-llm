import { listProjectScoresUseCase, listSourceScoresUseCase, ScoreRepository, writeScoreUseCase } from "@domain/scores"
import { IssueId, NotFoundError, OrganizationId, ProjectId, ScoreId } from "@domain/shared"
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

const createWriteProvider = (database: InMemoryPostgres, organizationId: string) =>
  withPostgres(
    Layer.mergeAll(ScoreRepositoryLive, OutboxEventWriterLive),
    database.appPostgresClient,
    OrganizationId(organizationId),
  )

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

  it("updates drafted scores in place without writing issue events when no issue is attached", async () => {
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

    expect(draftOutboxRows).toHaveLength(0)

    const finalizedScore = await Effect.runPromise(
      writeScoreUseCase({
        id: draftedScore.id,
        projectId: annotationProjectId,
        source: "annotation",
        sourceId: "UI",
        value: 0.95,
        passed: true,
        feedback: "Final annotation feedback",
        metadata: {
          rawFeedback: "Final annotation feedback",
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
    expect(finalizedScore.id).toBe(draftedScore.id)
    expect(finalizedScore.createdAt.toISOString()).toBe(draftedScore.createdAt.toISOString())
    expect(persistedRows[0]?.feedback).toBe("Final annotation feedback")
    expect(persistedRows[0]?.draftedAt).toBeNull()

    const publicationRequests = await database.db
      .select()
      .from(outboxEvents)
      .where(
        and(eq(outboxEvents.organizationId, organizationId), eq(outboxEvents.aggregateId, draftedScore.id as string)),
      )

    expect(publicationRequests).toHaveLength(0)
  })

  it("queues IssueDiscoveryRequested for failed non-draft scores that still need issue assignment", async () => {
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
    expect(publicationRequests[0]?.eventName).toBe("IssueDiscoveryRequested")
    expect(publicationRequests[0]?.payload).toEqual({
      organizationId,
      projectId: customProjectId,
      scoreId: score.id,
    })
  })

  it("queues IssueRefreshRequested when an immutable score is already linked to an issue", async () => {
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
    expect(publicationRequests[0]?.eventName).toBe("IssueRefreshRequested")
    expect(publicationRequests[0]?.payload).toEqual({
      organizationId,
      projectId: customProjectId,
      issueId: "iiiiiiiiiiiiiiiiiiiiiiii",
    })
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
})
