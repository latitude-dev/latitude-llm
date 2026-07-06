import { Effect } from "effect"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { resolveEffectivePlanCachedMock } = vi.hoisted(() => ({
  resolveEffectivePlanCachedMock: vi.fn(),
}))

vi.mock("@platform/db-postgres", () => ({
  BillingOverrideRepositoryLive: {},
  OrganizationRepositoryLive: {},
  ProjectRepositoryLive: {},
  resolveEffectivePlanCached: resolveEffectivePlanCachedMock,
  SettingsReaderLive: {},
  StripeSubscriptionLookupLive: {},
  withPostgres: () => (effect: unknown) => effect,
}))

vi.mock("@domain/ai", () => ({
  AI: {},
  resolveEmbeddingConfig: () => Effect.succeed({ provider: "voyage", model: "voyage-4-large" }),
}))
vi.mock("@platform/ai", () => ({ AIEmbedLive: {}, withAi: () => (effect: unknown) => effect }))
vi.mock("@platform/cache-redis", () => ({
  EmbedBudgetResolverLive: {},
  RedisCacheStoreLive: () => ({}),
  TraceSearchBudgetLive: () => ({}),
}))
vi.mock("@platform/db-clickhouse", () => ({
  MessageEmbeddingRepositoryLive: {},
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

import { processRefreshTrace, resolveTraceSearchRetentionDays, shouldRetriggerSignalsMatch } from "./trace-search.ts"

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

describe("shouldRetriggerSignalsMatch", () => {
  it("re-triggers when messages were freshly embedded this run", () => {
    expect(shouldRetriggerSignalsMatch({ embeddingConfigResolved: true, existingCount: 0, embeddedCount: 2 })).toBe(
      true,
    )
  })

  it("re-triggers when all vectors were pre-existing hash hits (embeddedCount 0)", () => {
    expect(shouldRetriggerSignalsMatch({ embeddingConfigResolved: true, existingCount: 3, embeddedCount: 0 })).toBe(
      true,
    )
  })

  it("does not re-trigger when the trace has no vectors (over budget / provider failure)", () => {
    expect(shouldRetriggerSignalsMatch({ embeddingConfigResolved: true, existingCount: 0, embeddedCount: 0 })).toBe(
      false,
    )
  })

  it("does not re-trigger when the embedding config could not be resolved", () => {
    expect(shouldRetriggerSignalsMatch({ embeddingConfigResolved: false, existingCount: 5, embeddedCount: 5 })).toBe(
      false,
    )
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
