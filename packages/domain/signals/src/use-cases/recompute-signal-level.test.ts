import { ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "@domain/scores/testing"
import { ChSqlClient, OrganizationId, ProjectId, ScoreId, SessionId, SignalId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import {
  SessionRepository,
  type SessionRepositoryShape,
  TraceRepository,
  type TraceRepositoryShape,
} from "@domain/spans"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal, SignalPriority } from "../entities/signal.ts"
import { SessionAbandonmentRepository } from "../ports/session-abandonment-repository.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { recomputeSignalLevelUseCase } from "./recompute-signal-level.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")
const orgId = OrganizationId(cuid("o"))
const projectId = ProjectId(cuid("p"))
const signalId = SignalId(cuid("s"))
const createdAt = new Date("2026-08-01T00:00:00.000Z")

const makeSignal = (priority: SignalPriority | null, priorityFloor: SignalPriority | null = null): Signal => ({
  priorityFloor,
  id: signalId,
  organizationId: orgId,
  projectId,
  slug: "tool-errors",
  name: "Tool errors",
  description: "A tool keeps failing.",
  source: "flagger",
  origin: "system",
  assigneeId: null,
  priority,
  centroid: null,
  clusteredAt: null,
  resolvedAt: null,
  ignoredAt: null,
  regressedAt: null,
  mutedAt: null,
  createdAt,
  updatedAt: createdAt,
})

/** Impact is a share, so the layer takes affected and total sessions separately. */
const makeLayer = (input: {
  readonly signal?: Signal | null
  readonly affectedSessions: number
  readonly totalSessions: number
  /** Occurrences the signal owns, for the abandonment floor. */
  readonly occurrences?: readonly {
    readonly sessionId: string
    readonly flaggerSlug: string
    readonly messageIndex: number
  }[]
  /** Session id -> index the user was seen abandoning at. */
  readonly abandonedAt?: Readonly<Record<string, number>>
}) => {
  const { repository: signalRepository, issues } = createFakeSignalRepository(input.signal ? [input.signal] : [])
  const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
    aggregateImpactBySignal: ({ signalId: id }) =>
      Effect.succeed({
        signalId: id,
        occurrences: input.affectedSessions,
        affectedTraces: input.affectedSessions,
        affectedSessions: input.affectedSessions,
        affectedUsers: input.affectedSessions,
        costMicrocents: 0,
        tokens: 0,
      }),
  })
  const traceRepository = {
    countByProjectId: () => Effect.succeed({ totalCount: input.totalSessions }),
  } as unknown as TraceRepositoryShape
  const sessionRepository = {
    countByProjectId: () => Effect.succeed({ totalCount: input.totalSessions }),
  } as unknown as SessionRepositoryShape

  const { repository: scoreRepository, scores } = createFakeScoreRepository()
  for (const [index, occurrence] of (input.occurrences ?? []).entries()) {
    const id = ScoreId(`occ${index}`.padEnd(24, "x"))
    scores.set(id, {
      id,
      organizationId: orgId,
      projectId,
      sessionId: SessionId(occurrence.sessionId),
      traceId: null,
      spanId: null,
      sourceType: "annotation",
      sourceId: "SYSTEM",
      simulationId: null,
      signalId,
      value: 0,
      passed: false,
      feedback: 'Tool "x" returned error: boom',
      metadata: { flaggerSlug: occurrence.flaggerSlug, messageIndex: occurrence.messageIndex },
      error: null,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      draftedAt: null,
      annotatorId: null,
      createdAt,
      updatedAt: createdAt,
    } as never)
  }

  const layer = Layer.mergeAll(
    Layer.succeed(ScoreRepository, scoreRepository),
    Layer.succeed(SessionAbandonmentRepository, {
      listAbandonmentIndexBySession: () => Effect.succeed(new Map(Object.entries(input.abandonedAt ?? {}))),
    }),
    Layer.succeed(SignalRepository, signalRepository),
    Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
    Layer.succeed(TraceRepository, traceRepository),
    Layer.succeed(SessionRepository, sessionRepository),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
    Layer.succeed(ChSqlClient, createFakeChSqlClient()),
  )
  return { layer, issues }
}

const run = (input: {
  readonly signal?: Signal | null
  readonly affectedSessions: number
  readonly totalSessions: number
  readonly escalating?: boolean
  readonly occurrences?: readonly {
    readonly sessionId: string
    readonly flaggerSlug: string
    readonly messageIndex: number
  }[]
  readonly abandonedAt?: Readonly<Record<string, number>>
}) => {
  const { layer, issues } = makeLayer(input)
  return Effect.runPromise(
    recomputeSignalLevelUseCase({
      organizationId: orgId,
      projectId,
      signalId,
      escalating: input.escalating ?? false,
    }).pipe(Effect.provide(layer)),
  ).then((result) => ({ result, issues }))
}

