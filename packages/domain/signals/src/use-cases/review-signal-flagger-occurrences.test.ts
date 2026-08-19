import { QueuePublisher } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { type AnnotationScore, annotationScoreSchema, ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { OrganizationId, SignalId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { SIGNAL_FEEDBACK_THROTTLE_MS } from "../constants.ts"
import type { Signal } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { reviewSignalFlaggerOccurrencesUseCase } from "./review-signal-flagger-occurrences.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const signalId = SignalId("a".repeat(24))
const createdAt = new Date("2026-08-01T00:00:00.000Z")

const createPassthroughSqlClient = (): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(organizationId),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }
  return sqlClient
}

const makeSignal = (overrides: Partial<Signal> = {}): Signal => ({
  id: signalId,
  organizationId,
  projectId,
  slug: "assistant-leaks-prompts",
  name: "Assistant leaks internal prompts",
  description: "The assistant reveals its system prompt when asked indirectly.",
  source: "flagger",
  origin: "system",
  filters: null,
  assigneeId: null,
  priority: null,
  centroid: null,
  clusteredAt: null,
  promotedAt: createdAt,
  resolvedAt: null,
  ignoredAt: null,
  regressedAt: null,
  mutedAt: null,
  feedback: { value: 0, passed: false, feedback: "Never a problem" },
  deletedAt: null,
  createdAt,
  updatedAt: createdAt,
  ...overrides,
})

const makeOccurrence = (input: {
  readonly id: string
  readonly sourceId?: string
  readonly traceId?: string
  readonly metadata?: Record<string, unknown>
}): AnnotationScore =>
  annotationScoreSchema.parse({
    id: input.id.padEnd(24, "z"),
    organizationId,
    projectId,
    sessionId: "session-1",
    traceId: (input.traceId ?? "c").repeat(32).slice(0, 32),
    spanId: null,
    sourceType: "annotation",
    sourceId: input.sourceId ?? "SYSTEM",
    simulationId: null,
    signalId,
    value: 0,
    passed: false,
    feedback: "The assistant leaked its prompt",
    metadata: input.metadata ?? { rawFeedback: "leak", flaggerSlug: "refusal", flaggerTraceId: "f".repeat(32) },
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: null,
    annotatorId: null,
    createdAt,
    updatedAt: createdAt,
  })

const run = (input: { readonly signals?: readonly Signal[]; readonly occurrences?: readonly AnnotationScore[] }) => {
  const { repository: signalRepository } = createFakeSignalRepository(input.signals ?? [makeSignal()])
  const { repository: scoreRepository } = createFakeScoreRepository({
    listBySignalId: ({ options }) =>
      Effect.succeed({
        items: (input.occurrences ?? []).slice(0, options?.limit ?? 25),
        hasMore: false,
        limit: options?.limit ?? 25,
        offset: 0,
      }),
  })
  const { publisher, published } = createFakeQueuePublisher()

  const effect = reviewSignalFlaggerOccurrencesUseCase({ organizationId, projectId, signalId }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(SignalRepository, signalRepository),
        Layer.succeed(ScoreRepository, scoreRepository),
        Layer.succeed(QueuePublisher, publisher),
      ),
    ),
    Effect.provideService(SqlClient, createPassthroughSqlClient()),
  )

  return { effect, published }
}

describe("reviewSignalFlaggerOccurrencesUseCase", () => {
  it("publishes one job per distinct flagger trace, carrying the row's verdict", async () => {
    const flaggerTraceId = "f".repeat(32)
    const { effect, published } = run({
      occurrences: [
        makeOccurrence({
          id: "one",
          traceId: "1",
          metadata: { rawFeedback: "leak", flaggerSlug: "refusal", flaggerTraceId },
        }),
        // Same classification, second occurrence row: one verdict, not two.
        makeOccurrence({
          id: "two",
          traceId: "2",
          metadata: { rawFeedback: "leak", flaggerSlug: "refusal", flaggerTraceId },
        }),
        makeOccurrence({
          id: "three",
          traceId: "3",
          metadata: { rawFeedback: "lazy", flaggerSlug: "laziness", flaggerTraceId: "e".repeat(32) },
        }),
      ],
    })

    const result = await Effect.runPromise(effect)

    expect(result).toEqual({
      action: "fanned-out",
      scanned: 3,
      flaggerRows: 3,
      withoutFlaggerTrace: 0,
      published: 2,
    })
    expect(published).toHaveLength(2)
    expect(published[0]?.queue).toBe("issues")
    expect(published[0]?.task).toBe("reviewFlaggerOccurrence")
    expect(published[0]?.payload).toEqual({
      organizationId,
      projectId,
      signalId,
      flaggerTraceId,
      flaggerSlug: "refusal",
      value: 0,
      passed: false,
      feedback: "Never a problem",
    })
    expect(published[0]?.options?.dedupeKey).toBe(
      `org:${organizationId}:issues:feedback-review:${signalId}:${flaggerTraceId}`,
    )
    expect(published[0]?.options?.leadingThrottleMs).toBe(SIGNAL_FEEDBACK_THROTTLE_MS)
    expect(published[1]?.payload).toMatchObject({ flaggerSlug: "laziness", flaggerTraceId: "e".repeat(32) })
  })

  it("skips rows that are not flagger-authored or carry no flagger trace", async () => {
    const { effect, published } = run({
      occurrences: [
        // Human annotation on the same signal.
        makeOccurrence({ id: "human", traceId: "1", sourceId: "UI", metadata: { rawFeedback: "mine" } }),
        // Flagger row from before the pointer existed.
        makeOccurrence({
          id: "legacy",
          traceId: "2",
          metadata: { rawFeedback: "leak", flaggerSlug: "refusal" },
        }),
        // Deterministic detection: no generation, so no trace to grade.
        makeOccurrence({
          id: "deterministic",
          traceId: "3",
          metadata: { rawFeedback: "tool error", flaggerSlug: "tool-call-errors" },
        }),
      ],
    })

    const result = await Effect.runPromise(effect)

    expect(result).toEqual({
      action: "fanned-out",
      scanned: 3,
      flaggerRows: 2,
      withoutFlaggerTrace: 2,
      published: 0,
    })
    expect(published).toEqual([])
  })

  it("publishes nothing for a signal with no occurrences", async () => {
    const { effect, published } = run({ occurrences: [] })

    const result = await Effect.runPromise(effect)

    expect(result).toMatchObject({ action: "fanned-out", published: 0 })
    expect(published).toEqual([])
  })

  it("skips a signal that has not been graded", async () => {
    const { effect, published } = run({ signals: [makeSignal({ feedback: null })] })

    await expect(Effect.runPromise(effect)).resolves.toEqual({ action: "skipped", reason: "not-graded" })
    expect(published).toEqual([])
  })

  it("skips a signal that cannot be read", async () => {
    const { effect, published } = run({ signals: [] })

    await expect(Effect.runPromise(effect)).resolves.toEqual({ action: "skipped", reason: "signal-not-found" })
    expect(published).toEqual([])
  })
})
