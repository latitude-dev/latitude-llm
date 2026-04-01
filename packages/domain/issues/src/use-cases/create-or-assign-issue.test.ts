import { type Score, ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { IssueId, OrganizationId, OutboxEventWriter, ScoreId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { CENTROID_EMBEDDING_DIMENSIONS } from "../constants.ts"
import type { Issue } from "../entities/issue.ts"
import { createIssueCentroid } from "../helpers.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { createFakeIssueRepository } from "../testing/fake-issue-repository.ts"
import { createOrAssignIssueUseCase } from "./create-or-assign-issue.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"

const makeEmbedding = (): number[] =>
  Array.from({ length: CENTROID_EMBEDDING_DIMENSIONS }, (_, index) => {
    if (index === 0) return 3
    if (index === 1) return 4
    return 0
  })

const makeScore = (): Score => ({
  id: ScoreId("ssssssssssssssssssssssss"),
  organizationId,
  projectId,
  sessionId: null,
  traceId: null,
  spanId: null,
  source: "annotation" as const,
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
  createdAt: new Date("2026-03-30T10:00:00.000Z"),
  updatedAt: new Date("2026-03-30T10:00:00.000Z"),
})

const makeIssue = (overrides?: Partial<Issue>): Issue => ({
  id: IssueId("iiiiiiiiiiiiiiiiiiiiiiii"),
  uuid: "11111111-1111-4111-8111-111111111111",
  organizationId,
  projectId,
  name: "Token leakage in responses",
  description: "The assistant leaks API tokens in its response.",
  centroid: createIssueCentroid(),
  clusteredAt: new Date("2026-03-29T10:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-03-29T10:00:00.000Z"),
  updatedAt: new Date("2026-03-29T10:00:00.000Z"),
  ...overrides,
})

const createPassthroughSqlClient = (organizationId: string): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(organizationId),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }

  return sqlClient
}

describe("createOrAssignIssueUseCase", () => {
  it("creates a new issue and claims score ownership without requesting async refresh", async () => {
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: issueRepository, issues } = createFakeIssueRepository()
    const score = makeScore()
    scores.set(score.id, score)

    const writtenEvents: unknown[] = []

    const result = await Effect.runPromise(
      createOrAssignIssueUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        matchedIssueId: null,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(OutboxEventWriter, {
          write: (event) =>
            Effect.sync(() => {
              writtenEvents.push(event)
            }),
        }),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(result.action).toBe("created")
    expect(result.issueId).toHaveLength(24)
    expect(scores.get(score.id)?.issueId).toBe(result.issueId)
    expect(issues.get(result.issueId)?.centroid.mass).toBeGreaterThan(0)
    expect(writtenEvents).toHaveLength(0)
  })

  it("assigns to an existing issue and requests async refresh", async () => {
    const existingIssue = makeIssue()
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: issueRepository, issues } = createFakeIssueRepository([existingIssue])
    const score = makeScore()
    scores.set(score.id, score)
    const writtenEvents: unknown[] = []

    const result = await Effect.runPromise(
      createOrAssignIssueUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        matchedIssueId: existingIssue.uuid,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(OutboxEventWriter, {
          write: (event) =>
            Effect.sync(() => {
              writtenEvents.push(event)
            }),
        }),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "assigned-existing",
      issueId: existingIssue.id,
    })
    expect(scores.get(score.id)?.issueId).toBe(existingIssue.id)
    expect(issues.get(existingIssue.id)?.centroid.mass).toBeGreaterThan(0)
    expect(writtenEvents).toEqual([
      expect.objectContaining({
        eventName: "IssueRefreshRequested",
        aggregateId: score.id,
        payload: expect.objectContaining({
          projectId,
          issueId: existingIssue.id,
        }),
      }),
    ])
  })

  it("returns already-assigned when another worker claims the score first", async () => {
    const winningIssueId = IssueId("wwwwwwwwwwwwwwwwwwwwwwww")
    const { repository: scoreRepository, scores } = createFakeScoreRepository({
      assignIssueIfUnowned: ({ scoreId, updatedAt }) => {
        const score = scores.get(scoreId)
        if (score) {
          scores.set(scoreId, {
            ...score,
            issueId: winningIssueId,
            updatedAt,
          })
        }
        return Effect.succeed(false)
      },
    })
    const { repository: issueRepository, issues } = createFakeIssueRepository()
    const score = makeScore()
    scores.set(score.id, score)

    const writtenEvents: unknown[] = []

    const result = await Effect.runPromise(
      createOrAssignIssueUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        matchedIssueId: null,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(OutboxEventWriter, {
          write: (event) =>
            Effect.sync(() => {
              writtenEvents.push(event)
            }),
        }),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "already-assigned",
      issueId: winningIssueId,
    })
    expect(issues.size).toBe(0)
    expect(writtenEvents).toHaveLength(0)
  })
})
