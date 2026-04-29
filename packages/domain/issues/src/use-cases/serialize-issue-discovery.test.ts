import { createFakeAI } from "@domain/ai/testing"
import { OutboxEventWriter } from "@domain/events"
import { type Score, ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { IssueId, OrganizationId, ScoreId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Cause, Effect } from "effect"
import { describe, expect, it } from "vitest"
import { CENTROID_EMBEDDING_DIMENSIONS } from "../constants.ts"
import type { Issue } from "../entities/issue.ts"
import { IssueDiscoveryLockUnavailableError } from "../errors.ts"
import { createIssueCentroid } from "../helpers.ts"
import { IssueDiscoveryLockRepository } from "../ports/issue-discovery-lock-repository.ts"
import { IssueProjectionRepository } from "../ports/issue-projection-repository.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { createFakeIssueProjectionRepository, createFakeIssueRepository } from "../testing/index.ts"
import { serializeIssueDiscoveryUseCase } from "./serialize-issue-discovery.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"

const makeEmbedding = (): number[] =>
  Array.from({ length: CENTROID_EMBEDDING_DIMENSIONS }, (_, index) => {
    if (index === 0) return 0.6
    if (index === 1) return 0.8
    return 0
  })

const makeScore = (overrides: Partial<Score> = {}): Score =>
  ({
    id: ScoreId("ssssssssssssssssssssssss"),
    organizationId,
    projectId,
    sessionId: null,
    traceId: null,
    spanId: null,
    source: "annotation",
    sourceId: "UI",
    simulationId: null,
    issueId: null,
    value: 0.2,
    passed: false,
    feedback: "The assistant leaks API tokens in its response.",
    metadata: {
      rawFeedback: "The assistant leaks API tokens in its response.",
    },
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: null,
    annotatorId: null,
    createdAt: new Date("2026-03-30T10:00:00.000Z"),
    updatedAt: new Date("2026-03-30T10:00:00.000Z"),
    ...overrides,
  }) as Score

const makeIssue = (overrides?: Partial<Issue>): Issue => ({
  id: IssueId("iiiiiiiiiiiiiiiiiiiiiiii"),
  uuid: "11111111-1111-4111-8111-111111111111",
  organizationId,
  projectId,
  name: "Token leakage in responses",
  description: "The assistant leaks API tokens in its response.",
  source: "annotation",
  centroid: createIssueCentroid(),
  clusteredAt: new Date("2026-03-29T10:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-03-29T10:00:00.000Z"),
  updatedAt: new Date("2026-03-29T10:00:00.000Z"),
  ...overrides,
})

const createPassthroughSqlClient = (id: string): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(id),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }

  return sqlClient
}

