import { EMBEDDING_DIMENSIONS } from "@domain/ai"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { type AnnotationScore, ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import {
  CacheStore,
  type CacheStoreShape,
  ChSqlClient,
  DistributedLockRepository,
  OrganizationId,
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
import { describe, expect, it } from "vitest"
import { CONSOLIDATION_MAX_MERGES_PER_PASS, PROMOTION_MIN_SESSIONS } from "../constants.ts"
import type { Signal } from "../entities/signal.ts"
import { createSignalCentroid, updateSignalCentroid } from "../helpers.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { consolidateSignalCandidatesUseCase } from "./consolidate-signal-candidates.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"

// Relative to now, not a fixed date: the survivor is chosen by distinct
// sessions counted inside `PROMOTION_WINDOW_DAYS` of the merge, so fixtures
// pinned to a calendar date would age out of the window and make every
// candidate's evidence zero.
const createdAt = new Date()

const signalIdFor = (label: string) => SignalId(label.padEnd(24, "x"))

/**
 * A unit vector rotated within the first two dimensions. `angle: 0` is the
 * reference direction, so two fixtures' cosine similarity is `cos(a - b)` —
 * which is what lets a test place a neighbor precisely above or below
 * `CONSOLIDATION_MIN_SIMILARITY`.
 */
const makeEmbedding = (angle = 0): number[] =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => {
    if (index === 0) return Math.cos(angle)
    if (index === 1) return Math.sin(angle)
    return 0
  })

const makeCandidate = ({
  id,
  angle = 0,
  age = 0,
  ...overrides
}: Omit<Partial<Signal>, "id"> & {
  readonly id: string
  readonly angle?: number
  readonly age?: number
}): Signal => {
  const bornAt = new Date(createdAt.getTime() - age)
  return {
    id: signalIdFor(id),
    organizationId,
    projectId,
    slug: `ACM-${id}`,
    name: "The assistant leaked a token.",
    description: "The assistant leaked a token.",
    source: "flagger",
    origin: "system",
    filters: null,
    assigneeId: null,
    priority: null,
    centroid: updateSignalCentroid({
      centroid: { ...createSignalCentroid(), clusteredAt: bornAt },
      score: { embedding: makeEmbedding(angle), sourceType: "annotation", createdAt: bornAt },
      operation: "add",
      timestamp: bornAt,
    }),
    clusteredAt: bornAt,
    promotedAt: null,
    resolvedAt: null,
    ignoredAt: null,
    regressedAt: null,
    mutedAt: null,
    feedback: null,
    deletedAt: null,
    createdAt: bornAt,
    updatedAt: bornAt,
    ...overrides,
  }
}

const makeScore = (overrides: Omit<Partial<AnnotationScore>, "id"> & { readonly id: string }): AnnotationScore => ({
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
  createdAt,
  updatedAt: createdAt,
  ...overrides,
  id: ScoreId(overrides.id.padEnd(24, "x")),
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
  signals,
  scores = [],
  triggerId,
  projectSessions = 0,
}: {
  readonly signals: readonly Signal[]
  readonly scores?: readonly AnnotationScore[]
  readonly triggerId: string
  readonly projectSessions?: number
}) => {
  const { repository: signalRepository, issues } = createFakeSignalRepository([...signals])
  const { repository: scoreRepository, scores: scoreStore } = createFakeScoreRepository()
  for (const score of scores) scoreStore.set(score.id, score)
  const { repository: sessionRepository } = createFakeSessionRepository({
    countByProjectId: () => Effect.succeed({ totalCount: projectSessions }),
  })
  const outbox: { events: OutboxWriteEvent[] } = { events: [] }

  const effect = consolidateSignalCandidatesUseCase({
    organizationId,
    projectId,
    signalId: signalIdFor(triggerId),
  }).pipe(
    Effect.provideService(SignalRepository, signalRepository),
    Effect.provideService(ScoreRepository, scoreRepository),
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
  )

  return Effect.runPromise(effect).then((result) => ({
    result,
    outbox,
    issues,
    scores: scoreStore,
  }))
}

const eventsNamed = (events: readonly OutboxWriteEvent[], name: string) =>
  events.filter((event) => event.eventName === name)

describe("consolidateSignalCandidatesUseCase", () => {
  it("merges a near-duplicate candidate into the better-supported one", async () => {
    const survivor = makeCandidate({ id: "survivor" })
    const loser = makeCandidate({ id: "loser", angle: 0.1 })
    const scores = [
      makeScore({ id: "sc-a", signalId: survivor.id, sessionId: SessionId("session-1") }),
      makeScore({ id: "sc-b", signalId: survivor.id, sessionId: SessionId("session-2") }),
      makeScore({ id: "sc-c", signalId: loser.id, sessionId: SessionId("session-3") }),
    ]

    const { result, issues, scores: store } = await run({ signals: [survivor, loser], scores, triggerId: "loser" })

    expect(result).toMatchObject({ action: "merged", survivorId: survivor.id, loserIds: [loser.id] })
    expect(issues.get(loser.id)?.deletedAt).not.toBeNull()
    expect(issues.get(survivor.id)?.deletedAt).toBeNull()
    // The loser's evidence moved rather than disappearing with it.
    expect([...store.values()].filter((score) => score.signalId === survivor.id)).toHaveLength(3)
  })

  it("never absorbs a promoted signal, and never picks one as survivor", async () => {
    const candidate = makeCandidate({ id: "candidate" })
    const promoted = makeCandidate({ id: "promoted", angle: 0.05, promotedAt: createdAt })

    const fromCandidate = await run({ signals: [candidate, promoted], triggerId: "candidate" })
    expect(fromCandidate.result).toEqual({ action: "skipped", reason: "no-neighbors" })
    expect(fromCandidate.issues.get(promoted.id)?.deletedAt).toBeNull()

    const fromPromoted = await run({ signals: [candidate, promoted], triggerId: "promoted" })
    expect(fromPromoted.result).toEqual({ action: "skipped", reason: "promoted" })
    expect(fromPromoted.issues.get(candidate.id)?.deletedAt).toBeNull()
  })

  it("leaves candidates that are merely similar alone", async () => {
    const candidate = makeCandidate({ id: "candidate" })
    // ~0.54 cosine — well under the merge floor, inside the band the Related
    // list calls "related but distinct".
    const distant = makeCandidate({ id: "distant", angle: 1 })

    const { result, issues } = await run({ signals: [candidate, distant], triggerId: "candidate" })

    expect(result).toEqual({ action: "skipped", reason: "no-neighbors" })
    expect(issues.get(distant.id)?.deletedAt).toBeNull()
  })

  it("caps the merges per pass and reports that the cap bound", async () => {
    const trigger = makeCandidate({ id: "trigger" })
    const neighbors = Array.from({ length: CONSOLIDATION_MAX_MERGES_PER_PASS + 2 }, (_, index) =>
      makeCandidate({ id: `n${index}`, angle: 0.01 * (index + 1) }),
    )

    const { result, issues } = await run({ signals: [trigger, ...neighbors], triggerId: "trigger" })

    if (result.action !== "merged") throw new Error(`expected a merge, got ${result.action}`)
    expect(result.capBound).toBe(true)
    // The pass admits the cap plus the trigger; one of those is the survivor.
    expect(result.loserIds).toHaveLength(CONSOLIDATION_MAX_MERGES_PER_PASS)
    const deleted = [...issues.values()].filter((issue) => issue.deletedAt != null)
    expect(deleted).toHaveLength(CONSOLIDATION_MAX_MERGES_PER_PASS)
  })

  it("qualifies the survivor when the merged evidence crosses the gate", async () => {
    const first = makeCandidate({ id: "first" })
    const second = makeCandidate({ id: "second", angle: 0.1 })
    // One session each: neither fragment can clear a floor of 2 alone.
    const scores = [
      makeScore({ id: "sc-a", signalId: first.id, sessionId: SessionId("session-1") }),
      makeScore({ id: "sc-b", signalId: second.id, sessionId: SessionId("session-2") }),
    ]
    expect(PROMOTION_MIN_SESSIONS).toBe(2)

    const { result, outbox } = await run({ signals: [first, second], scores, triggerId: "second" })

    if (result.action !== "merged") throw new Error(`expected a merge, got ${result.action}`)
    expect(result.qualified).toBe(true)
    const qualified = eventsNamed(outbox.events, "SignalQualifiedForPromotion")
    expect(qualified).toHaveLength(1)
    expect(qualified[0]?.payload).toMatchObject({ signalId: result.survivorId, triggerScoreId: null })
  })

  it("emits the reconciliation intent and points the losers at their survivor", async () => {
    const survivor = makeCandidate({ id: "survivor" })
    const loser = makeCandidate({ id: "loser", angle: 0.1 })
    const scores = [
      makeScore({ id: "sc-a", signalId: survivor.id, sessionId: SessionId("session-1") }),
      makeScore({ id: "sc-b", signalId: survivor.id, sessionId: SessionId("session-2") }),
      makeScore({ id: "sc-c", signalId: loser.id, sessionId: SessionId("session-3") }),
    ]

    const { outbox, issues } = await run({ signals: [survivor, loser], scores, triggerId: "loser" })

    const consolidated = eventsNamed(outbox.events, "SignalsConsolidated")
    expect(consolidated).toHaveLength(1)
    expect(consolidated[0]?.payload).toMatchObject({ survivorId: survivor.id, loserIds: [loser.id] })
    // The event carries identity only; what the mutation sweeps is resolved from
    // the pointer the merge just wrote, so a later merge can find it too.
    expect(issues.get(loser.id)?.deletedAt).not.toBeNull()
  })

  it("is a no-op on a re-run, because the losers are already gone", async () => {
    const survivor = makeCandidate({ id: "survivor" })
    const loser = makeCandidate({ id: "loser", angle: 0.1 })
    const { repository: signalRepository, issues } = createFakeSignalRepository([survivor, loser])
    const { repository: scoreRepository, scores: scoreStore } = createFakeScoreRepository()
    // Enough evidence on the survivor that the trigger is the one absorbed, so
    // the second pass looks for a signal that no longer exists.
    for (const score of [
      makeScore({ id: "sc-a", signalId: survivor.id, sessionId: SessionId("session-1") }),
      makeScore({ id: "sc-b", signalId: survivor.id, sessionId: SessionId("session-2") }),
    ]) {
      scoreStore.set(score.id, score)
    }
    const { repository: sessionRepository } = createFakeSessionRepository({
      countByProjectId: () => Effect.succeed({ totalCount: 0 }),
    })
    const outbox: { events: OutboxWriteEvent[] } = { events: [] }

    const pass = () =>
      Effect.runPromise(
        consolidateSignalCandidatesUseCase({
          organizationId,
          projectId,
          signalId: loser.id,
        }).pipe(
          Effect.provideService(SignalRepository, signalRepository),
          Effect.provideService(ScoreRepository, scoreRepository),
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

    expect(await pass()).toMatchObject({ action: "merged" })
    expect(await pass()).toEqual({ action: "skipped", reason: "not-found" })
    expect(eventsNamed(outbox.events, "SignalsConsolidated")).toHaveLength(1)
    expect(issues.get(survivor.id)?.deletedAt).toBeNull()
  })
})
