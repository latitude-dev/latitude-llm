import type { GenerateInput, GenerateResult } from "@domain/ai"
import { EMBEDDING_DIMENSIONS } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { type AnnotationScore, type Score, ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { OrganizationId, ScoreId, SignalId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { SignalRepository } from "../ports/issue-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-issue-repository.ts"
import { createSignalFromScoreUseCase } from "./create-issue-from-score.ts"

const createFakeOutboxEventWriter = () => {
  const events: OutboxWriteEvent[] = []
  const service = OutboxEventWriter.of({
    write: (event) =>
      Effect.sync(() => {
        events.push(event)
      }),
  })
  return { events, service }
}

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"

const makeEmbedding = (): number[] =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => {
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
  source_type: "annotation",
  sourceId: "UI",
  simulationId: null,
  signalId: null,
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

const createGenerateSignalDetails =
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

describe("createSignalFromScoreUseCase", () => {
  it("generates details, creates a new issue, and claims score ownership", async () => {
    const { layer: aiLayer, calls } = createFakeAI({
      generate: createGenerateSignalDetails(
        "Token leakage in assistant responses",
        "The assistant exposes secrets or tokens in its replies.",
      ),
    })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: signalRepository, issues } = createFakeSignalRepository()
    const score = makeScore()
    scores.set(score.id, score)
    const outbox = createFakeOutboxEventWriter()

    const result = await Effect.runPromise(
      createSignalFromScoreUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
        Effect.provideService(OutboxEventWriter, outbox.service),
      ),
    )

    expect(result.action).toBe("created")
    expect(result.signalId).toHaveLength(24)
    expect(scores.get(score.id)?.signalId).toBe(result.signalId)
    expect(issues.get(result.signalId)?.name).toBe("Token leakage in assistant responses")
    expect(issues.get(result.signalId)?.description).toBe("The assistant exposes secrets or tokens in its replies.")
    expect(issues.get(result.signalId)?.centroid.mass).toBeGreaterThan(0)
    expect(calls.generate).toHaveLength(1)

    expect(outbox.events).toHaveLength(1)
    expect(outbox.events[0]).toMatchObject({
      eventName: "SignalCreated",
      aggregateType: "issue",
      aggregateId: result.signalId,
      organizationId,
      payload: { organizationId, projectId, signalId: result.signalId },
    })
  })

  it("returns already-assigned before generation when the score already belongs to an issue", async () => {
    const { layer: aiLayer, calls } = createFakeAI()
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: signalRepository, issues } = createFakeSignalRepository()
    const score = makeScore({
      signalId: SignalId("iiiiiiiiiiiiiiiiiiiiiiii"),
    })
    scores.set(score.id, score)

    const result = await Effect.runPromise(
      createSignalFromScoreUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
        Effect.provideService(OutboxEventWriter, createFakeOutboxEventWriter().service),
      ),
    )

    expect(result).toEqual({
      action: "already-assigned",
      signalId: score.signalId,
    })
    expect(issues.size).toBe(0)
    expect(calls.generate).toHaveLength(0)
  })

  it("returns already-assigned when another worker claims the score during creation", async () => {
    const winningSignalId = SignalId("wwwwwwwwwwwwwwwwwwwwwwww")
    const { layer: aiLayer, calls } = createFakeAI({
      generate: createGenerateSignalDetails(
        "Token leakage in assistant responses",
        "The assistant exposes secrets or tokens in its replies.",
      ),
    })
    const { repository: scoreRepository, scores } = createFakeScoreRepository({
      assignSignalIfUnowned: ({ scoreId, updatedAt }) => {
        const score = scores.get(scoreId)
        if (score) {
          scores.set(scoreId, {
            ...score,
            signalId: winningSignalId,
            updatedAt,
          })
        }
        return Effect.succeed(false)
      },
    })
    const { repository: signalRepository, issues } = createFakeSignalRepository()
    const score = makeScore()
    scores.set(score.id, score)

    const result = await Effect.runPromise(
      createSignalFromScoreUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
        Effect.provideService(OutboxEventWriter, createFakeOutboxEventWriter().service),
      ),
    )

    expect(result).toEqual({
      action: "already-assigned",
      signalId: winningSignalId,
    })
    expect(issues.size).toBe(0)
    expect(calls.generate).toHaveLength(1)
  })

  describe("issue.source mapping", () => {
    const cases = [
      {
        scoreSource: "annotation" as const,
        sourceId: "UI",
        expected: "annotation" as const,
      },
      {
        scoreSource: "annotation" as const,
        sourceId: "SYSTEM",
        expected: "flagger" as const,
      },
      {
        scoreSource: "custom" as const,
        sourceId: "api-source",
        expected: "custom" as const,
      },
    ]

    for (const { scoreSource, sourceId, expected } of cases) {
      it(`derives issue.source = "${expected}" from score.source_type = "${scoreSource}"`, async () => {
        const { layer: aiLayer } = createFakeAI({
          generate: createGenerateSignalDetails("name", "description"),
        })
        const { repository: scoreRepository, scores } = createFakeScoreRepository()
        const { repository: signalRepository, issues } = createFakeSignalRepository()

        const baseScore = makeScore()
        const sourceScore = {
          ...baseScore,
          source_type: scoreSource,
          sourceId,
          metadata: scoreSource === "custom" ? {} : { rawFeedback: baseScore.feedback },
        } as unknown as Score
        scores.set(sourceScore.id, sourceScore)

        const result = await Effect.runPromise(
          createSignalFromScoreUseCase({
            organizationId,
            projectId,
            scoreId: sourceScore.id,
            normalizedEmbedding: makeEmbedding(),
          }).pipe(
            Effect.provide(aiLayer),
            Effect.provideService(ScoreRepository, scoreRepository),
            Effect.provideService(SignalRepository, signalRepository),
            Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
            Effect.provideService(OutboxEventWriter, createFakeOutboxEventWriter().service),
          ),
        )

        expect(result.action).toBe("created")
        const issue = issues.get(result.signalId)
        expect(issue?.source).toBe(expected)
      })
    }
  })
})
