import {
  billingPlanSchema,
  type EffectivePlanResolution,
  resolveEffectivePlan,
  SANDBOX_SPAN_RETENTION_DAYS,
} from "@domain/billing"
import { isSandbox, OrganizationRepository } from "@domain/organizations"
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

const applySandboxRetention = Effect.fn("billing.applySandboxRetention")(function* (
  resolution: EffectivePlanResolution,
) {
  const orgRepo = yield* OrganizationRepository
  // A missing org (deleted mid-request) just means "not a sandbox"; a RepositoryError (DB down)
  // must propagate rather than silently downgrade a sandbox to live retention.
  const org = yield* orgRepo
    .findById(resolution.organizationId)
    .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
  if (!org || !isSandbox(org)) {
    return resolution
  }

  return {
    ...resolution,
    plan: { ...resolution.plan, retentionDays: SANDBOX_SPAN_RETENTION_DAYS },
  }
})

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
  const resolved = yield* applySandboxRetention(yield* resolveEffectivePlan(organizationId))
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
