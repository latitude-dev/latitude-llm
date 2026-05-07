import { billingPlanSchema, type EffectivePlanResolution, resolveEffectivePlan } from "@domain/billing"
import { CacheStore, type OrganizationId, organizationIdSchema } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"

const BILLING_EFFECTIVE_PLAN_CACHE_TTL_SECONDS = 60

const buildCacheKey = (organizationId: string) => `org:${organizationId}:billing:effective-plan`

const cachedPlanSchema = z.object({
  organizationId: organizationIdSchema,
  plan: billingPlanSchema,
  source: z.enum(["override", "subscription", "free-fallback"]),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
})

const parseCachedPlan = (json: string): EffectivePlanResolution | null => {
  try {
    const result = cachedPlanSchema.safeParse(JSON.parse(json))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

const encodeCachedPlan = (plan: EffectivePlanResolution) =>
  JSON.stringify({
    organizationId: plan.organizationId,
    source: plan.source,
    plan: plan.plan,
    periodStart: plan.periodStart.toISOString(),
    periodEnd: plan.periodEnd.toISOString(),
  })

const resolveCacheTtlSeconds = (plan: EffectivePlanResolution, now: Date): number => {
  const secondsUntilPeriodEnd = Math.floor((plan.periodEnd.getTime() - now.getTime()) / 1000)

  return Math.min(BILLING_EFFECTIVE_PLAN_CACHE_TTL_SECONDS, secondsUntilPeriodEnd)
}

export const resolveEffectivePlanCached = Effect.fn("billing.resolveEffectivePlanCached")(function* (
  organizationId: OrganizationId,
) {
  const cache = yield* CacheStore
  const cacheKey = buildCacheKey(organizationId)

  const cachedJson = yield* cache.get(cacheKey).pipe(Effect.catchTag("CacheError", () => Effect.succeed(null)))
  if (cachedJson !== null) {
    const parsed = parseCachedPlan(cachedJson)
    if (parsed !== null) {
      yield* Effect.annotateCurrentSpan("cache.hit", true)
      return parsed
    }
  }

  yield* Effect.annotateCurrentSpan("cache.hit", false)
  const resolved = yield* resolveEffectivePlan(organizationId)
  const ttlSeconds = resolveCacheTtlSeconds(resolved, new Date())

  if (ttlSeconds > 0) {
    yield* cache
      .set(cacheKey, encodeCachedPlan(resolved), { ttlSeconds })
      .pipe(Effect.catchTag("CacheError", () => Effect.void))
  }

  return resolved
})

export const invalidateEffectivePlanCache = Effect.fn("billing.invalidateEffectivePlanCache")(function* (
  organizationId: OrganizationId,
) {
  const cache = yield* CacheStore

  yield* cache.delete(buildCacheKey(organizationId)).pipe(Effect.catchTag("CacheError", () => Effect.void))
})
