import { EMBEDDING_DIMENSIONS } from "@domain/ai"
import { OutboxEventWriter } from "@domain/events"
import { type AnnotationScore, ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import {
  DistributedLockRepository,
  OrganizationId,
  ScoreId,
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
import { assignScoreToSignalUseCase } from "./assign-score-to-signal.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const otherProjectId = "qqqqqqqqqqqqqqqqqqqqqqqq"

const makeEmbedding = (): number[] =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => {
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
  sourceType: "annotation",
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

const makeSignal = (overrides?: Partial<Signal>): Signal => ({
  id: SignalId("iiiiiiiiiiiiiiiiiiiiiiii"),
  slug: "test-issue",
  organizationId,
  projectId,
  name: "Token leakage in responses",
  description: "The assistant leaks API tokens in its response.",
  source: "annotation",
  origin: "system",
  assigneeId: null,
  priority: null,
  centroid: createSignalCentroid(),
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

const passthroughLockRepository = {
  withLock: <A, E, R>(_input: unknown, effect: Effect.Effect<A, E, R>) => effect,
}

describe("assignScoreToSignalUseCase", () => {
  it("assigns to an existing issue and requests async refresh", async () => {
    const existingSignal = makeSignal()
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: signalRepository, issues } = createFakeSignalRepository([existingSignal])
    const score = makeScore()
    scores.set(score.id, score)
    const writtenEvents: unknown[] = []

    const result = await Effect.runPromise(
      assignScoreToSignalUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        signalId: existingSignal.id,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(OutboxEventWriter, {
          write: (event) =>
            Effect.sync(() => {
              writtenEvents.push(event)
            }),
        }),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
        Effect.provideService(DistributedLockRepository, passthroughLockRepository),
      ),
    )

    expect(result).toEqual({
      action: "assigned",
      signalId: existingSignal.id,
    })
    expect(scores.get(score.id)?.signalId).toBe(existingSignal.id)
    expect(issues.get(existingSignal.id)?.centroid?.mass).toBeGreaterThan(0)
    expect(writtenEvents).toEqual([
      expect.objectContaining({
        eventName: "ScoreAssignedToSignal",
        aggregateType: "score",
        aggregateId: score.id,
        organizationId,
        payload: expect.objectContaining({
          projectId,
          signalId: existingSignal.id,
          organizationId,
        }),
      }),
    ])
  })

  it("locks the canonical issue row before updating the centroid", async () => {
    const existingSignal = makeSignal()
    const lockCalls: string[] = []
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    // findById is allowed (the post-tx projection sync legitimately uses it); we only assert that
    // findByIdForUpdate is what gates the centroid recompute path.
    const { repository: signalRepository } = createFakeSignalRepository([existingSignal], {
      findByIdForUpdate: (id) => {
        lockCalls.push(id)
        return Effect.succeed(existingSignal)
      },
    })
    const score = makeScore()
    scores.set(score.id, score)

    await Effect.runPromise(
      assignScoreToSignalUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        signalId: existingSignal.id,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
        Effect.provideService(DistributedLockRepository, passthroughLockRepository),
      ),
    )

    expect(lockCalls).toEqual([existingSignal.id])
  })

  it("returns already-assigned without mutating the issue when the score is already linked", async () => {
    const existingSignal = makeSignal()
    const winningSignalId = SignalId("wwwwwwwwwwwwwwwwwwwwwwww")
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: signalRepository, issues } = createFakeSignalRepository([existingSignal])
    const score = makeScore({
      signalId: winningSignalId,
    })
    scores.set(score.id, score)
    const writtenEvents: unknown[] = []

    const result = await Effect.runPromise(
      assignScoreToSignalUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        signalId: existingSignal.id,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(OutboxEventWriter, {
          write: (event) =>
            Effect.sync(() => {
              writtenEvents.push(event)
            }),
        }),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
        Effect.provideService(DistributedLockRepository, passthroughLockRepository),
      ),
    )

    expect(result).toEqual({
      action: "already-assigned",
      signalId: winningSignalId,
    })
    expect(issues.get(existingSignal.id)?.centroid?.mass).toBe(0)
    expect(writtenEvents).toHaveLength(0)
  })

  it("returns already-assigned when another worker claims the score during assignment", async () => {
    const existingSignal = makeSignal()
    const winningSignalId = SignalId("wwwwwwwwwwwwwwwwwwwwwwww")
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
    const { repository: signalRepository, issues } = createFakeSignalRepository([existingSignal])
    const score = makeScore()
    scores.set(score.id, score)
    const writtenEvents: unknown[] = []

    const result = await Effect.runPromise(
      assignScoreToSignalUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        signalId: existingSignal.id,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(OutboxEventWriter, {
          write: (event) =>
            Effect.sync(() => {
              writtenEvents.push(event)
            }),
        }),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
        Effect.provideService(DistributedLockRepository, passthroughLockRepository),
      ),
    )

    expect(result).toEqual({
      action: "already-assigned",
      signalId: winningSignalId,
    })
    expect(issues.get(existingSignal.id)?.centroid?.mass).toBe(0)
    expect(writtenEvents).toHaveLength(0)
  })

  it("rejects assigning a score into an issue from another project", async () => {
    const foreignSignal = makeSignal({
      projectId: otherProjectId,
    })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: signalRepository, issues } = createFakeSignalRepository([foreignSignal])
    const score = makeScore()
    scores.set(score.id, score)

    const error = await Effect.runPromise(
      assignScoreToSignalUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        signalId: foreignSignal.id,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
        Effect.provideService(DistributedLockRepository, passthroughLockRepository),
        Effect.match({
          onFailure: (error) => error,
          onSuccess: () => {
            throw new Error("expected assignment to fail")
          },
        }),
      ),
    )

    expect(error._tag).toBe("SignalNotFoundForAssignmentError")
    expect(scores.get(score.id)?.signalId).toBeNull()
    expect(issues.get(foreignSignal.id)?.centroid?.mass).toBe(0)
  })

  describe("regression detection", () => {
    it("clears resolvedAt and emits SignalRegressed when score is newer than the issue's resolution", async () => {
      const resolvedAt = new Date("2026-04-01T00:00:00.000Z")
      const existingSignal = makeSignal({ resolvedAt })
      const { repository: scoreRepository, scores } = createFakeScoreRepository()
      const { repository: signalRepository, issues } = createFakeSignalRepository([existingSignal])
      const score = makeScore({ createdAt: new Date("2026-04-15T10:00:00.000Z") })
      scores.set(score.id, score)
      const writtenEvents: unknown[] = []

      await Effect.runPromise(
        assignScoreToSignalUseCase({
          organizationId,
          projectId,
          scoreId: score.id,
          signalId: existingSignal.id,
          normalizedEmbedding: makeEmbedding(),
        }).pipe(
          Effect.provideService(ScoreRepository, scoreRepository),
          Effect.provideService(SignalRepository, signalRepository),
          Effect.provideService(OutboxEventWriter, {
            write: (event) =>
              Effect.sync(() => {
                writtenEvents.push(event)
              }),
          }),
          Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
          Effect.provideService(DistributedLockRepository, passthroughLockRepository),
        ),
      )

      expect(issues.get(existingSignal.id)?.resolvedAt).toBeNull()
      expect(writtenEvents).toContainEqual(
        expect.objectContaining({
          eventName: "SignalRegressed",
          aggregateType: "issue",
          aggregateId: existingSignal.id,
          organizationId,
          payload: expect.objectContaining({
            organizationId,
            projectId,
            signalId: existingSignal.id,
            triggerScoreId: score.id,
            regressedAt: score.createdAt.toISOString(),
          }),
        }),
      )
    })

    it("does not emit SignalRegressed or clear resolvedAt for ignored issues", async () => {
      const resolvedAt = new Date("2026-04-01T00:00:00.000Z")
      const ignoredAt = new Date("2026-04-02T00:00:00.000Z")
      const existingSignal = makeSignal({ resolvedAt, ignoredAt })
      const { repository: scoreRepository, scores } = createFakeScoreRepository()
      const { repository: signalRepository, issues } = createFakeSignalRepository([existingSignal])
      const score = makeScore({ createdAt: new Date("2026-04-15T10:00:00.000Z") })
      scores.set(score.id, score)
      const writtenEvents: unknown[] = []

      await Effect.runPromise(
        assignScoreToSignalUseCase({
          organizationId,
          projectId,
          scoreId: score.id,
          signalId: existingSignal.id,
          normalizedEmbedding: makeEmbedding(),
        }).pipe(
          Effect.provideService(ScoreRepository, scoreRepository),
          Effect.provideService(SignalRepository, signalRepository),
          Effect.provideService(OutboxEventWriter, {
            write: (event) =>
              Effect.sync(() => {
                writtenEvents.push(event)
              }),
          }),
          Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
          Effect.provideService(DistributedLockRepository, passthroughLockRepository),
        ),
      )

      expect(scores.get(score.id)?.signalId).toBe(existingSignal.id)
      expect(issues.get(existingSignal.id)?.resolvedAt?.getTime()).toBe(resolvedAt.getTime())
      expect(issues.get(existingSignal.id)?.ignoredAt?.getTime()).toBe(ignoredAt.getTime())
      expect(writtenEvents.find((e) => (e as { eventName?: string }).eventName === "SignalRegressed")).toBeUndefined()
      expect(
        writtenEvents.find((e) => (e as { eventName?: string }).eventName === "ScoreAssignedToSignal"),
      ).toBeDefined()
    })

    it("does not emit SignalRegressed and preserves resolvedAt when score predates resolution", async () => {
      const resolvedAt = new Date("2026-04-15T00:00:00.000Z")
      const existingSignal = makeSignal({ resolvedAt })
      const { repository: scoreRepository, scores } = createFakeScoreRepository()
      const { repository: signalRepository, issues } = createFakeSignalRepository([existingSignal])
      const score = makeScore({ createdAt: new Date("2026-04-01T10:00:00.000Z") })
      scores.set(score.id, score)
      const writtenEvents: unknown[] = []

      await Effect.runPromise(
        assignScoreToSignalUseCase({
          organizationId,
          projectId,
          scoreId: score.id,
          signalId: existingSignal.id,
          normalizedEmbedding: makeEmbedding(),
        }).pipe(
          Effect.provideService(ScoreRepository, scoreRepository),
          Effect.provideService(SignalRepository, signalRepository),
          Effect.provideService(OutboxEventWriter, {
            write: (event) =>
              Effect.sync(() => {
                writtenEvents.push(event)
              }),
          }),
          Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
          Effect.provideService(DistributedLockRepository, passthroughLockRepository),
        ),
      )

      expect(issues.get(existingSignal.id)?.resolvedAt?.getTime()).toBe(resolvedAt.getTime())
      expect(writtenEvents.find((e) => (e as { eventName?: string }).eventName === "SignalRegressed")).toBeUndefined()
    })

    it("does not emit SignalRegressed when the issue is not resolved", async () => {
      const existingSignal = makeSignal({ resolvedAt: null })
      const { repository: scoreRepository, scores } = createFakeScoreRepository()
      const { repository: signalRepository } = createFakeSignalRepository([existingSignal])
      const score = makeScore({ createdAt: new Date("2026-05-01T10:00:00.000Z") })
      scores.set(score.id, score)
      const writtenEvents: unknown[] = []

      await Effect.runPromise(
        assignScoreToSignalUseCase({
          organizationId,
          projectId,
          scoreId: score.id,
          signalId: existingSignal.id,
          normalizedEmbedding: makeEmbedding(),
        }).pipe(
          Effect.provideService(ScoreRepository, scoreRepository),
          Effect.provideService(SignalRepository, signalRepository),
          Effect.provideService(OutboxEventWriter, {
            write: (event) =>
              Effect.sync(() => {
                writtenEvents.push(event)
              }),
          }),
          Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
          Effect.provideService(DistributedLockRepository, passthroughLockRepository),
        ),
      )

      expect(writtenEvents.find((e) => (e as { eventName?: string }).eventName === "SignalRegressed")).toBeUndefined()
    })
  })
})
