import { ScoreAnalyticsRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository } from "@domain/scores/testing"
import { ChSqlClient, OrganizationId, ProjectId, SignalId, SqlClient } from "@domain/shared"
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
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { recomputeSignalLevelUseCase } from "./recompute-signal-level.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")
const orgId = OrganizationId(cuid("o"))
const projectId = ProjectId(cuid("p"))
const signalId = SignalId(cuid("s"))
const createdAt = new Date("2026-08-01T00:00:00.000Z")

const makeSignal = (priority: SignalPriority | null): Signal => ({
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

  const layer = Layer.mergeAll(
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

  it("skips a signal it cannot find", async () => {
    const { result } = await run({ signal: null, affectedSessions: 0, totalSessions: 0 })

    expect(result).toMatchObject({ status: "skipped", reason: "signal-not-found" })
  })

  // A project with no sessions yet divides by zero otherwise.
  it("treats an empty project as no impact", async () => {
    const { result } = await run({ signal: makeSignal(null), affectedSessions: 0, totalSessions: 0 })

    expect(result).toMatchObject({ status: "updated", level: "low" })
  })
})
