import { OrganizationId } from "@domain/shared"
import { EmbedBudgetResolver, TraceSearchBudget } from "@domain/spans"
import { Effect, Layer } from "effect"
import type { Redis } from "ioredis"
import { describe, expect, it } from "vitest"

import { TraceSearchBudgetLive } from "./trace-search-budget.ts"

// Minimal in-memory ioredis fake covering the ops `TraceSearchBudgetLive` uses.
// Counter semantics only — no expiry simulation, since TTL is a Redis-side
// cleanup concern and doesn't affect correctness of consume/reject logic.
class FakeRedis {
  readonly store = new Map<string, number>()

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return keys.map((k) => {
      const v = this.store.get(k)
      return v === undefined ? null : String(v)
    })
  }

  pipeline() {
    const ops: Array<() => void> = []
    const chain = {
      incrby: (key: string, value: number) => {
        ops.push(() => this.store.set(key, (this.store.get(key) ?? 0) + value))
        return chain
      },
      expire: (_key: string, _ttl: number) => chain,
      exec: async () => {
        for (const op of ops) op()
        return [] as [Error | null, unknown][]
      },
    }
    return chain
  }
}

const ORG_ID = OrganizationId("o".repeat(24))
const OTHER_ORG = OrganizationId("p".repeat(24))

const runWithLimits = <A, E>(
  effect: Effect.Effect<A, E, TraceSearchBudget>,
  redis: FakeRedis,
  limits: { daily: number; weekly: number; monthly: number },
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(
        Layer.provide(
          TraceSearchBudgetLive(redis as unknown as Redis),
          Layer.succeed(EmbedBudgetResolver, {
            resolveLimits: () =>
              Effect.succeed({
                dailyTokens: limits.daily,
                weeklyTokens: limits.weekly,
                monthlyTokens: limits.monthly,
              }),
          }),
        ),
      ),
    ),
  )

describe("TraceSearchBudgetLive.tryConsume", () => {
  const LIMITS = { daily: 1_000, weekly: 5_000, monthly: 20_000 }

  it("consumes tokens when all windows have room and returns true", async () => {
    const redis = new FakeRedis()

    const result = await runWithLimits(
      Effect.gen(function* () {
        const budget = yield* TraceSearchBudget
        return yield* budget.tryConsume(ORG_ID, 100)
      }),
      redis,
      LIMITS,
    )

    expect(result).toBe(true)

    // All three counter windows incremented.
    const values = Array.from(redis.store.entries())
    expect(values).toHaveLength(3)
    for (const [, v] of values) expect(v).toBe(100)
  })

  it("accumulates tokens across calls", async () => {
    const redis = new FakeRedis()

    const ok = await runWithLimits(
      Effect.gen(function* () {
        const budget = yield* TraceSearchBudget
        const a = yield* budget.tryConsume(ORG_ID, 100)
        const b = yield* budget.tryConsume(ORG_ID, 250)
        return a && b
      }),
      redis,
      LIMITS,
    )

    expect(ok).toBe(true)
    for (const [, v] of redis.store.entries()) expect(v).toBe(350)
  })

  it("rejects when the daily window would overflow", async () => {
    const redis = new FakeRedis()

    const result = await runWithLimits(
      Effect.gen(function* () {
        const budget = yield* TraceSearchBudget
        yield* budget.tryConsume(ORG_ID, 900) // uses 90% of daily
        return yield* budget.tryConsume(ORG_ID, 200) // would cross daily cap (1000)
      }),
      redis,
      LIMITS,
    )

    expect(result).toBe(false)
    // Counters reflect the first (successful) consumption only.
    for (const [, v] of redis.store.entries()) expect(v).toBe(900)
  })

  it("rejects when the weekly window would overflow", async () => {
    const redis = new FakeRedis()

    // Small daily relative to weekly so daily isn't the limiter.
    const limits = { daily: 10_000, weekly: 1_000, monthly: 100_000 }

    const result = await runWithLimits(
      Effect.gen(function* () {
        const budget = yield* TraceSearchBudget
        yield* budget.tryConsume(ORG_ID, 900)
        return yield* budget.tryConsume(ORG_ID, 200) // daily fine, weekly blocks
      }),
      redis,
      limits,
    )

    expect(result).toBe(false)
    for (const [, v] of redis.store.entries()) expect(v).toBe(900)
  })

  it("rejects when the monthly window would overflow", async () => {
    const redis = new FakeRedis()

    const limits = { daily: 10_000, weekly: 50_000, monthly: 1_000 }

    const result = await runWithLimits(
      Effect.gen(function* () {
        const budget = yield* TraceSearchBudget
        yield* budget.tryConsume(ORG_ID, 900)
        return yield* budget.tryConsume(ORG_ID, 200) // daily + weekly fine, monthly blocks
      }),
      redis,
      limits,
    )

    expect(result).toBe(false)
    for (const [, v] of redis.store.entries()) expect(v).toBe(900)
  })

  it("short-circuits on zero-token requests without touching Redis", async () => {
    const redis = new FakeRedis()

    const result = await runWithLimits(
      Effect.gen(function* () {
        const budget = yield* TraceSearchBudget
        return yield* budget.tryConsume(ORG_ID, 0)
      }),
      redis,
      LIMITS,
    )

    expect(result).toBe(true)
    expect(redis.store.size).toBe(0)
  })

  it("tracks orgs independently", async () => {
    const redis = new FakeRedis()

    await runWithLimits(
      Effect.gen(function* () {
        const budget = yield* TraceSearchBudget
        yield* budget.tryConsume(ORG_ID, 900) // uses most of ORG_ID's daily
        yield* budget.tryConsume(OTHER_ORG, 900) // OTHER_ORG still has full budget
      }),
      redis,
      LIMITS,
    )

    // 6 keys total: daily/weekly/monthly × 2 orgs.
    expect(redis.store.size).toBe(6)
    const orgAKeys = Array.from(redis.store.keys()).filter((k) => k.includes(ORG_ID))
    const orgBKeys = Array.from(redis.store.keys()).filter((k) => k.includes(OTHER_ORG))
    expect(orgAKeys).toHaveLength(3)
    expect(orgBKeys).toHaveLength(3)
    for (const k of [...orgAKeys, ...orgBKeys]) expect(redis.store.get(k)).toBe(900)
  })

  it("allows consumption exactly equal to the remaining budget", async () => {
    const redis = new FakeRedis()

    const result = await runWithLimits(
      Effect.gen(function* () {
        const budget = yield* TraceSearchBudget
        yield* budget.tryConsume(ORG_ID, 900)
        return yield* budget.tryConsume(ORG_ID, 100) // exactly fills daily cap
      }),
      redis,
      LIMITS,
    )

    expect(result).toBe(true)
    // Daily key should now be at the cap (1,000).
    const dailyKey = Array.from(redis.store.keys()).find((k) => k.includes(":daily:"))
    expect(dailyKey).toBeDefined()
    expect(redis.store.get(dailyKey!)).toBe(1000)
  })
})
