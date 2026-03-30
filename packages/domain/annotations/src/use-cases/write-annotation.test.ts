import { QueuePublisher } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { SCORE_PUBLICATION_DEBOUNCE, ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { OrganizationId, OutboxEventWriter, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { writeAnnotationUseCase } from "./write-annotation.ts"

const cuid = "a".repeat(24)
const projectCuid = "b".repeat(24)
const traceId = "d".repeat(32)

function createTestLayers() {
  const events: unknown[] = []
  const { publisher, published } = createFakeQueuePublisher()
  const { repository: scoreRepository, scores: store } = createFakeScoreRepository()

  const ScoreRepositoryTest = Layer.succeed(ScoreRepository, scoreRepository)

  const OutboxEventWriterTest = Layer.succeed(OutboxEventWriter, {
    write: (event) =>
      Effect.sync(() => {
        events.push(event)
      }),
  })

  const QueuePublisherTest = Layer.succeed(QueuePublisher, publisher)

  const SqlClientTest = Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(cuid) }))

  return {
    store,
    events,
    published,
    layer: Layer.mergeAll(ScoreRepositoryTest, OutboxEventWriterTest, QueuePublisherTest, SqlClientTest),
  }
}

describe("writeAnnotationUseCase", () => {
  it("creates an annotation score with correct defaults", async () => {
    const { store, layer } = createTestLayers()

    const score = await Effect.runPromise(
      writeAnnotationUseCase({
        projectId: projectCuid,
        sourceId: "UI",
        traceId,
        value: 0.2,
        passed: false,
        rawFeedback: "The model hallucinated a date",
      }).pipe(Effect.provide(layer)),
    )

    expect(score.source).toBe("annotation")
    expect(score.sourceId).toBe("UI")
    expect(score.draftedAt).toBeInstanceOf(Date)
    expect(score.feedback).toBe("The model hallucinated a date")
    expect(score.metadata.rawFeedback).toBe("The model hallucinated a date")
    expect(store.size).toBe(1)
  })

  it("creates annotation with API source id", async () => {
    const { layer } = createTestLayers()

    const score = await Effect.runPromise(
      writeAnnotationUseCase({
        projectId: projectCuid,
        sourceId: "API",
        value: 0.8,
        passed: true,
        rawFeedback: "Good response",
      }).pipe(Effect.provide(layer)),
    )

    expect(score.sourceId).toBe("API")
    expect(score.draftedAt).not.toBeNull()
  })

  it("creates annotation with anchor metadata", async () => {
    const { layer } = createTestLayers()

    const score = await Effect.runPromise(
      writeAnnotationUseCase({
        projectId: projectCuid,
        sourceId: "UI",
        traceId,
        value: 0.1,
        passed: false,
        rawFeedback: "Wrong claim here",
        messageIndex: 2,
        partIndex: 0,
        startOffset: 10,
        endOffset: 25,
      }).pipe(Effect.provide(layer)),
    )

    expect(score.metadata.messageIndex).toBe(2)
    expect(score.metadata.partIndex).toBe(0)
    expect(score.metadata.startOffset).toBe(10)
    expect(score.metadata.endOffset).toBe(25)
    expect(score.metadata.rawFeedback).toBe("Wrong claim here")
  })

  it("validates anchor field consistency", async () => {
    const { layer } = createTestLayers()

    // partIndex without messageIndex should fail
    await expect(
      Effect.runPromise(
        writeAnnotationUseCase({
          projectId: projectCuid,
          sourceId: "UI",
          value: 0.1,
          passed: false,
          rawFeedback: "Bad anchor",
          partIndex: 0,
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toThrow()

    // startOffset without endOffset should fail
    await expect(
      Effect.runPromise(
        writeAnnotationUseCase({
          projectId: projectCuid,
          sourceId: "UI",
          value: 0.1,
          passed: false,
          rawFeedback: "Bad anchor",
          messageIndex: 1,
          partIndex: 0,
          startOffset: 5,
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toThrow()

    // startOffset > endOffset should fail
    await expect(
      Effect.runPromise(
        writeAnnotationUseCase({
          projectId: projectCuid,
          sourceId: "UI",
          value: 0.1,
          passed: false,
          rawFeedback: "Bad anchor",
          messageIndex: 1,
          partIndex: 0,
          startOffset: 20,
          endOffset: 5,
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toThrow()
  })

  it("updates a draft annotation with same id", async () => {
    const { store, layer } = createTestLayers()

    const first = await Effect.runPromise(
      writeAnnotationUseCase({
        projectId: projectCuid,
        sourceId: "UI",
        value: 0.3,
        passed: false,
        rawFeedback: "Initial feedback",
      }).pipe(Effect.provide(layer)),
    )

    const updated = await Effect.runPromise(
      writeAnnotationUseCase({
        id: first.id,
        projectId: projectCuid,
        sourceId: "UI",
        value: 0.1,
        passed: false,
        rawFeedback: "Revised feedback",
      }).pipe(Effect.provide(layer)),
    )

    expect(updated.id).toBe(first.id)
    expect(updated.feedback).toBe("Revised feedback")
    expect(updated.metadata.rawFeedback).toBe("Revised feedback")
    expect(store.size).toBe(1)
  })

  it("does not emit ScoreImmutable for drafts", async () => {
    const { events, layer } = createTestLayers()

    await Effect.runPromise(
      writeAnnotationUseCase({
        projectId: projectCuid,
        sourceId: "UI",
        value: 0.5,
        passed: true,
        rawFeedback: "All good",
      }).pipe(Effect.provide(layer)),
    )

    // Drafts are never immutable — draftedAt is always set
    expect(events.length).toBe(0)
  })

  it("publishes debounced annotation-scores:publish after write", async () => {
    const { published, layer } = createTestLayers()

    const score = await Effect.runPromise(
      writeAnnotationUseCase({
        projectId: projectCuid,
        sourceId: "UI",
        value: 0.2,
        passed: false,
        rawFeedback: "Needs enrichment later",
      }).pipe(Effect.provide(layer)),
    )

    expect(published).toEqual([
      expect.objectContaining({
        queue: "annotation-scores",
        task: "publish",
        payload: {
          organizationId: cuid,
          projectId: projectCuid,
          scoreId: score.id,
        },
        options: expect.objectContaining({
          dedupeKey: `annotation-scores:publish:${score.id}`,
          debounceMs: SCORE_PUBLICATION_DEBOUNCE,
        }),
      }),
    ])
  })
})
