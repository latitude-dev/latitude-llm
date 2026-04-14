import { ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { ExternalUserId, OrganizationId, ProjectId, SessionId, SimulationId, SpanId, TraceId } from "@domain/shared"
import { type TraceDetail, TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import {
  defaultEvaluationTrigger,
  type Evaluation,
  emptyEvaluationAlignment,
  evaluationSchema,
} from "../../entities/evaluation.ts"
import {
  buildLiveEvaluationExecuteScopeDedupeKey,
  buildLiveEvaluationExecuteTraceDedupeKey,
  shouldSampleLiveEvaluation,
  toLiveEvaluationDebounceMs,
} from "../../helpers.ts"
import {
  type EvaluationListPage,
  EvaluationRepository,
  type EvaluationRepositoryShape,
} from "../../ports/evaluation-repository.ts"
import {
  LiveEvaluationQueuePublisher,
  type LiveEvaluationQueuePublisherShape,
  type PublishLiveEvaluationExecuteInput,
} from "../../ports/live-evaluation-queue-publisher.ts"
import { enqueueLiveEvaluationsUseCase } from "./enqueue-live-evaluations.ts"

const INPUT = {
  organizationId: "a".repeat(24),
  projectId: "b".repeat(24),
  traceId: "c".repeat(32),
} as const

function makeTraceDetail(overrides?: Partial<Pick<TraceDetail, "projectId" | "traceId" | "sessionId">>): TraceDetail {
  return {
    organizationId: OrganizationId(INPUT.organizationId),
    projectId: overrides?.projectId ?? ProjectId(INPUT.projectId),
    traceId: overrides?.traceId ?? TraceId(INPUT.traceId),
    spanCount: 3,
    errorCount: 0,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    endTime: new Date("2026-01-01T00:00:01.000Z"),
    durationNs: 1,
    timeToFirstTokenNs: 0,
    tokensInput: 120,
    tokensOutput: 80,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    tokensTotal: 200,
    costInputMicrocents: 50,
    costOutputMicrocents: 25,
    costTotalMicrocents: 75,
    sessionId: overrides?.sessionId ?? SessionId("session"),
    userId: ExternalUserId("user"),
    simulationId: SimulationId(""),
    tags: [],
    metadata: {},
    models: ["gpt-4o-mini"],
    providers: ["openai"],
    serviceNames: ["web"],
    rootSpanId: SpanId("r".repeat(16)),
    rootSpanName: "root",
    systemInstructions: [{ type: "text", text: "You are a careful assistant." }],
    inputMessages: [],
    outputMessages: [],
    allMessages: [],
  }
}

function makeEvaluation(
  id: string,
  options?: {
    readonly debounce?: number
    readonly filter?: Evaluation["trigger"]["filter"]
    readonly sampling?: number
    readonly turn?: Evaluation["trigger"]["turn"]
  },
) {
  const trigger = defaultEvaluationTrigger()

  return evaluationSchema.parse({
    id,
    organizationId: INPUT.organizationId,
    projectId: INPUT.projectId,
    issueId: "i".repeat(24),
    name: `Eval ${id.slice(-4)}`,
    description: "Live evaluation",
    script: "export default async function evaluate() { return { score: 1 } }",
    trigger: {
      ...trigger,
      ...(options?.debounce !== undefined ? { debounce: options.debounce } : {}),
      ...(options?.filter !== undefined ? { filter: options.filter } : {}),
      ...(options?.sampling !== undefined ? { sampling: options.sampling } : {}),
      ...(options?.turn !== undefined ? { turn: options.turn } : {}),
    },
    alignment: emptyEvaluationAlignment("hash"),
    alignedAt: new Date("2026-01-01T00:00:00.000Z"),
    archivedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  })
}

function createEvaluationRepository(
  listByProjectId: EvaluationRepositoryShape["listByProjectId"],
): EvaluationRepositoryShape {
  return {
    findById: () => Effect.die("Unexpected call to findById"),
    save: () => Effect.die("Unexpected call to save"),
    listByProjectId,
    listByIssueId: () => Effect.die("Unexpected call to listByIssueId"),
    archive: () => Effect.die("Unexpected call to archive"),
    unarchive: () => Effect.die("Unexpected call to unarchive"),
    softDelete: () => Effect.die("Unexpected call to softDelete"),
    archiveByIssueId: () => Effect.die("Unexpected call to archiveByIssueId"),
  }
}

function createLiveEvaluationQueuePublisher(overrides?: Partial<LiveEvaluationQueuePublisherShape>) {
  const published: PublishLiveEvaluationExecuteInput[] = []

  const queuePublisher: LiveEvaluationQueuePublisherShape = {
    publishExecute: (input) => {
      published.push(input)
      return Effect.void
    },
    ...overrides,
  }

  return { queuePublisher, published }
}

function createUseCaseLayer(input: {
  readonly traceRepository: ReturnType<typeof createFakeTraceRepository>["repository"]
  readonly evaluationRepository: EvaluationRepositoryShape
  readonly scoreRepository?: ReturnType<typeof createFakeScoreRepository>["repository"]
  readonly liveEvaluationQueuePublisher?: LiveEvaluationQueuePublisherShape
}) {
  return Layer.mergeAll(
    Layer.succeed(TraceRepository, input.traceRepository),
    Layer.succeed(EvaluationRepository, input.evaluationRepository),
    Layer.succeed(ScoreRepository, input.scoreRepository ?? createFakeScoreRepository().repository),
    Layer.succeed(
      LiveEvaluationQueuePublisher,
      input.liveEvaluationQueuePublisher ?? createLiveEvaluationQueuePublisher().queuePublisher,
    ),
  )
}

async function findNonSampledEvaluationIds(count: number): Promise<string[]> {
  const matches: string[] = []
  const alphabet = "abcdefghijklmnopqrstuvwxyz"

  for (const character of alphabet) {
    if (matches.length === count) {
      return matches
    }

    const evaluationId = character.repeat(24)
    const shouldSample = await shouldSampleLiveEvaluation({
      organizationId: INPUT.organizationId,
      projectId: INPUT.projectId,
      evaluationId,
      traceId: INPUT.traceId,
      sampling: 1,
    })

    if (!shouldSample) {
      matches.push(evaluationId)
    }
  }

  throw new Error(`Expected ${count} non-sampled evaluation ids for deterministic sampling tests`)
}

describe("enqueueLiveEvaluationsUseCase", () => {
  it("skips when the ended trace no longer exists", async () => {
    const { repository: traceRepository } = createFakeTraceRepository()
    const evaluationRepository = createEvaluationRepository(() =>
      Effect.die("Active evaluations should not be listed when the trace is missing"),
    )
    const { repository: scoreRepository } = createFakeScoreRepository()
    const { queuePublisher, published } = createLiveEvaluationQueuePublisher()

    const result = await Effect.runPromise(
      enqueueLiveEvaluationsUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            scoreRepository,
            liveEvaluationQueuePublisher: queuePublisher,
          }),
        ),
      ),
    )

    expect(result).toEqual({
      action: "skipped",
      reason: "trace-not-found",
      traceId: INPUT.traceId,
    })
    expect(published).toEqual([])
  })

  it("loads the trace and paginates active evaluations", async () => {
    const recordedFilterCalls: Array<{
      readonly traceId: string
      readonly filterIds: readonly string[]
    }> = []
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail()),
      listMatchingFilterIdsByTraceId: ({ traceId, filterSets }) => {
        recordedFilterCalls.push({
          traceId,
          filterIds: filterSets.map((filterSet) => filterSet.filterId),
        })

        return Effect.succeed(filterSets.map((filterSet) => filterSet.filterId))
      },
    })
    const { repository: scoreRepository } = createFakeScoreRepository()
    const { queuePublisher, published } = createLiveEvaluationQueuePublisher()

    const recordedCalls: Array<{
      readonly projectId: string
      readonly lifecycle: string | undefined
      readonly limit: number | undefined
      readonly offset: number
    }> = []

    const pages = new Map<number, EvaluationListPage>([
      [
        0,
        {
          items: [makeEvaluation("e".repeat(24), { sampling: 100 })],
          hasMore: true,
          limit: 100,
          offset: 0,
        },
      ],
      [
        100,
        {
          items: [makeEvaluation("f".repeat(24), { sampling: 100 })],
          hasMore: false,
          limit: 100,
          offset: 100,
        },
      ],
    ])

    const evaluationRepository = createEvaluationRepository(({ projectId, options }) => {
      recordedCalls.push({
        projectId,
        lifecycle: options?.lifecycle,
        limit: options?.limit,
        offset: options?.offset ?? 0,
      })

      const page = pages.get(options?.offset ?? 0) ?? pages.get(100)
      if (page === undefined) {
        return Effect.die("Expected a seeded evaluation page")
      }

      return Effect.succeed(page)
    })

    const result = await Effect.runPromise(
      enqueueLiveEvaluationsUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            scoreRepository,
            liveEvaluationQueuePublisher: queuePublisher,
          }),
        ),
      ),
    )

    expect(recordedCalls).toEqual([
      {
        projectId: INPUT.projectId,
        lifecycle: "active",
        limit: 100,
        offset: 0,
      },
      {
        projectId: INPUT.projectId,
        lifecycle: "active",
        limit: 100,
        offset: 100,
      },
    ])
    expect(recordedFilterCalls).toEqual([
      {
        traceId: INPUT.traceId,
        filterIds: ["e".repeat(24), "f".repeat(24)],
      },
    ])
    expect(published).toEqual([
      {
        organizationId: INPUT.organizationId,
        projectId: INPUT.projectId,
        evaluationId: "e".repeat(24),
        traceId: INPUT.traceId,
        dedupeKey: buildLiveEvaluationExecuteTraceDedupeKey({
          organizationId: INPUT.organizationId,
          projectId: INPUT.projectId,
          evaluationId: "e".repeat(24),
          traceId: INPUT.traceId,
        }),
      },
      {
        organizationId: INPUT.organizationId,
        projectId: INPUT.projectId,
        evaluationId: "f".repeat(24),
        traceId: INPUT.traceId,
        dedupeKey: buildLiveEvaluationExecuteTraceDedupeKey({
          organizationId: INPUT.organizationId,
          projectId: INPUT.projectId,
          evaluationId: "f".repeat(24),
          traceId: INPUT.traceId,
        }),
      },
    ])
    expect(result).toEqual({
      action: "completed",
      summary: {
        traceId: INPUT.traceId,
        sessionId: "session",
        activeEvaluationsScanned: 2,
        filterMatchedCount: 2,
        skippedPausedCount: 0,
        skippedSamplingCount: 0,
        skippedTurnCount: 0,
        publishedExecuteCount: 2,
      },
    })
  })

  it("counts sampling=0 evaluations as paused skips", async () => {
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail()),
      listMatchingFilterIdsByTraceId: ({ filterSets }) =>
        Effect.succeed(filterSets.map((filterSet) => filterSet.filterId)),
    })
    const { repository: scoreRepository } = createFakeScoreRepository()
    const { queuePublisher, published } = createLiveEvaluationQueuePublisher()

    const evaluationRepository = createEvaluationRepository(() =>
      Effect.succeed({
        items: [makeEvaluation("e".repeat(24), { sampling: 100 }), makeEvaluation("f".repeat(24), { sampling: 0 })],
        hasMore: false,
        limit: 100,
        offset: 0,
      }),
    )

    const result = await Effect.runPromise(
      enqueueLiveEvaluationsUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            scoreRepository,
            liveEvaluationQueuePublisher: queuePublisher,
          }),
        ),
      ),
    )

    expect(published).toEqual([
      {
        organizationId: INPUT.organizationId,
        projectId: INPUT.projectId,
        evaluationId: "e".repeat(24),
        traceId: INPUT.traceId,
        dedupeKey: buildLiveEvaluationExecuteTraceDedupeKey({
          organizationId: INPUT.organizationId,
          projectId: INPUT.projectId,
          evaluationId: "e".repeat(24),
          traceId: INPUT.traceId,
        }),
      },
    ])
    expect(result).toEqual({
      action: "completed",
      summary: {
        traceId: INPUT.traceId,
        sessionId: "session",
        activeEvaluationsScanned: 2,
        filterMatchedCount: 1,
        skippedPausedCount: 1,
        skippedSamplingCount: 0,
        skippedTurnCount: 0,
        publishedExecuteCount: 1,
      },
    })
  })

  it("applies filters before sampling and turn checks", async () => {
    const [matchingEvaluationId, nonMatchingEvaluationId] = await findNonSampledEvaluationIds(2)
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail()),
      listMatchingFilterIdsByTraceId: () => Effect.succeed([matchingEvaluationId]),
    })
    const turnCheckCalls: Array<{
      readonly evaluationId: string
      readonly traceId: string
      readonly sessionId: string | null | undefined
    }> = []
    const { repository: scoreRepository } = createFakeScoreRepository({
      existsByEvaluationIdAndScope: ({ evaluationId, traceId, sessionId }) => {
        turnCheckCalls.push({ evaluationId, traceId, sessionId })
        return Effect.succeed(true)
      },
    })
    const { queuePublisher, published } = createLiveEvaluationQueuePublisher()
    const evaluationRepository = createEvaluationRepository(() =>
      Effect.succeed({
        items: [
          makeEvaluation(matchingEvaluationId, { sampling: 1, turn: "first" }),
          makeEvaluation(nonMatchingEvaluationId, { sampling: 1, turn: "first" }),
        ],
        hasMore: false,
        limit: 100,
        offset: 0,
      }),
    )

    const result = await Effect.runPromise(
      enqueueLiveEvaluationsUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            scoreRepository,
            liveEvaluationQueuePublisher: queuePublisher,
          }),
        ),
      ),
    )

    expect(turnCheckCalls).toEqual([])
    expect(published).toEqual([])
    expect(result).toEqual({
      action: "completed",
      summary: {
        traceId: INPUT.traceId,
        sessionId: "session",
        activeEvaluationsScanned: 2,
        filterMatchedCount: 1,
        skippedPausedCount: 0,
        skippedSamplingCount: 1,
        skippedTurnCount: 0,
        publishedExecuteCount: 0,
      },
    })
  })

  it("applies first-turn scope checks after sampling", async () => {
    const evaluationId = "g".repeat(24)
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail()),
      listMatchingFilterIdsByTraceId: () => Effect.succeed([evaluationId]),
    })
    const turnCheckCalls: Array<{
      readonly projectId: string
      readonly evaluationId: string
      readonly traceId: string
      readonly sessionId: string | null | undefined
    }> = []
    const { repository: scoreRepository } = createFakeScoreRepository({
      existsByEvaluationIdAndScope: ({ projectId, evaluationId, traceId, sessionId }) => {
        turnCheckCalls.push({ projectId, evaluationId, traceId, sessionId })
        return Effect.succeed(true)
      },
    })
    const { queuePublisher, published } = createLiveEvaluationQueuePublisher()
    const evaluationRepository = createEvaluationRepository(() =>
      Effect.succeed({
        items: [makeEvaluation(evaluationId, { sampling: 100, turn: "first" })],
        hasMore: false,
        limit: 100,
        offset: 0,
      }),
    )

    const result = await Effect.runPromise(
      enqueueLiveEvaluationsUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            scoreRepository,
            liveEvaluationQueuePublisher: queuePublisher,
          }),
        ),
      ),
    )

    expect(turnCheckCalls).toEqual([
      {
        projectId: INPUT.projectId,
        evaluationId,
        traceId: INPUT.traceId,
        sessionId: "session",
      },
    ])
    expect(published).toEqual([])
    expect(result).toEqual({
      action: "completed",
      summary: {
        traceId: INPUT.traceId,
        sessionId: "session",
        activeEvaluationsScanned: 1,
        filterMatchedCount: 1,
        skippedPausedCount: 0,
        skippedSamplingCount: 0,
        skippedTurnCount: 1,
        publishedExecuteCount: 0,
      },
    })
  })

  it("publishes first-turn execute tasks when no prior scope score exists", async () => {
    const evaluationId = "h".repeat(24)
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail()),
      listMatchingFilterIdsByTraceId: () => Effect.succeed([evaluationId]),
    })
    const { repository: scoreRepository } = createFakeScoreRepository({
      existsByEvaluationIdAndScope: () => Effect.succeed(false),
    })
    const { queuePublisher, published } = createLiveEvaluationQueuePublisher()
    const evaluationRepository = createEvaluationRepository(() =>
      Effect.succeed({
        items: [makeEvaluation(evaluationId, { sampling: 100, turn: "first" })],
        hasMore: false,
        limit: 100,
        offset: 0,
      }),
    )

    const result = await Effect.runPromise(
      enqueueLiveEvaluationsUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            scoreRepository,
            liveEvaluationQueuePublisher: queuePublisher,
          }),
        ),
      ),
    )

    expect(published).toEqual([
      {
        organizationId: INPUT.organizationId,
        projectId: INPUT.projectId,
        evaluationId,
        traceId: INPUT.traceId,
        dedupeKey: buildLiveEvaluationExecuteTraceDedupeKey({
          organizationId: INPUT.organizationId,
          projectId: INPUT.projectId,
          evaluationId,
          traceId: INPUT.traceId,
        }),
      },
    ])
    expect(result).toEqual({
      action: "completed",
      summary: {
        traceId: INPUT.traceId,
        sessionId: "session",
        activeEvaluationsScanned: 1,
        filterMatchedCount: 1,
        skippedPausedCount: 0,
        skippedSamplingCount: 0,
        skippedTurnCount: 0,
        publishedExecuteCount: 1,
      },
    })
  })

  it("publishes trace-scoped debounced execute tasks for first-turn debounce", async () => {
    const evaluationId = "k".repeat(24)
    const debounceSeconds = 45
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail()),
      listMatchingFilterIdsByTraceId: () => Effect.succeed([evaluationId]),
    })
    const { repository: scoreRepository } = createFakeScoreRepository({
      existsByEvaluationIdAndScope: () => Effect.succeed(false),
    })
    const { queuePublisher, published } = createLiveEvaluationQueuePublisher()
    const evaluationRepository = createEvaluationRepository(() =>
      Effect.succeed({
        items: [makeEvaluation(evaluationId, { sampling: 100, turn: "first", debounce: debounceSeconds })],
        hasMore: false,
        limit: 100,
        offset: 0,
      }),
    )

    const result = await Effect.runPromise(
      enqueueLiveEvaluationsUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            scoreRepository,
            liveEvaluationQueuePublisher: queuePublisher,
          }),
        ),
      ),
    )

    expect(published).toEqual([
      {
        organizationId: INPUT.organizationId,
        projectId: INPUT.projectId,
        evaluationId,
        traceId: INPUT.traceId,
        dedupeKey: buildLiveEvaluationExecuteTraceDedupeKey({
          organizationId: INPUT.organizationId,
          projectId: INPUT.projectId,
          evaluationId,
          traceId: INPUT.traceId,
        }),
        debounceMs: toLiveEvaluationDebounceMs(debounceSeconds),
      },
    ])
    expect(result).toEqual({
      action: "completed",
      summary: {
        traceId: INPUT.traceId,
        sessionId: "session",
        activeEvaluationsScanned: 1,
        filterMatchedCount: 1,
        skippedPausedCount: 0,
        skippedSamplingCount: 0,
        skippedTurnCount: 0,
        publishedExecuteCount: 1,
      },
    })
  })

  it("keeps first-turn debounce trace-scoped across multiple eligible traces in one session", async () => {
    const evaluationId = "l".repeat(24)
    const debounceSeconds = 45
    const firstTraceId = "m".repeat(32)
    const secondTraceId = "n".repeat(32)
    const sharedSessionId = SessionId("shared-first-debounce")
    const turnCheckCalls: Array<{
      readonly projectId: string
      readonly evaluationId: string
      readonly traceId: string
      readonly sessionId: string | null | undefined
    }> = []
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: ({ traceId }) =>
        Effect.succeed(
          makeTraceDetail({
            traceId,
            sessionId: sharedSessionId,
          }),
        ),
      listMatchingFilterIdsByTraceId: () => Effect.succeed([evaluationId]),
    })
    const { repository: scoreRepository } = createFakeScoreRepository({
      existsByEvaluationIdAndScope: ({ projectId, evaluationId, traceId, sessionId }) => {
        turnCheckCalls.push({ projectId, evaluationId, traceId, sessionId })
        return Effect.succeed(false)
      },
    })
    const { queuePublisher, published } = createLiveEvaluationQueuePublisher()
    const evaluationRepository = createEvaluationRepository(() =>
      Effect.succeed({
        items: [makeEvaluation(evaluationId, { sampling: 100, turn: "first", debounce: debounceSeconds })],
        hasMore: false,
        limit: 100,
        offset: 0,
      }),
    )
    const useCaseLayer = createUseCaseLayer({
      traceRepository,
      evaluationRepository,
      scoreRepository,
      liveEvaluationQueuePublisher: queuePublisher,
    })

    await Effect.runPromise(
      enqueueLiveEvaluationsUseCase({
        ...INPUT,
        traceId: firstTraceId,
      }).pipe(Effect.provide(useCaseLayer)),
    )
    await Effect.runPromise(
      enqueueLiveEvaluationsUseCase({
        ...INPUT,
        traceId: secondTraceId,
      }).pipe(Effect.provide(useCaseLayer)),
    )

    expect(turnCheckCalls).toEqual([
      {
        projectId: INPUT.projectId,
        evaluationId,
        traceId: firstTraceId,
        sessionId: "shared-first-debounce",
      },
      {
        projectId: INPUT.projectId,
        evaluationId,
        traceId: secondTraceId,
        sessionId: "shared-first-debounce",
      },
    ])
    expect(published).toEqual([
      {
        organizationId: INPUT.organizationId,
        projectId: INPUT.projectId,
        evaluationId,
        traceId: firstTraceId,
        dedupeKey: buildLiveEvaluationExecuteTraceDedupeKey({
          organizationId: INPUT.organizationId,
          projectId: INPUT.projectId,
          evaluationId,
          traceId: firstTraceId,
        }),
        debounceMs: toLiveEvaluationDebounceMs(debounceSeconds),
      },
      {
        organizationId: INPUT.organizationId,
        projectId: INPUT.projectId,
        evaluationId,
        traceId: secondTraceId,
        dedupeKey: buildLiveEvaluationExecuteTraceDedupeKey({
          organizationId: INPUT.organizationId,
          projectId: INPUT.projectId,
          evaluationId,
          traceId: secondTraceId,
        }),
        debounceMs: toLiveEvaluationDebounceMs(debounceSeconds),
      },
    ])
  })

  it("publishes scope-scoped debounced execute tasks for every-turn debounce", async () => {
    const evaluationId = "i".repeat(24)
    const debounceSeconds = 15
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail()),
      listMatchingFilterIdsByTraceId: () => Effect.succeed([evaluationId]),
    })
    const { repository: scoreRepository } = createFakeScoreRepository()
    const { queuePublisher, published } = createLiveEvaluationQueuePublisher()
    const evaluationRepository = createEvaluationRepository(() =>
      Effect.succeed({
        items: [makeEvaluation(evaluationId, { sampling: 100, turn: "every", debounce: debounceSeconds })],
        hasMore: false,
        limit: 100,
        offset: 0,
      }),
    )

    const result = await Effect.runPromise(
      enqueueLiveEvaluationsUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            scoreRepository,
            liveEvaluationQueuePublisher: queuePublisher,
          }),
        ),
      ),
    )

    expect(published).toEqual([
      {
        organizationId: INPUT.organizationId,
        projectId: INPUT.projectId,
        evaluationId,
        traceId: INPUT.traceId,
        dedupeKey: buildLiveEvaluationExecuteScopeDedupeKey({
          organizationId: INPUT.organizationId,
          projectId: INPUT.projectId,
          evaluationId,
          traceId: INPUT.traceId,
          sessionId: "session",
        }),
        debounceMs: toLiveEvaluationDebounceMs(debounceSeconds),
      },
    ])
    expect(result).toEqual({
      action: "completed",
      summary: {
        traceId: INPUT.traceId,
        sessionId: "session",
        activeEvaluationsScanned: 1,
        filterMatchedCount: 1,
        skippedPausedCount: 0,
        skippedSamplingCount: 0,
        skippedTurnCount: 0,
        publishedExecuteCount: 1,
      },
    })
  })

  it("publishes scope-scoped debounced execute tasks for last-turn evaluations", async () => {
    const evaluationId = "j".repeat(24)
    const debounceSeconds = 30
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail()),
      listMatchingFilterIdsByTraceId: () => Effect.succeed([evaluationId]),
    })
    const { repository: scoreRepository } = createFakeScoreRepository()
    const { queuePublisher, published } = createLiveEvaluationQueuePublisher()
    const evaluationRepository = createEvaluationRepository(() =>
      Effect.succeed({
        items: [makeEvaluation(evaluationId, { sampling: 100, turn: "last", debounce: debounceSeconds })],
        hasMore: false,
        limit: 100,
        offset: 0,
      }),
    )

    const result = await Effect.runPromise(
      enqueueLiveEvaluationsUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            scoreRepository,
            liveEvaluationQueuePublisher: queuePublisher,
          }),
        ),
      ),
    )

    expect(published).toEqual([
      {
        organizationId: INPUT.organizationId,
        projectId: INPUT.projectId,
        evaluationId,
        traceId: INPUT.traceId,
        dedupeKey: buildLiveEvaluationExecuteScopeDedupeKey({
          organizationId: INPUT.organizationId,
          projectId: INPUT.projectId,
          evaluationId,
          traceId: INPUT.traceId,
          sessionId: "session",
        }),
        debounceMs: toLiveEvaluationDebounceMs(debounceSeconds),
      },
    ])
    expect(result).toEqual({
      action: "completed",
      summary: {
        traceId: INPUT.traceId,
        sessionId: "session",
        activeEvaluationsScanned: 1,
        filterMatchedCount: 1,
        skippedPausedCount: 0,
        skippedSamplingCount: 0,
        skippedTurnCount: 0,
        publishedExecuteCount: 1,
      },
    })
  })
})
