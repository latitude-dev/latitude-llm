import { TRACE_SEARCH_EMBEDDING_MIN_LENGTH, type TraceSearchChunk } from "@domain/spans"
import { Effect } from "effect"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { resolveEffectivePlanCachedMock } = vi.hoisted(() => ({
  resolveEffectivePlanCachedMock: vi.fn(),
}))

vi.mock("@platform/db-postgres", () => ({
  BillingOverrideRepositoryLive: {},
  resolveEffectivePlanCached: resolveEffectivePlanCachedMock,
  SettingsReaderLive: {},
  StripeSubscriptionLookupLive: {},
  withPostgres: () => (effect: unknown) => effect,
}))

vi.mock("@domain/ai", () => ({ AI: {} }))
vi.mock("@platform/ai", () => ({ withAi: () => (effect: unknown) => effect }))
vi.mock("@platform/ai-voyage", () => ({ AIEmbedLive: {} }))
vi.mock("@platform/cache-redis", () => ({
  EmbedBudgetResolverLive: {},
  RedisCacheStoreLive: () => ({}),
  TraceSearchBudgetLive: () => ({}),
}))
vi.mock("@platform/db-clickhouse", () => ({
  TraceRepositoryLive: {},
  TraceSearchRepositoryLive: {},
  withClickHouse: () => (effect: unknown) => effect,
}))
vi.mock("@repo/observability", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  withTracing: (effect: unknown) => effect,
}))
vi.mock("../clients.ts", () => ({
  getClickhouseClient: vi.fn(() => ({})),
  getPostgresClient: vi.fn(() => ({})),
  getRedisClient: vi.fn(() => ({})),
}))

import { prioritizeChunksForEmbedding, processRefreshTrace, resolveTraceSearchRetentionDays } from "./trace-search.ts"

describe("prioritizeChunksForEmbedding", () => {
  it("prioritizes tail chunks first and skips chunks below the embedding floor", () => {
    const chunks: TraceSearchChunk[] = [
      {
        chunkIndex: 0,
        text: "a".repeat(TRACE_SEARCH_EMBEDDING_MIN_LENGTH),
        contentHash: "0",
        firstMessageIndex: 0,
        lastMessageIndex: 0,
      },
      {
        chunkIndex: 2,
        text: "c".repeat(TRACE_SEARCH_EMBEDDING_MIN_LENGTH),
        contentHash: "2",
        firstMessageIndex: 4,
        lastMessageIndex: 5,
      },
      { chunkIndex: 1, text: "short", contentHash: "1", firstMessageIndex: 2, lastMessageIndex: 3 },
    ]

    expect(prioritizeChunksForEmbedding(chunks).map((chunk) => chunk.chunkIndex)).toEqual([2, 0])
  })
})

describe("resolveTraceSearchRetentionDays", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("falls back to 30 days when billing lookup fails", async () => {
    resolveEffectivePlanCachedMock.mockReturnValueOnce(Effect.fail(new Error("pg down")))

    const retentionDays = await Effect.runPromise(
      resolveTraceSearchRetentionDays("org-1") as Effect.Effect<number, never, never>,
    )

    expect(retentionDays).toBe(30)
  })
})

describe("runTraceSearchRefresh sandbox gate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("skips embedding/Weaviate work for sandbox traces — no plan lookup, no repos", async () => {
    const result = await Effect.runPromise(
      processRefreshTrace({
        organizationId: "o".repeat(24),
        projectId: "p".repeat(24),
        traceId: "t".repeat(32),
        startTime: "2026-04-16T12:00:00.000Z",
        rootSpanName: "qa",
        isSandbox: true,
      }) as unknown as Effect.Effect<void>,
    )

    expect(result).toBeUndefined()
    // The gate returns before resolving retention (the first thing the real path does).
    expect(resolveEffectivePlanCachedMock).not.toHaveBeenCalled()
  })
})
