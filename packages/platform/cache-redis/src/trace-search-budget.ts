import { CacheError, type OrganizationId } from "@domain/shared"
import { EmbedBudgetResolver, TraceSearchBudget, type TraceSearchBudgetShape } from "@domain/spans"
import { Effect, Layer } from "effect"
import type { Redis } from "ioredis"

// Key TTLs: long enough that the key survives a window's worth of time with
// slack for clock skew, short enough that stale keys don't linger indefinitely.
const DAILY_TTL_SECONDS = 60 * 60 * 48 // 2 days
const WEEKLY_TTL_SECONDS = 60 * 60 * 24 * 14 // 2 weeks
const MONTHLY_TTL_SECONDS = 60 * 60 * 24 * 62 // ~2 months

const pad2 = (n: number): string => n.toString().padStart(2, "0")

const dailyKey = (orgId: OrganizationId, now: Date): string => {
  const yyyy = now.getUTCFullYear()
  const mm = pad2(now.getUTCMonth() + 1)
  const dd = pad2(now.getUTCDate())
  return `trace-search:embed-budget:daily:${orgId}:${yyyy}-${mm}-${dd}`
}

const monthlyKey = (orgId: OrganizationId, now: Date): string => {
  const yyyy = now.getUTCFullYear()
  const mm = pad2(now.getUTCMonth() + 1)
  return `trace-search:embed-budget:monthly:${orgId}:${yyyy}-${mm}`
}

/**
 * ISO-8601 week number. Week 1 is the week containing the first Thursday of
 * the year. Reference: https://en.wikipedia.org/wiki/ISO_week_date.
 */
const isoWeekKey = (orgId: OrganizationId, now: Date): string => {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  // Shift to the nearest Thursday (ISO week uses Thursday as anchor day)
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNumber = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `trace-search:embed-budget:weekly:${orgId}:${date.getUTCFullYear()}-W${pad2(weekNumber)}`
}

/**
 * Redis-backed per-organization embed-token budget tracker.
 *
 * Pre-check / post-increment pattern: reads all three windows, compares
 * against resolved limits, and — only if all pass — pipelines INCRBY + EXPIRE
 * for each counter. Under concurrent bursts two workers can both see the
 * same "pre" value and overshoot slightly, which is acceptable: the budget is
 * a cost ceiling, not a financial contract.
 */
export const TraceSearchBudgetLive = (redis: Redis) =>
  Layer.effect(
    TraceSearchBudget,
    Effect.gen(function* () {
      const resolver = yield* EmbedBudgetResolver

      const tryConsume: TraceSearchBudgetShape["tryConsume"] = (organizationId, tokens) =>
        Effect.gen(function* () {
          if (tokens <= 0) return true

          const limits = yield* resolver.resolveLimits(organizationId)
          const now = new Date()
          const kDaily = dailyKey(organizationId, now)
          const kWeekly = isoWeekKey(organizationId, now)
          const kMonthly = monthlyKey(organizationId, now)

          const [usedDaily, usedWeekly, usedMonthly] = yield* Effect.tryPromise({
            try: () => redis.mget(kDaily, kWeekly, kMonthly),
            catch: (cause) => new CacheError({ message: `budget read failed: ${String(cause)}`, cause }),
          })

          const daily = Number(usedDaily ?? 0)
          const weekly = Number(usedWeekly ?? 0)
          const monthly = Number(usedMonthly ?? 0)

          if (
            daily + tokens > limits.dailyTokens ||
            weekly + tokens > limits.weeklyTokens ||
            monthly + tokens > limits.monthlyTokens
          ) {
            return false
          }

          yield* Effect.tryPromise({
            try: async () => {
              const pipeline = redis.pipeline()
              pipeline.incrby(kDaily, tokens).expire(kDaily, DAILY_TTL_SECONDS)
              pipeline.incrby(kWeekly, tokens).expire(kWeekly, WEEKLY_TTL_SECONDS)
              pipeline.incrby(kMonthly, tokens).expire(kMonthly, MONTHLY_TTL_SECONDS)
              await pipeline.exec()
            },
            catch: (cause) => new CacheError({ message: `budget increment failed: ${String(cause)}`, cause }),
          })

          return true
        })

      return { tryConsume } satisfies TraceSearchBudgetShape
    }),
  )
