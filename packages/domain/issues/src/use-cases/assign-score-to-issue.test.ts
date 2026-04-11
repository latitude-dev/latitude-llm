import { OutboxEventWriter } from "@domain/events"
import { type AnnotationScore, ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { IssueId, OrganizationId, ScoreId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { CENTROID_EMBEDDING_DIMENSIONS } from "../constants.ts"
import type { Issue } from "../entities/issue.ts"
import { createIssueCentroid } from "../helpers.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { createFakeIssueRepository } from "../testing/index.ts"
import { assignScoreToIssueUseCase } from "./assign-score-to-issue.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const otherProjectId = "qqqqqqqqqqqqqqqqqqqqqqqq"

const makeEmbedding = (): number[] =>
  Array.from({ length: CENTROID_EMBEDDING_DIMENSIONS }, (_, index) => {
    if (index === 0) return 0.6
    if (index === 1) return 0.8
    return 0
  })

const makeScore = (overrides: Partial<AnnotationScore> = {}): AnnotationScore => ({
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

const createPassthroughSqlClient = (id: string): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(id),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }

  return sqlClient
}

describe("assignScoreToIssueUseCase", () => {
  it("assigns to an existing issue and requests async refresh", async () => {
    const existingIssue = makeIssue()
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: issueRepository, issues } = createFakeIssueRepository([existingIssue])
    const score = makeScore()
    scores.set(score.id, score)
    const writtenEvents: unknown[] = []

    const result = await Effect.runPromise(
      assignScoreToIssueUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        issueId: existingIssue.id,
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
        eventName: "ScoreAssignedToIssue",
        aggregateType: "score",
        aggregateId: score.id,
        organizationId,
        payload: expect.objectContaining({
          projectId,
          issueId: existingIssue.id,
          organizationId,
        }),
      }),
    ])
  })

  it("locks the canonical issue row before updating the centroid", async () => {
    const existingIssue = makeIssue()
    const lockCalls: string[] = []
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: issueRepository } = createFakeIssueRepository([existingIssue], {
      findById: () => Effect.die("assignScoreToIssueUseCase should not use unlocked issue reads"),
      findByIdForUpdate: (id) => {
        lockCalls.push(id)
        return Effect.succeed(existingIssue)
      },
    })
    const score = makeScore()
    scores.set(score.id, score)

    await Effect.runPromise(
      assignScoreToIssueUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        issueId: existingIssue.id,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(lockCalls).toEqual([existingIssue.id])
  })

  it("returns already-assigned without mutating the issue when the score is already linked", async () => {
    const existingIssue = makeIssue()
    const winningIssueId = IssueId("wwwwwwwwwwwwwwwwwwwwwwww")
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: issueRepository, issues } = createFakeIssueRepository([existingIssue])
    const score = makeScore({
      issueId: winningIssueId,
    })
    scores.set(score.id, score)
    const writtenEvents: unknown[] = []

    const result = await Effect.runPromise(
      assignScoreToIssueUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        issueId: existingIssue.id,
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
    expect(issues.get(existingIssue.id)?.centroid.mass).toBe(0)
    expect(writtenEvents).toHaveLength(0)
  })

  it("returns already-assigned when another worker claims the score during assignment", async () => {
    const existingIssue = makeIssue()
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
    const { repository: issueRepository, issues } = createFakeIssueRepository([existingIssue])
    const score = makeScore()
    scores.set(score.id, score)
    const writtenEvents: unknown[] = []

    const result = await Effect.runPromise(
      assignScoreToIssueUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        issueId: existingIssue.id,
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
    expect(issues.get(existingIssue.id)?.centroid.mass).toBe(0)
    expect(writtenEvents).toHaveLength(0)
  })

  it("rejects assigning a score into an issue from another project", async () => {
    const foreignIssue = makeIssue({
      projectId: otherProjectId,
    })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: issueRepository, issues } = createFakeIssueRepository([foreignIssue])
    const score = makeScore()
    scores.set(score.id, score)

    const error = await Effect.runPromise(
      assignScoreToIssueUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        issueId: foreignIssue.id,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
        Effect.match({
          onFailure: (error) => error,
          onSuccess: () => {
            throw new Error("expected assignment to fail")
          },
        }),
      ),
    )

    expect(error._tag).toBe("IssueNotFoundForAssignmentError")
    expect(scores.get(score.id)?.issueId).toBeNull()
    expect(issues.get(foreignIssue.id)?.centroid.mass).toBe(0)
  })
})