describe("recomputeSignalLevelUseCase", () => {
  it("promotes a signal that has spread across the project", async () => {
    const { result, issues } = await run({
      signal: makeSignal("low"),
      affectedSessions: 300,
      totalSessions: 1000,
    })

    expect(result).toMatchObject({ status: "updated", from: "low", level: "urgent" })
    expect(issues.get(signalId)?.priority).toBe("urgent")
  })

  // The direction that keeps the scale meaningful: without it every signal that
  // ever spiked stays high and the threshold stops sorting anything.
  it("demotes a signal whose share has faded", async () => {
    const { result, issues } = await run({
      signal: makeSignal("urgent"),
      affectedSessions: 1,
      totalSessions: 5000,
    })

    expect(result).toMatchObject({ status: "updated", from: "urgent", level: "low" })
    expect(issues.get(signalId)?.priority).toBe("low")
  })

  it("raises a tier while escalating and gives it back afterwards", async () => {
    const escalating = await run({
      signal: makeSignal(null),
      affectedSessions: 20,
      totalSessions: 1000,
      escalating: true,
    })
    expect(escalating.result).toMatchObject({ status: "updated", level: "high" })

    const settled = await run({
      signal: makeSignal("high"),
      affectedSessions: 20,
      totalSessions: 1000,
      escalating: false,
    })
    expect(settled.result).toMatchObject({ status: "updated", from: "high", level: "medium" })
  })

  it("writes nothing when the level already matches", async () => {
    const { result, issues } = await run({
      signal: makeSignal("low"),
      affectedSessions: 1,
      totalSessions: 5000,
    })

    expect(result).toMatchObject({ status: "unchanged", level: "low" })
    expect(issues.get(signalId)?.updatedAt).toEqual(createdAt)
  })

  it("gives an unrated signal a level", async () => {
    const { result } = await run({ signal: makeSignal(null), affectedSessions: 100, totalSessions: 1000 })

    expect(result).toMatchObject({ status: "updated", from: null, level: "high" })
  })

  // The population with no other severity input: created at `low`, never rated
  // by a model, only volume moves them. A user walking away afterwards is the one
  // piece of evidence they have, and it is a measurement rather than a judgement.
  it("floors a deterministic detector whose user walked away after it fired", async () => {
    const { result, issues } = await run({
      signal: makeSignal("low"),
      affectedSessions: 1,
      totalSessions: 5000,
      occurrences: [{ sessionId: "walked-away", flaggerSlug: "tool-call-errors", messageIndex: 3 }],
      abandonedAt: { "walked-away": 6 },
    })

    expect(result).toMatchObject({ status: "updated", from: "low", level: "medium" })
    // Persisted, so volume cannot take it back down on the next pass.
    expect(issues.get(signalId)?.priorityFloor).toBe("medium")
  })

  it("leaves a tool error nobody abandoned at the volume band", async () => {
    const { result, issues } = await run({
      signal: makeSignal("low"),
      affectedSessions: 1,
      totalSessions: 5000,
      occurrences: [{ sessionId: "carried-on", flaggerSlug: "tool-call-errors", messageIndex: 3 }],
      abandonedAt: {},
    })

    expect(result).toMatchObject({ status: "unchanged", level: "low" })
    expect(issues.get(signalId)?.priorityFloor ?? null).toBeNull()
  })

  // Ordering, not co-occurrence: a user who gave up before the tool ever failed
  // did not give up because of it.
  it("ignores abandonment that preceded the detector match", async () => {
    const { result } = await run({
      signal: makeSignal("low"),
      affectedSessions: 1,
      totalSessions: 5000,
      occurrences: [{ sessionId: "gave-up-early", flaggerSlug: "tool-call-errors", messageIndex: 9 }],
      abandonedAt: { "gave-up-early": 2 },
    })

    expect(result).toMatchObject({ status: "unchanged", level: "low" })
  })

  // Volume still owns everything above the floor.
  it("lets volume raise a floored signal further", async () => {
    const { result } = await run({
      signal: makeSignal("low"),
      affectedSessions: 300,
      totalSessions: 1000,
      occurrences: [{ sessionId: "walked-away", flaggerSlug: "tool-call-errors", messageIndex: 1 }],
      abandonedAt: { "walked-away": 4 },
    })

    expect(result).toMatchObject({ status: "updated", level: "urgent" })
  })

  it("skips a signal it cannot find", async () => {
    const { result } = await run({ signal: null, affectedSessions: 0, totalSessions: 0 })

    expect(result).toMatchObject({ status: "skipped", reason: "signal-not-found" })
  })

  // The card-number case: one session out of five thousand, and demoting it
  // would be the system overruling a severity judgement with a headcount.
  it("will not demote below the floor a rating established", async () => {
    const { result, issues } = await run({
      signal: makeSignal("urgent", "urgent"),
      affectedSessions: 1,
      totalSessions: 5000,
    })

    expect(result).toMatchObject({ status: "unchanged", level: "urgent" })
    expect(issues.get(signalId)?.priority).toBe("urgent")
  })

  // The floor only stops the downward move. A signal somebody filed as `low` has
  // to be able to reach them when it turns into most of the traffic.
  it("still promotes a floored signal when volume overtakes the floor", async () => {
    const { result } = await run({
      signal: makeSignal("low", "low"),
      affectedSessions: 300,
      totalSessions: 1000,
    })

    expect(result).toMatchObject({ status: "updated", from: "low", level: "urgent" })
  })

  // Deterministic detectors assert nothing about severity, so they get no floor
  // and volume owns them in both directions.
  it("demotes an unfloored signal all the way", async () => {
    const { result } = await run({
      signal: makeSignal("high", null),
      affectedSessions: 1,
      totalSessions: 5000,
    })

    expect(result).toMatchObject({ status: "updated", from: "high", level: "low" })
  })

  // A project with no sessions yet divides by zero otherwise.
  it("treats an empty project as no impact", async () => {
    const { result } = await run({ signal: makeSignal(null), affectedSessions: 0, totalSessions: 0 })

    expect(result).toMatchObject({ status: "updated", level: "low" })
  })
})
