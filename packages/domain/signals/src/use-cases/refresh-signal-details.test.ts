import type { GenerateInput, GenerateResult } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import {
  ALIGNMENT_METRIC_RECOMPUTE_THROTTLE_MS,
  defaultEvaluationTrigger,
  type Evaluation,
  EvaluationRepository,
  type EvaluationRepositoryShape,
  emptyEvaluationAlignment,
} from "@domain/evaluations"
import { QueuePublisher } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { ScoreRepository, scoreSchema } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import {
  EvaluationId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  SignalId,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal } from "../entities/signal.ts"
import { createSignalCentroid } from "../helpers.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/index.ts"
import { refreshSignalDetailsUseCase } from "./refresh-signal-details.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"

const makeSignal = (overrides: Partial<Signal> = {}): Signal => ({
  id: SignalId("iiiiiiiiiiiiiiiiiiiiiiii"),
  slug: "test-issue",
  organizationId,
  projectId,
  name: "Current issue title",
  description: "Current issue description",
  source: "annotation",
  assigneeId: null,
  priority: null,
  centroid: createSignalCentroid(),
  clusteredAt: new Date("2026-03-31T10:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-03-31T10:00:00.000Z"),
  updatedAt: new Date("2026-03-31T10:00:00.000Z"),
  ...overrides,
})

const makeScore = (feedback: string) =>
  scoreSchema.parse({
    id: crypto.randomUUID().replace(/-/g, "").slice(0, 24),
    organizationId,
    projectId,
    sessionId: null,
    traceId: null,
    spanId: null,
    source: "annotation",
    sourceId: "UI",
    simulationId: null,
    signalId: SignalId("iiiiiiiiiiiiiiiiiiiiiiii"),
    value: 0.1,
    passed: false,
    feedback,
    metadata: { rawFeedback: feedback },
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: null,
    annotatorId: null,
    createdAt: new Date("2026-03-31T10:00:00.000Z"),
    updatedAt: new Date("2026-03-31T10:00:00.000Z"),
  })

const makeEvaluation = (id: string, signalId: string): Evaluation =>
  ({
    id: EvaluationId(id),
    organizationId,
    projectId: ProjectId(projectId),
    signalId: SignalId(signalId),
    name: `Evaluation ${id}`,
    description: `Description ${id}`,
    script: "return { passed: false }",
    trigger: defaultEvaluationTrigger(),
    alignment: emptyEvaluationAlignment("hash-1"),
    alignedAt: new Date("2026-03-31T10:00:00.000Z"),
    archivedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-03-31T10:00:00.000Z"),
    updatedAt: new Date("2026-03-31T10:00:00.000Z"),
  }) as Evaluation

const createPassthroughSqlClient = (id: string): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(id),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }

  return sqlClient
}

const createEvaluationRepository = (
  listBySignalId: EvaluationRepositoryShape["listBySignalId"],
): EvaluationRepositoryShape => ({
  findById: () => Effect.die("Unexpected EvaluationRepository.findById in unit test"),
  save: () => Effect.die("Unexpected EvaluationRepository.save in unit test"),
  listByProjectId: () => Effect.die("Unexpected EvaluationRepository.listByProjectId in unit test"),
  listBySignalId,
  listBySignalIds: () => Effect.die("Unexpected EvaluationRepository.listBySignalIds in unit test"),
  archive: () => Effect.die("Unexpected EvaluationRepository.archive in unit test"),
  unarchive: () => Effect.die("Unexpected EvaluationRepository.unarchive in unit test"),
  softDelete: () => Effect.die("Unexpected EvaluationRepository.softDelete in unit test"),
  softDeleteBySignalId: () => Effect.die("Unexpected EvaluationRepository.softDeleteBySignalId in unit test"),
})

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

