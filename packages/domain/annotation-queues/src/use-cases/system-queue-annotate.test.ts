import { AIError } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "@domain/scores/testing"
import {
  BadRequestError,
  ExternalUserId,
  generateId,
  NotFoundError,
  OrganizationId,
  OutboxEventWriter,
  ProjectId,
  type RepositoryError,
  SessionId,
  SimulationId,
  SpanId,
  SqlClient,
  TraceId,
} from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import type { Span, TraceDetail } from "@domain/spans"
import { SpanRepository, TraceRepository } from "@domain/spans"
import { createFakeSpanRepository, createFakeTraceRepository, stubListSpan } from "@domain/spans/testing"
import { Cause, Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { AnnotationQueue } from "../entities/annotation-queue.ts"
import type { AnnotationQueueItem } from "../entities/annotation-queue-items.ts"
import { AnnotationQueueItemRepository } from "../ports/annotation-queue-item-repository.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"
import { systemQueueAnnotateUseCase } from "./system-queue-annotate.ts"
import type { SystemQueueAnnotateInput } from "./system-queue-annotator-contracts.ts"

const cuid = "a".repeat(24)
const projectCuid = "b".repeat(24)
const traceIdRaw = "d".repeat(32)
const traceId = TraceId(traceIdRaw)
const queueId = "q".repeat(24)
const defaultResolvedSpanId = SpanId("s".repeat(16))

const INPUT: SystemQueueAnnotateInput = {
  organizationId: cuid,
  projectId: projectCuid,
  queueSlug: "jailbreaking",
  traceId: traceIdRaw,
}

function makeSystemQueue(overrides?: Partial<AnnotationQueue>): AnnotationQueue {
  return {
    id: queueId,
    organizationId: cuid,
    projectId: projectCuid,
    system: true,
    name: "Jailbreaking",
    slug: "jailbreaking",
    description: "Attempts to bypass system or safety constraints",
    instructions: "Use this queue for prompt injection attempts",
    settings: {},
    assignees: [],
    totalItems: 0,
    completedItems: 0,
    deletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  }
}

function makeTraceDetail(): TraceDetail {
  return {
    organizationId: OrganizationId(cuid),
    projectId: ProjectId(projectCuid),
    traceId,
    spanCount: 1,
    errorCount: 0,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    endTime: new Date("2026-01-01T00:00:01.000Z"),
    durationNs: 1,
    timeToFirstTokenNs: 0,
    tokensInput: 0,
    tokensOutput: 0,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    tokensTotal: 0,
    costInputMicrocents: 0,
    costOutputMicrocents: 0,
    costTotalMicrocents: 0,
    sessionId: SessionId("session"),
    userId: ExternalUserId("user"),
    simulationId: SimulationId(""),
    tags: [],
    metadata: {},
    models: [],
    providers: [],
    serviceNames: [],
    rootSpanId: SpanId("r".repeat(16)),
    rootSpanName: "root",
    systemInstructions: [],
    inputMessages: [],
    outputMessages: [],
    allMessages: [],
  }
}

function defaultCompletionSpan(): Span {
  return stubListSpan({
    organizationId: OrganizationId(cuid),
    projectId: ProjectId(projectCuid),
    traceId,
    sessionId: SessionId("session"),
    spanId: defaultResolvedSpanId,
    operation: "chat",
    startTime: new Date("2026-03-24T00:00:00.000Z"),
    endTime: new Date("2026-03-24T00:01:00.000Z"),
  })
}

function createFakeAnnotationQueueRepository(overrides?: {
  findSystemQueueBySlugInProject?: (input: {
    projectId: ProjectId
    queueSlug: string
  }) => Effect.Effect<AnnotationQueue | null, RepositoryError>
}) {
  const queues = new Map<string, AnnotationQueue>()

  const repository = {
    listByProject: () => Effect.succeed({ items: [] as AnnotationQueue[], hasMore: false }),
    findByIdInProject: () => Effect.succeed(null),
    findBySlugInProject: () => Effect.succeed(null),
    listSystemQueuesByProject: () => Effect.succeed([] as AnnotationQueue[]),
    findSystemQueueBySlugInProject: (input: { projectId: ProjectId; queueSlug: string }) => {
      if (overrides?.findSystemQueueBySlugInProject) {
        return overrides.findSystemQueueBySlugInProject(input)
      }
      const queue = Array.from(queues.values()).find(
        (q) => q.projectId === input.projectId && q.slug === input.queueSlug && q.system,
      )
      return Effect.succeed(queue ?? null)
    },
    save: (queue: AnnotationQueue) => {
      queues.set(queue.id, queue)
      return Effect.void
    },
    insertIfNotExists: (queue: AnnotationQueue) => {
      if (queues.has(queue.id)) {
        return Effect.succeed(false)
      }
      queues.set(queue.id, queue)
      return Effect.succeed(true)
    },
    incrementTotalItems: (input: { projectId: ProjectId; queueId: string }) => {
      const queue = queues.get(input.queueId)
      if (!queue) {
        return Effect.fail({
          _tag: "RepositoryError",
          operation: "incrementTotalItems",
          message: `Queue not found: ${input.queueId}`,
        } as RepositoryError)
      }
      const updated = { ...queue, totalItems: queue.totalItems + 1 }
      queues.set(input.queueId, updated)
      return Effect.succeed(updated)
    },
  }

  return { repository, queues }
}

function createFakeAnnotationQueueItemRepository(overrides?: {
  insertIfNotExists?: (input: {
    projectId: ProjectId
    queueId: string
    traceId: TraceId
  }) => Effect.Effect<boolean, RepositoryError>
}) {
  const items = new Map<string, AnnotationQueueItem>()

  const makeKey = (projectId: string, queueId: string, traceId: string) => `${projectId}:${queueId}:${traceId}`

  const repository = {
    listByQueue: () => Effect.succeed({ items: [] as AnnotationQueueItem[], hasMore: false }),
    findById: () => Effect.succeed(null),
    insertIfNotExists: (input: { projectId: ProjectId; queueId: string; traceId: TraceId }) => {
      if (overrides?.insertIfNotExists) {
        return overrides.insertIfNotExists(input)
      }
      const key = makeKey(input.projectId, input.queueId, input.traceId)
      if (items.has(key)) {
        return Effect.succeed(false)
      }
      const item: AnnotationQueueItem = {
        id: generateId(),
        organizationId: cuid,
        projectId: input.projectId,
        queueId: input.queueId,
        traceId: input.traceId,
        completedAt: null,
        completedBy: null,
        reviewStartedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      items.set(key, item)
      return Effect.succeed(true)
    },
  }

  return { repository, items }
}

function createTestLayers(options?: {
  traceDetail?: TraceDetail | null
  spansForTrace?: readonly Span[]
  queue?: AnnotationQueue | null
  existingDraft?: { id: string; feedback: string } | null
  annotatorResult?: { feedback: string } | null
  annotatorError?: AIError | null
}) {
  const events: unknown[] = []
  const { repository: scoreRepository, scores: scoreStore } = createFakeScoreRepository({
    findQueueDraftByTraceId: ({ projectId, queueId, traceId }) => {
      const draft = Array.from(scoreStore.values()).find(
        (s) =>
          s.projectId === projectId &&
          s.source === "annotation" &&
          s.sourceId === queueId &&
          s.traceId === traceId &&
          s.draftedAt !== null,
      )
      return Effect.succeed(draft ?? null)
    },
  })
  const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository()

  const traceDetailForLookup =
    options === undefined || options.traceDetail === undefined ? makeTraceDetail() : options.traceDetail

  const { repository: traceRepository } = createFakeTraceRepository({
    findByTraceId: () => {
      if (traceDetailForLookup === null) {
        return Effect.fail(new NotFoundError({ entity: "Trace", id: "" }))
      }
      return Effect.succeed(traceDetailForLookup)
    },
  })

  const spans = options?.spansForTrace ?? [defaultCompletionSpan()]
  const { repository: spanRepository } = createFakeSpanRepository({
    listByTraceId: () => Effect.succeed([...spans]),
  })

  const { repository: queueRepository, queues: queueStore } = createFakeAnnotationQueueRepository({
    findSystemQueueBySlugInProject: () => {
      if (options?.queue === null) {
        return Effect.succeed(null)
      }
      const queue = options?.queue ?? makeSystemQueue()
      queueStore.set(queue.id, queue)
      return Effect.succeed(queue)
    },
  })

  const { repository: itemRepository, items: itemStore } = createFakeAnnotationQueueItemRepository()

  const aiOverrides: Parameters<typeof createFakeAI>[0] = {}
  if (options?.annotatorError) {
    aiOverrides.generate = () => Effect.fail(options.annotatorError!)
  } else if (options?.annotatorResult) {
    aiOverrides.generate = <T>() =>
      Effect.succeed({
        object: { feedback: options.annotatorResult!.feedback } as T,
        tokens: 150,
        duration: 500_000_000,
      })
  } else {
    aiOverrides.generate = <T>() =>
      Effect.succeed({
        object: { feedback: "AI-generated feedback for jailbreaking attempt" } as T,
        tokens: 150,
        duration: 500_000_000,
      })
  }
  const { calls: aiCalls, layer: aiLayer } = createFakeAI(aiOverrides)

  const ScoreRepositoryTest = Layer.succeed(ScoreRepository, scoreRepository)
  const ScoreAnalyticsRepositoryTest = Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository)

  const OutboxEventWriterTest = Layer.succeed(OutboxEventWriter, {
    write: (event) =>
      Effect.sync(() => {
        events.push(event)
      }),
  })

  const SqlClientTest = Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(cuid) }))

  const TraceRepositoryTest = Layer.succeed(TraceRepository, traceRepository)
  const SpanRepositoryTest = Layer.succeed(SpanRepository, spanRepository)
  const AnnotationQueueRepositoryTest = Layer.succeed(AnnotationQueueRepository, queueRepository)
  const AnnotationQueueItemRepositoryTest = Layer.succeed(AnnotationQueueItemRepository, itemRepository)

  return {
    scoreStore,
    itemStore,
    queueStore,
    events,
    aiCalls,
    layer: Layer.mergeAll(
      ScoreRepositoryTest,
      ScoreAnalyticsRepositoryTest,
      OutboxEventWriterTest,
      SqlClientTest,
      TraceRepositoryTest,
      SpanRepositoryTest,
      AnnotationQueueRepositoryTest,
      AnnotationQueueItemRepositoryTest,
      aiLayer,
    ),
  }
}

