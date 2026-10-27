import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import {
  ChSqlClient,
  type FilterSet,
  NotFoundError,
  OrganizationId,
  ProjectId,
  SessionId,
  SqlClient,
  type TraceDeletionRequestId,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Trace } from "../entities/trace.ts"
import {
  buildTraceDeletionFilters,
  type TraceDeletionRequest,
  traceDeletionFiltersProblem,
} from "../entities/trace-deletion-request.ts"
import { TraceDeletionRequestRepository } from "../ports/trace-deletion-request-repository.ts"
import { TracePurgeRepository } from "../ports/trace-purge-repository.ts"
import { TraceReferencePurgeRepository } from "../ports/trace-reference-purge-repository.ts"
import { type TraceListOptions, TraceRepository } from "../ports/trace-repository.ts"
import { createFakeTraceRepository } from "../testing/fake-trace-repository.ts"
import { createTraceDeletionRequestUseCase } from "./create-trace-deletion-request.ts"
import {
  finishTraceDeletionUseCase,
  prepareTraceDeletionBatchUseCase,
  purgeTraceDeletionBatchUseCase,
  startTraceDeletionUseCase,
} from "./run-trace-deletion.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const TRACE_A = TraceId("a".repeat(32))
const TRACE_B = TraceId("b".repeat(32))
const byTag: FilterSet = { tags: [{ op: "contains", value: "customer:acme" }] }

const setup = (input: { readonly listed?: readonly TraceId[] } = {}) => {
  const requests = new Map<string, TraceDeletionRequest>()
  const written: OutboxWriteEvent[] = []
  const calls: string[] = []
  const listOptions: TraceListOptions[] = []

  const { repository: traces } = createFakeTraceRepository({
    listByProjectId: ({ options }) =>
      Effect.sync(() => {
        listOptions.push(options)
        return { items: (input.listed ?? []).map((traceId) => ({ traceId }) as Trace), hasMore: false }
      }),
  })

  const layer = Layer.mergeAll(
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
    Layer.succeed(ChSqlClient, createFakeChSqlClient()),
    Layer.succeed(TraceRepository, traces),
    Layer.succeed(OutboxEventWriter, {
      write: (event) =>
        Effect.sync(() => {
          written.push(event)
        }),
    }),
    Layer.succeed(TraceDeletionRequestRepository, {
      findById: (id: TraceDeletionRequestId) => {
        const request = requests.get(id)
        return request
          ? Effect.succeed(request)
          : Effect.fail(new NotFoundError({ entity: "TraceDeletionRequest", id }))
      },
      listByProjectId: () => Effect.succeed({ items: [...requests.values()], nextCursor: null }),
      save: (request) =>
        Effect.sync(() => {
          requests.set(request.id, request)
        }),
    }),
    Layer.succeed(TracePurgeRepository, {
      listSessionIdsByTraceIds: ({ traceIds }) =>
        Effect.sync(() => {
          calls.push("clickhouse.listSessions")
          return [SessionId("session-1"), ...traceIds.map((id) => SessionId(id))]
        }),
      countTraceRows: ({ traceIds }) =>
        Effect.sync(() => {
          calls.push("clickhouse.countTraces")
          return { spans: traceIds.length * 2, traces: traceIds.length }
        }),
      purgeTraces: () =>
        Effect.sync(() => {
          calls.push("clickhouse.purgeTraces")
        }),
      countSessionRows: () =>
        Effect.sync(() => {
          calls.push("clickhouse.countSessions")
          return { sessions: 1 }
        }),
      purgeSessions: () => Effect.succeed({ rebuiltSessions: 0 }),
    }),
    Layer.succeed(TraceReferencePurgeRepository, {
      count: () =>
        Effect.sync(() => {
          calls.push("postgres.count")
          return { scores: 1 }
        }),
      purge: () =>
        Effect.sync(() => {
          calls.push("postgres.purge")
          return {
            scores: [
              {
                scoreId: "s".repeat(24),
                signalId: "g".repeat(24),
                draftedAt: null,
                feedback: "bad answer",
                source: "annotation",
                createdAt: "2026-10-01T00:00:00.000Z",
              },
            ],
          }
        }),
    }),
  )

  const run = <A, E>(
    effect: Effect.Effect<
      A,
      E,
      | ChSqlClient
      | SqlClient
      | TraceRepository
      | OutboxEventWriter
      | TraceDeletionRequestRepository
      | TracePurgeRepository
      | TraceReferencePurgeRepository
    >,
  ) => Effect.runPromiseExit(effect.pipe(Effect.provide(layer)))

  return { run, requests, written, calls, listOptions }
}

describe("trace deletion selectors", () => {
  it("folds explicit trace ids into the filter set", () => {
    expect(buildTraceDeletionFilters({ filters: byTag, traceIds: [TRACE_A, TRACE_A, TRACE_B] })).toEqual({
      ...byTag,
      traceId: [{ op: "in", value: [TRACE_A, TRACE_B] }],
    })
  })

  it("rejects selectors that are empty or relative to the data", () => {
    expect(traceDeletionFiltersProblem({})).toMatch(/at least one/)
    expect(traceDeletionFiltersProblem({ tags: [] })).toMatch(/at least one/)
    expect(traceDeletionFiltersProblem({ cost: [{ op: "gtePercentile", value: 90 }] })).toMatch(/Percentile/)
    expect(traceDeletionFiltersProblem(byTag)).toBeNull()
  })
})

