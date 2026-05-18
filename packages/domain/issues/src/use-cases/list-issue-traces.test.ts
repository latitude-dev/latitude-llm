import { ScoreAnalyticsRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository } from "@domain/scores/testing"
import { ChSqlClient, IssueId, OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { type TraceDetail, TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { listIssueTracesUseCase } from "./list-issue-traces.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const issueId = IssueId("i".repeat(24))

const cuidTraceId = (seed: string) => seed.padEnd(32, "0")

const makeTraceDetail = (id: string): TraceDetail =>
  ({
    organizationId,
    projectId,
    traceId: TraceId(id),
    spanCount: 1,
    errorCount: 0,
    startTime: new Date("2026-04-01T00:00:00.000Z"),
    endTime: new Date("2026-04-01T00:00:05.000Z"),
    durationNs: 5_000_000_000,
    timeToFirstTokenNs: 0,
    tokensInput: 0,
    tokensOutput: 0,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    tokensTotal: 0,
    costInputMicrocents: 0,
    costOutputMicrocents: 0,
    costTotalMicrocents: 0,
    sessionId: "",
    userId: "",
    simulationId: "",
    tags: [],
    metadata: {},
    models: [],
    providers: [],
    serviceNames: [],
    rootSpanId: "",
    rootSpanName: "",
    systemInstructions: {},
    inputMessages: [],
    outputMessages: [],
    allMessages: [],
  }) as unknown as TraceDetail

const buildLayer = (input: {
  readonly tracePage?: {
    readonly items: readonly { readonly traceId: string; readonly lastSeenAt: Date }[]
    readonly hasMore: boolean
    readonly limit: number
    readonly offset: number
  }
  readonly traceDetails?: readonly TraceDetail[]
}) => {
  const listTracesCalls: Array<{
    readonly limit: number | undefined
    readonly offset: number | undefined
  }> = []
  const listByTraceIdsCalls: Array<readonly string[]> = []

  const { repository: scoreAnalytics } = createFakeScoreAnalyticsRepository({
    listTracesByIssue: ({ limit, offset }) =>
      Effect.sync(() => {
        listTracesCalls.push({ limit, offset })
        return {
          items: (input.tracePage?.items ?? []).map((item) => ({
            traceId: TraceId(item.traceId),
            lastSeenAt: item.lastSeenAt,
          })),
          hasMore: input.tracePage?.hasMore ?? false,
          limit: input.tracePage?.limit ?? 25,
          offset: input.tracePage?.offset ?? 0,
        }
      }),
  })

  const { repository: traceRepo } = createFakeTraceRepository({
    listByTraceIds: ({ traceIds }) =>
      Effect.sync(() => {
        listByTraceIdsCalls.push(traceIds.map((id) => id as string))
        return input.traceDetails ?? []
      }),
  })

  return {
    listTracesCalls,
    listByTraceIdsCalls,
    layer: Layer.mergeAll(
      Layer.succeed(ScoreAnalyticsRepository, scoreAnalytics),
      Layer.succeed(TraceRepository, traceRepo),
      Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
    ),
  }
}

describe("listIssueTracesUseCase", () => {
  it("returns the resolved TraceDetail page, preserving repo order", async () => {
    const first = makeTraceDetail(cuidTraceId("a"))
    const second = makeTraceDetail(cuidTraceId("b"))
    const { listTracesCalls, listByTraceIdsCalls, layer } = buildLayer({
      tracePage: {
        items: [
          { traceId: cuidTraceId("a"), lastSeenAt: new Date("2026-04-02T00:00:00.000Z") },
          { traceId: cuidTraceId("b"), lastSeenAt: new Date("2026-04-01T00:00:00.000Z") },
        ],
        hasMore: true,
        limit: 25,
        offset: 0,
      },
      traceDetails: [second, first], // intentionally out of order — use-case must zip by traceId
    })

    const result = await Effect.runPromise(
      listIssueTracesUseCase({ organizationId, projectId, issueId, limit: 25 }).pipe(Effect.provide(layer)),
    )

    expect(result.items.map((t) => t.traceId)).toEqual([first.traceId, second.traceId])
    expect(result.hasMore).toBe(true)
    expect(result.limit).toBe(25)
    expect(result.offset).toBe(0)
    expect(listTracesCalls).toEqual([{ limit: 25, offset: undefined }])
    expect(listByTraceIdsCalls).toEqual([[cuidTraceId("a"), cuidTraceId("b")]])
  })

  it("short-circuits when the analytics repo returns no trace ids", async () => {
    const { listByTraceIdsCalls, layer } = buildLayer({
      tracePage: { items: [], hasMore: false, limit: 25, offset: 0 },
    })

    const result = await Effect.runPromise(
      listIssueTracesUseCase({ organizationId, projectId, issueId }).pipe(Effect.provide(layer)),
    )

    expect(result.items).toEqual([])
    expect(result.hasMore).toBe(false)
    // No need to hit the trace repository when there are no ids to resolve.
    expect(listByTraceIdsCalls).toEqual([])
  })

  it("drops trace ids whose full payload couldn't be loaded", async () => {
    const present = makeTraceDetail(cuidTraceId("a"))
    const { layer } = buildLayer({
      tracePage: {
        items: [
          { traceId: cuidTraceId("a"), lastSeenAt: new Date("2026-04-02T00:00:00.000Z") },
          { traceId: cuidTraceId("z"), lastSeenAt: new Date("2026-04-01T00:00:00.000Z") },
        ],
        hasMore: false,
        limit: 25,
        offset: 0,
      },
      traceDetails: [present],
    })

    const result = await Effect.runPromise(
      listIssueTracesUseCase({ organizationId, projectId, issueId }).pipe(Effect.provide(layer)),
    )

    expect(result.items.map((t) => t.traceId as string)).toEqual([cuidTraceId("a")])
  })

  it("forwards the caller's limit + offset to the analytics repo", async () => {
    const { listTracesCalls, layer } = buildLayer({
      tracePage: { items: [], hasMore: false, limit: 10, offset: 30 },
    })

    await Effect.runPromise(
      listIssueTracesUseCase({ organizationId, projectId, issueId, limit: 10, offset: 30 }).pipe(Effect.provide(layer)),
    )

    expect(listTracesCalls).toEqual([{ limit: 10, offset: 30 }])
  })
})
