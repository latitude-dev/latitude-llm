import { createFakeAI } from "@domain/ai/testing"
import { OutboxEventWriter } from "@domain/events"
import { type Score, ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { IssueId, OrganizationId, ScoreId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { CENTROID_EMBEDDING_DIMENSIONS } from "../constants.ts"
import type { Issue } from "../entities/issue.ts"
import { createIssueCentroid } from "../helpers.ts"
import { IssueDiscoveryLockRepository } from "../ports/issue-discovery-lock-repository.ts"
import { IssueProjectionRepository } from "../ports/issue-projection-repository.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { createFakeIssueProjectionRepository, createFakeIssueRepository } from "../testing/index.ts"
import { finalizeIssueDiscoveryUseCase } from "./finalize-issue-discovery.ts"

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

describe("finalizeIssueDiscoveryUseCase", () => {
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
      finalizeIssueDiscoveryUseCase({
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
              lockCalls.push(`${input.projectId}:${input.lockKey}`)
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

    expect(result).toEqual({ action: "assigned-existing", issueId: existingIssue.id })
    expect(scores.get(score.id)?.issueId).toBe(existingIssue.id)
    expect(issues.size).toBe(1)
    expect(lockCalls).toHaveLength(1)
    expect(lockCalls[0]).toMatch(new RegExp(`^${projectId}:feedback:annotation:UI:`))
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
      finalizeIssueDiscoveryUseCase({
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
              lockCalls.push(`${input.projectId}:${input.lockKey}`)
              return yield* effect
            }),
        }),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(result.action).toBe("created")
    expect(scores.get(score.id)?.issueId).toBe(result.issueId)
    expect(issues.size).toBe(1)
    expect(lockCalls).toHaveLength(2)
    expect(lockCalls[0]).toMatch(new RegExp(`^${projectId}:feedback:annotation:UI:`))
    expect(lockCalls[1]).toBe(`${projectId}:project`)
    expect(fakeAi.calls.rerank).toHaveLength(0)
    expect(fakeAi.calls.generate).toHaveLength(1)
  })
})