describe("createTraceDeletionRequestUseCase", () => {
  it("stores a pending request and announces it", async () => {
    const { run, requests, written } = setup()

    const exit = await run(
      createTraceDeletionRequestUseCase({
        projectId,
        filters: byTag,
        requestedBy: { type: "api_key", id: "k".repeat(24) },
      }),
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    const [stored] = [...requests.values()]
    expect(stored).toMatchObject({ organizationId, projectId, status: "pending", filters: byTag })
    expect(written).toEqual([
      expect.objectContaining({
        eventName: "TraceDeletionRequestCreated",
        payload: { organizationId, projectId, traceDeletionRequestId: stored?.id },
      }),
    ])
  })

  it("refuses an empty selector and too many trace ids", async () => {
    const { run, requests } = setup()
    const requestedBy = { type: "user", id: "u".repeat(24) } as const

    const empty = await run(createTraceDeletionRequestUseCase({ projectId, filters: {}, requestedBy }))
    const tooMany = await run(
      createTraceDeletionRequestUseCase({
        projectId,
        traceIds: Array.from({ length: 101 }, (_, index) => TraceId(String(index).padStart(32, "0"))),
        requestedBy,
      }),
    )

    expect(Exit.isFailure(empty)).toBe(true)
    expect(Exit.isFailure(tooMany)).toBe(true)
    expect(requests.size).toBe(0)
  })
})

describe("trace deletion batches", () => {
  const request = {
    id: "r".repeat(24) as TraceDeletionRequestId,
    projectId,
    filters: byTag,
    createdAt: new Date("2026-10-27T00:00:00.000Z"),
  }

  it("prepares a batch within the request's cutoff without deleting anything", async () => {
    const { run, written, calls, listOptions } = setup({ listed: [TRACE_A, TRACE_B] })

    const exit = await run(prepareTraceDeletionBatchUseCase({ request, batchSize: 500 }))

    expect(Exit.isSuccess(exit) && exit.value).toEqual({
      traceIds: [TRACE_A, TRACE_B],
      sessionIds: [SessionId("session-1"), SessionId(TRACE_A), SessionId(TRACE_B)],
      counts: {
        "postgres.scores": 1,
        "clickhouse.spans": 4,
        "clickhouse.traces": 2,
        "clickhouse.sessions": 1,
      },
    })
    expect(calls).toEqual([
      "clickhouse.listSessions",
      "postgres.count",
      "clickhouse.countTraces",
      "clickhouse.countSessions",
    ])
    expect(listOptions[0]).toMatchObject({
      limit: 500,
      filters: { ...byTag, startTime: [{ op: "lte", value: "2026-10-27T00:00:00.000Z" }] },
    })
    expect(written).toEqual([])
  })

  it("prepares an empty batch once nothing matches", async () => {
    const { run, calls } = setup()

    const exit = await run(prepareTraceDeletionBatchUseCase({ request, batchSize: 500 }))

    expect(Exit.isSuccess(exit) && exit.value.traceIds).toEqual([])
    expect(calls).toEqual([])
  })

  it("purges Postgres with its event before ClickHouse", async () => {
    const { run, written, calls } = setup()

    const exit = await run(
      purgeTraceDeletionBatchUseCase({
        requestId: request.id,
        projectId,
        traceIds: [TRACE_A, TRACE_B],
        sessionIds: [SessionId("session-1")],
      }),
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(calls).toEqual(["postgres.purge", "clickhouse.purgeTraces"])
    expect(written).toEqual([
      expect.objectContaining({
        eventName: "TracesPurged",
        payload: expect.objectContaining({
          traceDeletionRequestId: request.id,
          traceIds: [TRACE_A, TRACE_B],
          deletedScores: [expect.objectContaining({ scoreId: "s".repeat(24), signalId: "g".repeat(24) })],
        }),
      }),
    ])
  })
})

describe("start and finish", () => {
  it("records the receipt once and ignores replays of a finished request", async () => {
    const { run, requests, written } = setup()
    const created = await run(
      createTraceDeletionRequestUseCase({ projectId, filters: byTag, requestedBy: { type: "staff", id: "admin" } }),
    )
    const id = Exit.isSuccess(created) ? created.value.id : ("" as TraceDeletionRequestId)

    await run(startTraceDeletionUseCase(id))
    expect(requests.get(id)?.status).toBe("running")

    const receipt = { requestId: id, matchedTraceCount: 2, deletedRowCounts: { "clickhouse.spans": 4 } }
    await run(finishTraceDeletionUseCase(receipt))
    await run(finishTraceDeletionUseCase({ ...receipt, matchedTraceCount: 99, error: "late failure" }))
    const restarted = await run(startTraceDeletionUseCase(id))

    expect(requests.get(id)).toMatchObject({ status: "completed", matchedTraceCount: 2, error: null })
    expect(Exit.isSuccess(restarted) && restarted.value.status).toBe("completed")
    expect(written.filter((event) => event.eventName === "TraceDeletionRequestFinished")).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          status: "completed",
          matchedTraceCount: 2,
          requestedBy: { type: "staff", id: "admin" },
        }),
      }),
    ])
  })
})