describe("serializeIssueDiscoveryUseCase", () => {
  it("re-runs retrieval under the bounded discovery lock before creating a duplicate issue", async () => {
    const existingIssue = makeIssue()
    const score = makeScore()
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: issueRepository, issues } = createFakeIssueRepository([existingIssue])
    const { service: issueProjectionRepository, store } = createFakeIssueProjectionRepository({ organizationId })
    const lockCalls: string[] = []
    const writtenEvents: unknown[] = []
    const fakeAi = createFakeAI({
      rerank: () => Effect.succeed([{ index: 0, relevanceScore: 0.95 }]),
      generate: (input) =>
        Effect.succeed({
          object: input.schema.parse({
            name: "Token leakage in assistant responses",
            description: "The assistant exposes secrets or tokens in its replies.",
          }),
          tokens: 10,
          duration: 5,
        }),
    })

    scores.set(score.id, score)
    store.set(`${organizationId}_${projectId}::${existingIssue.uuid}`, {
      organizationId,
      projectId,
      uuid: existingIssue.uuid,
      title: existingIssue.name,
      description: existingIssue.description,
      vector: makeEmbedding(),
    })

    const result = await Effect.runPromise(
      serializeIssueDiscoveryUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        feedback: score.feedback,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provide(fakeAi.layer),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(IssueProjectionRepository, issueProjectionRepository),
        Effect.provideService(IssueDiscoveryLockRepository, {
          withLock: (input, effect) =>
            Effect.gen(function* () {
              lockCalls.push(`${input.organizationId}:${input.projectId}:${input.lockKey}`)
              return yield* effect
            }),
        }),
        Effect.provideService(OutboxEventWriter, {
          write: (event) =>
            Effect.sync(() => {
              writtenEvents.push(event)
            }),
        }),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({ action: "assigned", issueId: existingIssue.id })
    expect(scores.get(score.id)?.issueId).toBe(existingIssue.id)
    expect(issues.size).toBe(1)
    // Outer feedback lock + inner per-issue update lock around the centroid recompute and projection sync.
    expect(lockCalls).toHaveLength(2)
    expect(lockCalls[0]).toMatch(new RegExp(`^${organizationId}:${projectId}:feedback:[a-f0-9]{64}$`))
    expect(lockCalls[1]).toBe(`${organizationId}:${projectId}:issue:${existingIssue.id}`)
    expect(writtenEvents).toHaveLength(1)
    expect(fakeAi.calls.rerank).toHaveLength(1)
    expect(fakeAi.calls.generate).toHaveLength(0)
  })

  it("falls through to the project lock before creating a new issue", async () => {
    const score = makeScore()
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: issueRepository, issues } = createFakeIssueRepository()
    const { service: issueProjectionRepository } = createFakeIssueProjectionRepository({ organizationId })
    const lockCalls: string[] = []
    const fakeAi = createFakeAI({
      generate: (input) =>
        Effect.succeed({
          object: input.schema.parse({
            name: "Token leakage in assistant responses",
            description: "The assistant exposes secrets or tokens in its replies.",
          }),
          tokens: 10,
          duration: 5,
        }),
    })

    scores.set(score.id, score)

    const result = await Effect.runPromise(
      serializeIssueDiscoveryUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        feedback: score.feedback,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provide(fakeAi.layer),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(IssueProjectionRepository, issueProjectionRepository),
        Effect.provideService(IssueDiscoveryLockRepository, {
          withLock: (input, effect) =>
            Effect.gen(function* () {
              lockCalls.push(`${input.organizationId}:${input.projectId}:${input.lockKey}`)
              return yield* effect
            }),
        }),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(result.action).toBe("created")
    if (result.action === "skipped") expect.fail(`expected non-skipped result, got reason ${result.reason}`)
    expect(scores.get(score.id)?.issueId).toBe(result.issueId)
    expect(issues.size).toBe(1)
    expect(lockCalls).toHaveLength(2)
    expect(lockCalls[0]).toMatch(new RegExp(`^${organizationId}:${projectId}:feedback:[a-f0-9]{64}$`))
    expect(lockCalls[1]).toBe(`${organizationId}:${projectId}:project`)
    expect(fakeAi.calls.rerank).toHaveLength(0)
    expect(fakeAi.calls.generate).toHaveLength(1)
  })

  it("propagates IssueDiscoveryLockUnavailableError when the feedback lock cannot be acquired", async () => {
    const score = makeScore()
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: issueRepository, issues } = createFakeIssueRepository()
    const { service: issueProjectionRepository } = createFakeIssueProjectionRepository({ organizationId })
    const fakeAi = createFakeAI()

    scores.set(score.id, score)

    const exit = await Effect.runPromiseExit(
      serializeIssueDiscoveryUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        feedback: score.feedback,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provide(fakeAi.layer),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(IssueProjectionRepository, issueProjectionRepository),
        Effect.provideService(IssueDiscoveryLockRepository, {
          withLock: (input) =>
            Effect.fail(
              new IssueDiscoveryLockUnavailableError({
                projectId: input.projectId,
                lockKey: input.lockKey,
              }),
            ),
        }),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      const errOpt = Cause.findErrorOption(exit.cause)
      expect(errOpt._tag).toBe("Some")
      if (errOpt._tag === "Some") {
        expect(errOpt.value).toBeInstanceOf(IssueDiscoveryLockUnavailableError)
        expect((errOpt.value as IssueDiscoveryLockUnavailableError).lockKey).toMatch(/^feedback:[a-f0-9]{64}$/)
      }
    }
    expect(issues.size).toBe(0)
    expect(scores.get(score.id)?.issueId).toBeNull()
    expect(fakeAi.calls.rerank).toHaveLength(0)
    expect(fakeAi.calls.generate).toHaveLength(0)
  })

  it("returns skipped without creating an issue when the project-lock eligibility re-check fails", async () => {
    // Score is already owned by an unrelated issue by the time we acquire the project lock — the inner
    // eligibility check converts ScoreAlreadyOwnedByIssueError into a clean skipped result so the workflow
    // can short-circuit without burning AI generation or activity retries.
    const winningIssueId = IssueId("wwwwwwwwwwwwwwwwwwwwwwww")
    const score = makeScore({ issueId: winningIssueId })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: issueRepository, issues } = createFakeIssueRepository()
    const { service: issueProjectionRepository } = createFakeIssueProjectionRepository({ organizationId })
    const fakeAi = createFakeAI()

    scores.set(score.id, score)

    const result = await Effect.runPromise(
      serializeIssueDiscoveryUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        feedback: score.feedback,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provide(fakeAi.layer),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(IssueProjectionRepository, issueProjectionRepository),
        Effect.provideService(IssueDiscoveryLockRepository, {
          withLock: (_input, effect) => effect,
        }),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "skipped",
      reason: "ScoreAlreadyOwnedByIssueError",
    })
    expect(issues.size).toBe(0)
    expect(fakeAi.calls.generate).toHaveLength(0)
  })
})
