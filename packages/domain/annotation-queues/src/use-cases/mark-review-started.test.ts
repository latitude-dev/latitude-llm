import type { Score } from "@domain/scores"
import { ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { ProjectId, TraceId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { AnnotationQueueItem } from "../entities/annotation-queue-items.ts"
import { AnnotationQueueItemRepository } from "../ports/annotation-queue-item-repository.ts"
import { createFakeAnnotationQueueItemRepository } from "../testing/fake-annotation-queue-item-repository.ts"
import { markReviewStartedUseCase } from "./mark-review-started.ts"

const PROJECT_ID = ProjectId("pppppppppppppppppppppppp")
const ORG_ID = "oooooooooooooooooooooooo"
const QUEUE_ID = "qqqqqqqqqqqqqqqqqqqqqqqq"
const TRACE_ID = "t".repeat(32)

function makeItem(overrides: Partial<AnnotationQueueItem> = {}): AnnotationQueueItem {
  return {
    id: "item_001_000000000000000000",
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    queueId: QUEUE_ID,
    traceId: TraceId(TRACE_ID),
    traceCreatedAt: new Date("2025-04-01T10:00:00.000Z"),
    completedAt: null,
    completedBy: null,
    reviewStartedAt: null,
    createdAt: new Date("2025-04-01T10:00:00.000Z"),
    updatedAt: new Date("2025-04-01T10:00:00.000Z"),
    ...overrides,
  } as AnnotationQueueItem
}

function makeScore(overrides: Partial<Score> = {}): Score {
  return {
    id: "ssssssssssssssssssssssss",
    organizationId: ORG_ID,
    projectId: PROJECT_ID as string,
    sessionId: null,
    traceId: TRACE_ID,
    spanId: null,
    source: "annotation",
    sourceId: "UI",
    simulationId: null,
    issueId: null,
    value: 1,
    passed: true,
    feedback: "Good",
    metadata: {},
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: new Date(),
    annotatorId: "uuuuuuuuuuuuuuuuuuuuuuuu",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Score
}

function createTestLayers(options: {
  readonly items?: readonly AnnotationQueueItem[]
  readonly existingAnnotationCount?: number
}) {
  const { repository: itemRepo, items } = createFakeAnnotationQueueItemRepository(options.items ?? [])
  const { repository: scoreRepo } = createFakeScoreRepository()

  const annotationCount = options.existingAnnotationCount ?? 0
  const fakeAnnotations = Array.from({ length: annotationCount }, (_, i) => ({ id: `existing_${i}` }) as never)

  const ScoreRepositoryTest = Layer.succeed(ScoreRepository, {
    ...scoreRepo,
    listByTraceId: () =>
      Effect.succeed({
        items: fakeAnnotations,
        hasMore: false,
        limit: 2,
        offset: 0,
      }),
  })

  const ItemRepositoryTest = Layer.succeed(AnnotationQueueItemRepository, itemRepo)

  return {
    items,
    layer: Layer.mergeAll(ScoreRepositoryTest, ItemRepositoryTest),
  }
}

describe("markReviewStartedUseCase", () => {
  it("marks queue items as in progress when only one annotation exists (the just-created one)", async () => {
    const pendingItem = makeItem()
    const { layer, items } = createTestLayers({
      items: [pendingItem],
      existingAnnotationCount: 1,
    })

    const count = await Effect.runPromise(
      markReviewStartedUseCase({
        score: makeScore(),
      }).pipe(Effect.provide(layer)),
    )

    expect(count).toBe(1)
    const updatedItem = items.get(pendingItem.id)
    expect(updatedItem?.reviewStartedAt).not.toBeNull()
  })

  it("does not mark items when more than one annotation exists", async () => {
    const pendingItem = makeItem()
    const { layer, items } = createTestLayers({
      items: [pendingItem],
      existingAnnotationCount: 2,
    })

    const count = await Effect.runPromise(
      markReviewStartedUseCase({
        score: makeScore(),
      }).pipe(Effect.provide(layer)),
    )

    expect(count).toBe(0)
    const updatedItem = items.get(pendingItem.id)
    expect(updatedItem?.reviewStartedAt).toBeNull()
  })

  it("returns 0 when no pending items exist for the trace", async () => {
    const inProgressItem = makeItem({ reviewStartedAt: new Date() })
    const { layer } = createTestLayers({
      items: [inProgressItem],
      existingAnnotationCount: 1,
    })

    const count = await Effect.runPromise(
      markReviewStartedUseCase({
        score: makeScore(),
      }).pipe(Effect.provide(layer)),
    )

    expect(count).toBe(0)
  })

  it("returns 0 when score is not an annotation", async () => {
    const pendingItem = makeItem()
    const { layer, items } = createTestLayers({
      items: [pendingItem],
      existingAnnotationCount: 1,
    })

    const count = await Effect.runPromise(
      markReviewStartedUseCase({
        score: makeScore({ source: "evaluation" }),
      }).pipe(Effect.provide(layer)),
    )

    expect(count).toBe(0)
    const updatedItem = items.get(pendingItem.id)
    expect(updatedItem?.reviewStartedAt).toBeNull()
  })

  it("returns 0 when score has no traceId", async () => {
    const pendingItem = makeItem()
    const { layer, items } = createTestLayers({
      items: [pendingItem],
      existingAnnotationCount: 1,
    })

    const count = await Effect.runPromise(
      markReviewStartedUseCase({
        score: makeScore({ traceId: null }),
      }).pipe(Effect.provide(layer)),
    )

    expect(count).toBe(0)
    const updatedItem = items.get(pendingItem.id)
    expect(updatedItem?.reviewStartedAt).toBeNull()
  })

  it("does not mark completed items even if reviewStartedAt is null", async () => {
    const completedItem = makeItem({
      completedAt: new Date(),
      completedBy: "uuuuuuuuuuuuuuuuuuuuuuuu",
      reviewStartedAt: null,
    })
    const { layer, items } = createTestLayers({
      items: [completedItem],
      existingAnnotationCount: 1,
    })

    const count = await Effect.runPromise(
      markReviewStartedUseCase({
        score: makeScore(),
      }).pipe(Effect.provide(layer)),
    )

    expect(count).toBe(0)
    const updatedItem = items.get(completedItem.id)
    expect(updatedItem?.reviewStartedAt).toBeNull()
  })
})
