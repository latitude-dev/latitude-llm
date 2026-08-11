import { EMBEDDING_DIMENSIONS } from "@domain/ai"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { type AnnotationScore, ScoreRepository, type ScoreRepositoryShape } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import {
  CacheStore,
  type CacheStoreShape,
  ChSqlClient,
  DistributedLockRepository,
  OrganizationId,
  RepositoryError,
  ScoreId,
  SessionId,
  SignalId,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeDistributedLockRepository } from "@domain/shared/testing"
import { SessionRepository } from "@domain/spans"
import { createFakeSessionRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it, type Mock, vi } from "vitest"
import { PROMOTION_MAX_SESSIONS, PROMOTION_MIN_SESSIONS } from "../constants.ts"
import type { Signal } from "../entities/signal.ts"
import { createSignalCentroid, updateSignalCentroid } from "../helpers.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { assignScoreToSignalUseCase } from "./assign-score-to-signal.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const signalId = SignalId("iiiiiiiiiiiiiiiiiiiiiiii")

const assignedAt = new Date("2026-04-01T12:00:00.000Z")

const makeEmbedding = (): number[] => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => (index === 0 ? 1 : 0))

const makeSignal = (overrides: Partial<Signal> = {}): Signal => ({
  id: signalId,
  organizationId,
  projectId,
  slug: "ACM-A1B2",
  name: "Assistant leaks tokens",
  description: "The assistant exposes secrets in its replies.",
  source: "flagger",
  origin: "system",
  filters: null,
  assigneeId: null,
  priority: null,
  centroid: updateSignalCentroid({
    centroid: { ...createSignalCentroid(), clusteredAt: assignedAt },
    score: { embedding: makeEmbedding(), sourceType: "annotation", createdAt: assignedAt },
    operation: "add",
    timestamp: assignedAt,
  }),
  clusteredAt: assignedAt,
  promotedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  regressedAt: null,
  mutedAt: null,
  deletedAt: null,
  createdAt: assignedAt,
  updatedAt: assignedAt,
  ...overrides,
})

const makeScore = (overrides: Partial<AnnotationScore> = {}): AnnotationScore => ({
  id: ScoreId("ssssssssssssssssssssssss"),
  organizationId,
  projectId,
  sessionId: SessionId("session-1"),
  traceId: null,
  spanId: null,
  sourceType: "annotation",
  sourceId: "SYSTEM",
  simulationId: null,
  signalId: null,
  value: 0.2,
  passed: false,
  feedback: "The assistant leaked a token.",
  metadata: { rawFeedback: "The assistant leaked a token." },
  error: null,
  errored: false,
  duration: 0,
  tokens: 0,
  cost: 0,
  draftedAt: null,
  annotatorId: null,
  createdAt: assignedAt,
  updatedAt: assignedAt,
  ...overrides,
})

const createPassthroughSqlClient = (): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(organizationId),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }
  return sqlClient
}

const noopCache: CacheStoreShape = {
  get: () => Effect.succeed(null),
  set: () => Effect.void,
  delete: () => Effect.void,
}

const run = ({
  signal,
  sessions,
  projectSessions = 0,
  volumeUnavailable = false,
  countSpy,
  cache = noopCache,
}: {
  readonly signal: Signal
  readonly sessions: number
  readonly projectSessions?: number
  readonly volumeUnavailable?: boolean
  readonly countSpy?: Mock<ScoreRepositoryShape["countDistinctSessionsBySignalId"]>
  readonly cache?: CacheStoreShape
}) => {
  const score = makeScore()
  const { repository: scoreRepository, scores } = createFakeScoreRepository()
  scores.set(score.id, score)
  const { repository: signalRepository, issues } = createFakeSignalRepository([signal])
  const { repository: sessionRepository } = createFakeSessionRepository({
    countByProjectId: () =>
      volumeUnavailable
        ? Effect.fail(new RepositoryError({ cause: "clickhouse unavailable", operation: "countByProjectId" }))
        : Effect.succeed({ totalCount: projectSessions }),
  })
  const outbox: { events: OutboxWriteEvent[] } = { events: [] }

  const countDistinctSessionsBySignalId =
    countSpy ?? vi.fn<ScoreRepositoryShape["countDistinctSessionsBySignalId"]>(() => Effect.succeed(sessions))

  const effect = assignScoreToSignalUseCase({
    organizationId,
    projectId,
    scoreId: score.id,
    signalId: signal.id,
    normalizedEmbedding: makeEmbedding(),
  }).pipe(
    Effect.provideService(ScoreRepository, { ...scoreRepository, countDistinctSessionsBySignalId }),
    Effect.provideService(SignalRepository, signalRepository),
    Effect.provideService(SqlClient, createPassthroughSqlClient()),
    Effect.provideService(SessionRepository, sessionRepository),
    Effect.provideService(CacheStore, cache),
    Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(organizationId) })),
    Effect.provideService(
      OutboxEventWriter,
      OutboxEventWriter.of({
        write: (event) =>
          Effect.sync(() => {
            outbox.events.push(event)
          }),
      }),
    ),
    Effect.provide(Layer.succeed(DistributedLockRepository, createFakeDistributedLockRepository().repository)),
  )

  return Effect.runPromise(effect).then((result) => ({
    result,
    outbox,
    issues,
    countDistinctSessionsBySignalId,
    promoted: issues.get(signal.id)?.promotedAt ?? null,
  }))
}

