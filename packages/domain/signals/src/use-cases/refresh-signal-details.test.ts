import type { GenerateInput, GenerateResult } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { EvaluationRepository } from "@domain/evaluations"
import { QueuePublisher } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { OrganizationId, SignalId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal, SignalScoreEvidence } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { refreshSignalDetailsUseCase } from "./refresh-signal-details.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const signalId = "ssssssssssssssssssssssss"

type AIGenerate = <T>(input: GenerateInput<T>) => Effect.Effect<GenerateResult<T>>

const createPassthroughSqlClient = (): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(organizationId),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }
  return sqlClient
}

const evaluationRepository = EvaluationRepository.of({
  findById: () => Effect.die("Unexpected evaluation lookup in unit test"),
  save: () => Effect.die("Unexpected evaluation save in unit test"),
  listByProjectId: () => Effect.succeed({ items: [], hasMore: false, limit: 100, offset: 0 }),
  listBySignalId: () => Effect.succeed({ items: [], hasMore: false, limit: 100, offset: 0 }),
  listBySignalIds: () => Effect.succeed({ items: [], hasMore: false, limit: 100, offset: 0 }),
  archive: () => Effect.die("Unexpected evaluation archive in unit test"),
  unarchive: () => Effect.die("Unexpected evaluation unarchive in unit test"),
  softDelete: () => Effect.die("Unexpected evaluation deletion in unit test"),
  softDeleteBySignalId: () => Effect.die("Unexpected evaluation deletion in unit test"),
})

const makeSignal = (promotedAt: Date | null): Signal => ({
  id: SignalId(signalId),
  organizationId,
  projectId,
  slug: "acme-0001",
  name: "The assistant leaks API tokens in its response",
  description: "The assistant leaks API tokens in its response.",
  source: "flagger",
  origin: "system",
  scoreEvidence: [],
  filters: null,
  assigneeId: null,
  priority: null,
  centroid: null,
  clusteredAt: null,
  feedback: null,
  promotedAt,
  resolvedAt: null,
  ignoredAt: null,
  regressedAt: null,
  mutedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
})

describe("refreshSignalDetailsUseCase", () => {
  it("leaves an unpromoted signal on its placeholder and calls no model", async () => {
    // `ScoreAssignedToSignal` schedules this task for candidates too. Generating
    // there would spend a model call to make matching worse — the placeholder is
    // the occurrence's own feedback, which is the better rerank document for a
    // cluster this thin, and the summary replacing it would come from the same
    // one or two members that make the task ill-posed in the first place.
    const { layer: aiLayer, calls } = createFakeAI()
    const { repository, issues } = createFakeSignalRepository([makeSignal(null)])

    const result = await Effect.runPromise(
      refreshSignalDetailsUseCase({ organizationId, projectId, signalId }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(SignalRepository, repository),
      ),
    )

    expect(result).toEqual({ action: "unpromoted", signalId })
    expect(calls.generate).toHaveLength(0)
    expect(issues.get(signalId)?.name).toBe("The assistant leaks API tokens in its response")
  })

  it("preserves latched score evidence when refreshing details", async () => {
    const scoreEvidence: SignalScoreEvidence[] = [{ scoreDimension: "safety", role: "exposure" }]
    const generate: AIGenerate = (input) =>
      Effect.succeed({
        object: input.schema.parse({
          name: "API tokens exposed in responses",
          description: "Responses expose API tokens to users.",
          scoreEvidence: [{ scoreDimension: "outcome", role: "taskOutcome" }],
        }),
        tokens: 10,
        duration: 5,
      })
    const { layer: aiLayer } = createFakeAI({ generate })
    const { repository: signalRepository, issues } = createFakeSignalRepository([
      { ...makeSignal(new Date("2026-07-01T00:00:00Z")), scoreEvidence },
    ])
    const { repository: scoreRepository } = createFakeScoreRepository({
      listBySignalId: () =>
        Effect.succeed({
          items: [{ sourceType: "annotation", feedback: "A response exposed an API token." }] as never,
          hasMore: false,
          limit: 25,
          offset: 0,
        }),
    })
    const { publisher } = createFakeQueuePublisher()

    const result = await Effect.runPromise(
      refreshSignalDetailsUseCase({ organizationId, projectId, signalId }).pipe(
        Effect.provide(
          Layer.mergeAll(
            aiLayer,
            Layer.succeed(SignalRepository, signalRepository),
            Layer.succeed(ScoreRepository, scoreRepository),
            Layer.succeed(EvaluationRepository, evaluationRepository),
            Layer.succeed(QueuePublisher, publisher),
          ),
        ),
        Effect.provideService(SqlClient, createPassthroughSqlClient()),
      ),
    )

    expect(result).toEqual({ action: "updated", signalId })
    expect(issues.get(signalId)?.name).toBe("API tokens exposed in responses")
    expect(issues.get(signalId)?.scoreEvidence).toEqual(scoreEvidence)
  })
})
