import { ScoreAnalyticsRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository } from "@domain/scores/testing"
import { ChSqlClient, OrganizationId, ProjectId, SignalId, SqlClient, TraceId } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal } from "../entities/signal.ts"
import { createSignalCentroid } from "../helpers.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { listSessionSignalsUseCase } from "./list-session-signals.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const traceId = (seed: string) => TraceId(seed.repeat(32).slice(0, 32))

const makeSignal = (overrides: Partial<Signal> = {}): Signal => ({
  id: SignalId("i".repeat(24)),
  organizationId: organizationId as string,
  projectId: projectId as string,
  slug: "repeated-failure",
  name: "Repeated failure",
  description: "The assistant repeatedly fails the task",
  source: "annotation",
  origin: "system",
  scoreEvidence: [],
  filters: null,
  assigneeId: null,
  priority: null,
  centroid: createSignalCentroid(),
  clusteredAt: new Date("2026-03-01T00:00:00.000Z"),
  promotedAt: new Date("2026-03-01T00:00:00.000Z"),
  resolvedAt: null,
  ignoredAt: null,
  regressedAt: null,
  mutedAt: null,
  feedback: null,
  deletedAt: null,
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
  updatedAt: new Date("2026-03-01T00:00:00.000Z"),
  ...overrides,
})

const buildLayer = (input: {
  readonly rollups?: ReadonlyArray<{
    signalId: string
    occurrences: number
    firstSeenAt: Date
    lastSeenAt: Date
    traceIds: readonly string[]
  }>
  readonly signals?: readonly Signal[]
}) => {
  const { repository: scoreAnalytics } = createFakeScoreAnalyticsRepository({
    listSignalsByTraceIds: () =>
      Effect.succeed(
        (input.rollups ?? []).map((r) => ({
          signalId: SignalId(r.signalId),
          occurrences: r.occurrences,
          firstSeenAt: r.firstSeenAt,
          lastSeenAt: r.lastSeenAt,
          traceIds: r.traceIds.map((t) => TraceId(t)),
        })),
      ),
  })
  const { repository: signalRepo } = createFakeSignalRepository(input.signals ?? [])
  return Layer.mergeAll(
    Layer.succeed(ScoreAnalyticsRepository, scoreAnalytics),
    Layer.succeed(SignalRepository, signalRepo),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
    Layer.succeed(SqlClient, createFakeSqlClient()),
  )
}

describe("listSessionSignalsUseCase", () => {
  it("returns an empty list when the session has no traces", async () => {
    const result = await Effect.runPromise(
      listSessionSignalsUseCase({ organizationId, projectId, traceIds: [] }).pipe(Effect.provide(buildLayer({}))),
    )
    expect(result).toEqual([])
  })

  it("joins the ClickHouse rollup with the Postgres signal and derives lifecycle states", async () => {
    const signal = makeSignal({ createdAt: new Date("2020-01-01T00:00:00.000Z") })
    const layer = buildLayer({
      rollups: [
        {
          signalId: signal.id,
          occurrences: 4,
          firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
          lastSeenAt: new Date("2026-04-02T00:00:00.000Z"),
          traceIds: [traceId("a"), traceId("b")],
        },
      ],
      signals: [signal],
    })

    const result = await Effect.runPromise(
      listSessionSignalsUseCase({
        organizationId,
        projectId,
        traceIds: [traceId("a"), traceId("b")],
        now: new Date("2026-04-10T00:00:00.000Z"),
      }).pipe(Effect.provide(layer)),
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: signal.id,
      slug: "repeated-failure",
      name: "Repeated failure",
      source: "annotation",
      occurrences: 4,
      states: ["ongoing"],
      resolvedAt: null,
      ignoredAt: null,
      regressedAt: null,
      mutedAt: null,
      createdAt: signal.createdAt,
      updatedAt: signal.updatedAt,
    })
    expect(result[0]?.traceIds).toEqual([traceId("a"), traceId("b")])
  })

  it("drops a rollup whose signal is still a candidate", async () => {
    const candidate = makeSignal({ promotedAt: null })
    const layer = buildLayer({
      rollups: [
        {
          signalId: candidate.id,
          occurrences: 4,
          firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
          lastSeenAt: new Date("2026-04-02T00:00:00.000Z"),
          traceIds: [traceId("a")],
        },
      ],
      signals: [candidate],
    })

    const result = await Effect.runPromise(
      listSessionSignalsUseCase({ organizationId, projectId, traceIds: [traceId("a")] }).pipe(Effect.provide(layer)),
    )
    expect(result).toEqual([])
  })

  it("drops a rollup whose signal is missing from Postgres", async () => {
    const layer = buildLayer({
      rollups: [
        {
          signalId: SignalId("z".repeat(24)),
          occurrences: 1,
          firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
          lastSeenAt: new Date("2026-04-01T00:00:00.000Z"),
          traceIds: [traceId("a")],
        },
      ],
      signals: [],
    })

    const result = await Effect.runPromise(
      listSessionSignalsUseCase({ organizationId, projectId, traceIds: [traceId("a")] }).pipe(Effect.provide(layer)),
    )
    expect(result).toEqual([])
  })
})