describe("refreshSignalDetailsUseCase", () => {
  it("updates the canonical issue details while preserving the latest locked issue state", async () => {
    const initialSignal = makeSignal()
    const lockedSignal = makeSignal({
      centroid: {
        ...createSignalCentroid(),
        base: [0.6, 0.8],
        mass: 1,
      },
      clusteredAt: new Date("2026-04-01T10:00:00.000Z"),
      updatedAt: new Date("2026-04-01T10:00:00.000Z"),
    })
    const lockCalls: string[] = []
    const { layer: aiLayer } = createFakeAI({
      generate: createGenerateSignalDetails("Refreshed issue title", "Refreshed issue description"),
    })
    const { repository: signalRepository, issues } = createFakeSignalRepository([initialSignal], {
      findByIdForUpdate: (id) => {
        lockCalls.push(id)
        return Effect.succeed(lockedSignal)
      },
    })
    const { repository: scoreRepository } = createFakeScoreRepository({
      listBySignalId: () =>
        Effect.succeed({
          items: [makeScore("The assistant leaks access tokens in tool output.")],
          hasMore: false,
          limit: 25,
          offset: 0,
        }),
    })
    const { publisher, published } = createFakeQueuePublisher()

    const result = await Effect.runPromise(
      refreshSignalDetailsUseCase({
        organizationId,
        projectId,
        signalId: initialSignal.id,
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(
          EvaluationRepository,
          createEvaluationRepository(() =>
            Effect.succeed({
              items: [
                makeEvaluation("eeeeeeeeeeeeeeeeeeeeeeee", initialSignal.id),
                makeEvaluation("ffffffffffffffffffffffff", initialSignal.id),
              ],
              hasMore: false,
              limit: 100,
              offset: 0,
            }),
          ),
        ),
        Effect.provideService(QueuePublisher, publisher),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
      ),
    )

    const savedSignal = issues.get(initialSignal.id)

    expect(result).toEqual({
      action: "updated",
      signalId: initialSignal.id,
    })
    expect(lockCalls).toEqual([initialSignal.id])
    expect(savedSignal?.name).toBe("Refreshed issue title")
    expect(savedSignal?.description).toBe("Refreshed issue description")
    expect(savedSignal?.centroid).toEqual(lockedSignal.centroid)
    expect(savedSignal?.clusteredAt).toEqual(lockedSignal.clusteredAt)
    expect(savedSignal?.updatedAt.getTime()).toBeGreaterThan(lockedSignal.updatedAt.getTime())
    expect(published).toHaveLength(2)
    expect(published).toEqual(
      expect.arrayContaining([
        {
          queue: "evaluations",
          task: "automaticRefreshAlignment",
          payload: {
            organizationId,
            projectId,
            signalId: initialSignal.id,
            evaluationId: "eeeeeeeeeeeeeeeeeeeeeeee",
          },
          options: {
            dedupeKey: "evaluations:refreshAlignment:eeeeeeeeeeeeeeeeeeeeeeee",
            throttleMs: ALIGNMENT_METRIC_RECOMPUTE_THROTTLE_MS,
          },
        },
        {
          queue: "evaluations",
          task: "automaticRefreshAlignment",
          payload: {
            organizationId,
            projectId,
            signalId: initialSignal.id,
            evaluationId: "ffffffffffffffffffffffff",
          },
          options: {
            dedupeKey: "evaluations:refreshAlignment:ffffffffffffffffffffffff",
            throttleMs: ALIGNMENT_METRIC_RECOMPUTE_THROTTLE_MS,
          },
        },
      ]),
    )
  })

  it("returns unchanged without saving when the generated details already match the locked row", async () => {
    const issue = makeSignal({
      name: "Stable issue title",
      description: "Stable issue description",
    })
    let saveCalls = 0
    const { layer: aiLayer } = createFakeAI({
      generate: createGenerateSignalDetails("Stable issue title", "Stable issue description"),
    })
    const { repository: signalRepository } = createFakeSignalRepository([issue], {
      save: () =>
        Effect.sync(() => {
          saveCalls += 1
        }),
    })
    const { repository: scoreRepository } = createFakeScoreRepository({
      listBySignalId: () =>
        Effect.succeed({
          items: [makeScore("The assistant leaks access tokens in tool output.")],
          hasMore: false,
          limit: 25,
          offset: 0,
        }),
    })
    const { publisher, published } = createFakeQueuePublisher()

    const result = await Effect.runPromise(
      refreshSignalDetailsUseCase({
        organizationId,
        projectId,
        signalId: issue.id,
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(
          EvaluationRepository,
          createEvaluationRepository(() =>
            Effect.succeed({
              items: [makeEvaluation("gggggggggggggggggggggggg", issue.id)],
              hasMore: false,
              limit: 100,
              offset: 0,
            }),
          ),
        ),
        Effect.provideService(QueuePublisher, publisher),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "unchanged",
      signalId: issue.id,
    })
    expect(saveCalls).toBe(0)
    expect(published).toEqual([
      {
        queue: "evaluations",
        task: "automaticRefreshAlignment",
        payload: {
          organizationId,
          projectId,
          signalId: issue.id,
          evaluationId: "gggggggggggggggggggggggg",
        },
        options: {
          dedupeKey: "evaluations:refreshAlignment:gggggggggggggggggggggggg",
          throttleMs: ALIGNMENT_METRIC_RECOMPUTE_THROTTLE_MS,
        },
      },
    ])
  })

  it("returns not-found when the issue disappears before the locked save step", async () => {
    const existingSignal = makeSignal()
    const { layer: aiLayer, calls } = createFakeAI({
      generate: createGenerateSignalDetails("Refreshed issue title", "Refreshed issue description"),
    })
    const { repository: signalRepository } = createFakeSignalRepository([existingSignal], {
      findByIdForUpdate: () => Effect.fail(new NotFoundError({ entity: "Signal", id: existingSignal.id })),
    })
    const { repository: scoreRepository } = createFakeScoreRepository({
      listBySignalId: () =>
        Effect.succeed({
          items: [makeScore("The assistant leaks access tokens in tool output.")],
          hasMore: false,
          limit: 25,
          offset: 0,
        }),
    })
    const { publisher, published } = createFakeQueuePublisher()

    const result = await Effect.runPromise(
      refreshSignalDetailsUseCase({
        organizationId,
        projectId,
        signalId: existingSignal.id,
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(
          EvaluationRepository,
          createEvaluationRepository(() =>
            Effect.succeed({
              items: [makeEvaluation("hhhhhhhhhhhhhhhhhhhhhhhh", existingSignal.id)],
              hasMore: false,
              limit: 100,
              offset: 0,
            }),
          ),
        ),
        Effect.provideService(QueuePublisher, publisher),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "not-found",
      signalId: existingSignal.id,
    })
    expect(calls.generate).toHaveLength(1)
    expect(published).toEqual([])
  })

  it("does not enqueue refresh-alignment tasks for archived or deleted linked evaluations", async () => {
    const issue = makeSignal({
      name: "Stable issue title",
      description: "Stable issue description",
    })
    const { layer: aiLayer } = createFakeAI({
      generate: createGenerateSignalDetails("Stable issue title", "Stable issue description"),
    })
    const { repository: signalRepository } = createFakeSignalRepository([issue])
    const { repository: scoreRepository } = createFakeScoreRepository({
      listBySignalId: () =>
        Effect.succeed({
          items: [makeScore("The assistant leaks access tokens in tool output.")],
          hasMore: false,
          limit: 25,
          offset: 0,
        }),
    })
    const { publisher, published } = createFakeQueuePublisher()

    const archivedEvaluation = {
      ...makeEvaluation("aaaaaaaaaaaaaaaaaaaaaaaa", issue.id),
      archivedAt: new Date("2026-04-10T00:00:00.000Z"),
    } as Evaluation
    const deletedEvaluation = {
      ...makeEvaluation("dddddddddddddddddddddddd", issue.id),
      deletedAt: new Date("2026-04-10T00:00:00.000Z"),
    } as Evaluation
    const activeEvaluation = makeEvaluation("bbbbbbbbbbbbbbbbbbbbbbbb", issue.id)

    await Effect.runPromise(
      refreshSignalDetailsUseCase({
        organizationId,
        projectId,
        signalId: issue.id,
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(
          EvaluationRepository,
          createEvaluationRepository(() =>
            Effect.succeed({
              items: [archivedEvaluation, deletedEvaluation, activeEvaluation],
              hasMore: false,
              limit: 100,
              offset: 0,
            }),
          ),
        ),
        Effect.provideService(QueuePublisher, publisher),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(published).toHaveLength(1)
    expect(published[0]).toEqual({
      queue: "evaluations",
      task: "automaticRefreshAlignment",
      payload: {
        organizationId,
        projectId,
        signalId: issue.id,
        evaluationId: "bbbbbbbbbbbbbbbbbbbbbbbb",
      },
      options: {
        dedupeKey: "evaluations:refreshAlignment:bbbbbbbbbbbbbbbbbbbbbbbb",
        throttleMs: ALIGNMENT_METRIC_RECOMPUTE_THROTTLE_MS,
      },
    })
  })
})
