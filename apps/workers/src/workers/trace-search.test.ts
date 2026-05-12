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

import { prioritizeChunksForEmbedding, resolveTraceSearchRetentionDays } from "./trace-search.ts"

describe("prioritizeChunksForEmbedding", () => {
  it("prioritizes tail chunks first and skips chunks below the embedding floor", () => {
    const chunks: TraceSearchChunk[] = [
      { chunkIndex: 0, text: "a".repeat(TRACE_SEARCH_EMBEDDING_MIN_LENGTH), contentHash: "0" },
      { chunkIndex: 2, text: "c".repeat(TRACE_SEARCH_EMBEDDING_MIN_LENGTH), contentHash: "2" },
      { chunkIndex: 1, text: "short", contentHash: "1" },
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