describe("systemQueueAnnotateUseCase", () => {
  it("happy path creates queue item and queue-backed draft annotation", async () => {
    const { scoreStore, itemStore, events, layer } = createTestLayers()

    const result = await Effect.runPromise(systemQueueAnnotateUseCase(INPUT).pipe(Effect.provide(layer)))

    expect(result.queueId).toBe(queueId)
    expect(result.traceId).toBe(traceIdRaw)
    expect(result.draftAnnotationId).toBeDefined()
    expect(result.wasCreated).toBe(true)

    expect(itemStore.size).toBe(1)
    const item = Array.from(itemStore.values())[0]!
    expect(item.queueId).toBe(queueId)
    expect(item.traceId).toBe(traceIdRaw)
    expect(item.projectId).toBe(projectCuid)

    expect(scoreStore.size).toBe(1)
    const score = Array.from(scoreStore.values())[0]!
    expect(score.id).toBe(result.draftAnnotationId)
    expect(score.source).toBe("annotation")
    expect(score.sourceId).toBe(queueId)
    expect(score.draftedAt).toBeInstanceOf(Date)
    expect(score.draftedAt).not.toBeNull()
    expect(score.passed).toBe(false)
    expect(score.value).toBe(0)
    expect(score.feedback).toBe("AI-generated feedback for jailbreaking attempt")
    expect((score.metadata as { rawFeedback: string }).rawFeedback).toBe(
      "AI-generated feedback for jailbreaking attempt",
    )
    expect(score.issueId).toBeNull()
    expect(score.traceId).toBe(traceIdRaw)

    expect(events.length).toBe(0)
  })

  it("idempotent retry returns existing artifacts without duplicates", async () => {
    const feedback = "Existing draft feedback"
    const existingDraftId = generateId()

    const { scoreStore, itemStore, layer } = createTestLayers()

    scoreStore.set(existingDraftId, {
      id: existingDraftId,
      organizationId: cuid,
      projectId: projectCuid,
      sessionId: SessionId("session"),
      traceId: TraceId(traceIdRaw),
      spanId: defaultResolvedSpanId,
      source: "annotation",
      sourceId: queueId,
      simulationId: null,
      issueId: null,
      value: 0,
      passed: false,
      feedback,
      metadata: { rawFeedback: feedback },
      error: null,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      draftedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as import("@domain/scores").Score)

    const firstResult = await Effect.runPromise(systemQueueAnnotateUseCase(INPUT).pipe(Effect.provide(layer)))

    expect(firstResult.queueId).toBe(queueId)
    expect(firstResult.traceId).toBe(traceIdRaw)
    expect(firstResult.draftAnnotationId).toBe(existingDraftId)
    expect(firstResult.wasCreated).toBe(true)

    expect(itemStore.size).toBe(1)
    expect(scoreStore.size).toBe(1)

    const secondResult = await Effect.runPromise(systemQueueAnnotateUseCase(INPUT).pipe(Effect.provide(layer)))

    expect(secondResult.queueId).toBe(queueId)
    expect(secondResult.traceId).toBe(traceIdRaw)
    expect(secondResult.draftAnnotationId).toBe(existingDraftId)
    expect(secondResult.wasCreated).toBe(false)

    expect(itemStore.size).toBe(1)
    expect(scoreStore.size).toBe(1)
  })

  it("multi-match traces create independent drafts per queue", async () => {
    const refusalQueueId = "r".repeat(24)

    const { scoreStore, itemStore, layer } = createTestLayers()

    const jailbreakResult = await Effect.runPromise(
      systemQueueAnnotateUseCase({ ...INPUT, queueSlug: "jailbreaking" }).pipe(Effect.provide(layer)),
    )

    expect(jailbreakResult.queueId).toBe(queueId)
    expect(jailbreakResult.wasCreated).toBe(true)

    const refusalLayer = createTestLayers({
      queue: makeSystemQueue({
        id: refusalQueueId,
        slug: "refusal",
        name: "Refusal",
        description: "The assistant refuses a request it should handle",
      }),
    })

    const refusalResult = await Effect.runPromise(
      systemQueueAnnotateUseCase({ ...INPUT, queueSlug: "refusal" }).pipe(Effect.provide(refusalLayer.layer)),
    )

    expect(refusalResult.queueId).toBe(refusalQueueId)
    expect(refusalResult.wasCreated).toBe(true)
    expect(refusalResult.draftAnnotationId).not.toBe(jailbreakResult.draftAnnotationId)

    expect(itemStore.size).toBe(1)
    expect(scoreStore.size).toBe(1)
    expect(refusalLayer.itemStore.size).toBe(1)
    expect(refusalLayer.scoreStore.size).toBe(1)
  })

  it("annotator failure persists neither artifact", async () => {
    const { scoreStore, itemStore, layer } = createTestLayers({
      annotatorError: new AIError({ message: "Model unavailable", cause: null }),
    })

    const exit = await Effect.runPromise(Effect.exit(systemQueueAnnotateUseCase(INPUT).pipe(Effect.provide(layer))))

    expect(exit._tag).toBe("Failure")

    expect(itemStore.size).toBe(0)
    expect(scoreStore.size).toBe(0)
  })

  it("returns BadRequestError when queue not found", async () => {
    const { layer } = createTestLayers({ queue: null })

    const exit = await Effect.runPromise(Effect.exit(systemQueueAnnotateUseCase(INPUT).pipe(Effect.provide(layer))))

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      const errOpt = Cause.findErrorOption(exit.cause)
      expect(errOpt._tag).toBe("Some")
      if (errOpt._tag === "Some") {
        expect(errOpt.value).toBeInstanceOf(BadRequestError)
        expect((errOpt.value as BadRequestError).message).toContain("System queue not found")
      }
    }
  })

  it("draft has correct defaults for system queue annotations", async () => {
    const { scoreStore, layer } = createTestLayers()

    await Effect.runPromise(systemQueueAnnotateUseCase(INPUT).pipe(Effect.provide(layer)))

    const score = Array.from(scoreStore.values())[0]!
    expect(score.passed).toBe(false)
    expect(score.value).toBe(0)
    expect(score.issueId).toBeNull()
    expect(score.draftedAt).not.toBeNull()
    expect(score.source).toBe("annotation")
    expect(score.sourceId).toBe(queueId)
  })

  it("resolves trace context for draft annotation", async () => {
    const { scoreStore, layer } = createTestLayers()

    await Effect.runPromise(systemQueueAnnotateUseCase(INPUT).pipe(Effect.provide(layer)))

    const score = Array.from(scoreStore.values())[0]!
    expect(score.sessionId).toBe(SessionId("session"))
    expect(score.spanId).toBe(defaultResolvedSpanId)
  })
})