const promotedEvents = (events: readonly OutboxWriteEvent[]) =>
  events.filter((event) => event.eventName === "SignalPromoted")

/**
 * Two occurrences arriving one after the other against shared repository state,
 * which is what the per-signal lock reduces concurrent writers to.
 */
const runTwice = async (sessionsPerCall: readonly [number, number]) => {
  const signal = makeSignal()
  const { repository: signalRepository, issues } = createFakeSignalRepository([signal])
  const { repository: sessionRepository } = createFakeSessionRepository({
    countByProjectId: () => Effect.succeed({ totalCount: 0 }),
  })
  const outbox: { events: OutboxWriteEvent[] } = { events: [] }

  for (const [index, sessions] of sessionsPerCall.entries()) {
    const score = makeScore({ id: ScoreId(`s${index}`.padEnd(24, "0")), sessionId: SessionId(`session-${index}`) })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    scores.set(score.id, score)

    await Effect.runPromise(
      assignScoreToSignalUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        signalId: signal.id,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provideService(ScoreRepository, {
          ...scoreRepository,
          countDistinctSessionsBySignalId: () => Effect.succeed(sessions),
        }),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(SqlClient, createPassthroughSqlClient()),
        Effect.provideService(SessionRepository, sessionRepository),
        Effect.provideService(CacheStore, noopCache),
        Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(organizationId) })),
        Effect.provideService(
          OutboxEventWriter,
          OutboxEventWriter.of({
            write: (event) =>
              Effect.sync(() => {
                outbox.events.push(event)
              }),
          }),
        ),
        Effect.provide(Layer.succeed(DistributedLockRepository, createFakeDistributedLockRepository().repository)),
      ),
    )
  }

  return { outbox, promoted: issues.get(signal.id)?.promotedAt ?? null }
}

describe("assignScoreToSignalUseCase promotion", () => {
  it("promotes and emits once when distinct sessions reach the threshold", async () => {
    const { promoted, outbox } = await run({ signal: makeSignal(), sessions: PROMOTION_MIN_SESSIONS })

    expect(promoted).not.toBeNull()
    expect(promotedEvents(outbox.events)).toHaveLength(1)
    expect(promotedEvents(outbox.events)[0]?.payload).toMatchObject({
      signalId: signalId as string,
      triggerScoreId: "ssssssssssssssssssssssss",
    })
  })

  it("promotes exactly once when further occurrences keep arriving", async () => {
    const { promoted, outbox } = await runTwice([PROMOTION_MIN_SESSIONS, PROMOTION_MIN_SESSIONS + 5])

    expect(promoted).not.toBeNull()
    expect(promotedEvents(outbox.events)).toHaveLength(1)
  })

  it("leaves the signal unpromoted below the threshold and emits nothing", async () => {
    const { promoted, outbox } = await run({ signal: makeSignal(), sessions: PROMOTION_MIN_SESSIONS - 1 })

    expect(promoted).toBeNull()
    expect(promotedEvents(outbox.events)).toHaveLength(0)
  })

  it("never counts sessions for an already-promoted signal", async () => {
    const countSpy = vi.fn<ScoreRepositoryShape["countDistinctSessionsBySignalId"]>(() => Effect.succeed(999))
    const { promoted, outbox, countDistinctSessionsBySignalId } = await run({
      signal: makeSignal({ promotedAt: assignedAt }),
      sessions: 999,
      countSpy,
    })

    // The short-circuit is what keeps the ingestion hot path cheap: a promoted
    // signal can hold hundreds of thousands of scores.
    expect(countDistinctSessionsBySignalId).not.toHaveBeenCalled()
    expect(promoted).toEqual(assignedAt)
    expect(promotedEvents(outbox.events)).toHaveLength(0)
  })

  it("requires more evidence in a high-traffic project than in a low-traffic one", async () => {
    const highTraffic = await run({
      signal: makeSignal(),
      sessions: PROMOTION_MAX_SESSIONS - 1,
      projectSessions: 3_000_000,
    })
    expect(highTraffic.promoted).toBeNull()

    const lowTraffic = await run({
      signal: makeSignal(),
      sessions: PROMOTION_MAX_SESSIONS - 1,
      projectSessions: 500,
    })
    expect(lowTraffic.promoted).not.toBeNull()
  })

  it("falls back to the floor when the volume lookup is unavailable", async () => {
    // A high-traffic project would normally demand PROMOTION_MAX_SESSIONS, but an
    // unresolvable volume must make promotion easier rather than suppress a signal.
    const { promoted } = await run({
      signal: makeSignal(),
      sessions: PROMOTION_MIN_SESSIONS,
      projectSessions: 3_000_000,
      volumeUnavailable: true,
    })

    expect(promoted).not.toBeNull()
  })
})
