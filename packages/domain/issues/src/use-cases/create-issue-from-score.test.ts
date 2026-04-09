import type { GenerateInput, GenerateResult } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { type AnnotationScore, ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { IssueId, OrganizationId, ScoreId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { CENTROID_EMBEDDING_DIMENSIONS } from "../constants.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { createFakeIssueRepository } from "../testing/fake-issue-repository.ts"
import { createIssueFromScoreUseCase } from "./create-issue-from-score.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"

const makeEmbedding = (): number[] =>
  Array.from({ length: CENTROID_EMBEDDING_DIMENSIONS }, (_, index) => {
    if (index === 0) return 3
    if (index === 1) return 4
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

const createPassthroughSqlClient = (id: string): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(id),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }

  return sqlClient
}

type AIGenerate = <T>(input: GenerateInput<T>) => Effect.Effect<GenerateResult<T>>

const createGenerateIssueDetails =
  (name: string, description: string): AIGenerate =>
  <T>(input: GenerateInput<T>) =>
    Effect.succeed({
      object: input.schema.parse({
        name,
        description,
      }),
      tokens: 10,
      duration: 5,
    })

describe("createIssueFromScoreUseCase", () => {
  it("generates details, creates a new issue, and claims score ownership", async () => {
    const { layer: aiLayer, calls } = createFakeAI({
      generate: createGenerateIssueDetails(
        "Token leakage in assistant responses",
        "The assistant exposes secrets or tokens in its replies.",
      ),
    })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: issueRepository, issues } = createFakeIssueRepository()
    const score = makeScore()
    scores.set(score.id, score)

    const result = await Effect.runPromise(
      createIssueFromScoreUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(result.action).toBe("created")
    expect(result.issueId).toHaveLength(24)
    expect(scores.get(score.id)?.issueId).toBe(result.issueId)
    expect(issues.get(result.issueId)?.name).toBe("Token leakage in assistant responses")
    expect(issues.get(result.issueId)?.description).toBe("The assistant exposes secrets or tokens in its replies.")
    expect(issues.get(result.issueId)?.centroid.mass).toBeGreaterThan(0)
    expect(calls.generate).toHaveLength(1)
  })

  it("returns already-assigned before generation when the score already belongs to an issue", async () => {
    const { layer: aiLayer, calls } = createFakeAI()
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: issueRepository, issues } = createFakeIssueRepository()
    const score = makeScore({
      issueId: IssueId("iiiiiiiiiiiiiiiiiiiiiiii"),
    })
    scores.set(score.id, score)

    const result = await Effect.runPromise(
      createIssueFromScoreUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "already-assigned",
      issueId: score.issueId,
    })
    expect(issues.size).toBe(0)
    expect(calls.generate).toHaveLength(0)
  })

  it("returns already-assigned when another worker claims the score during creation", async () => {
    const winningIssueId = IssueId("wwwwwwwwwwwwwwwwwwwwwwww")
    const { layer: aiLayer, calls } = createFakeAI({
      generate: createGenerateIssueDetails(
        "Token leakage in assistant responses",
        "The assistant exposes secrets or tokens in its replies.",
      ),
    })
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

    const result = await Effect.runPromise(
      createIssueFromScoreUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "already-assigned",
      issueId: winningIssueId,
    })
    expect(issues.size).toBe(0)
    expect(calls.generate).toHaveLength(1)
  })
})
