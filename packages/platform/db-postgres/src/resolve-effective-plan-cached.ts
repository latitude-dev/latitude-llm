import { resolveEffectivePlan, type EffectivePlanResolution } from "@domain/billing"
import { CacheStore, type OrganizationId } from "@domain/shared"
import { Effect, Option } from "effect"

const BILLING_EFFECTIVE_PLAN_CACHE_TTL_SECONDS = 60

const buildCacheKey = (organizationId: string) => `org:${organizationId}:billing:effective-plan`

const parseCachedPlan = (json: string): EffectivePlanResolution | null => {
  try {
    const parsed = JSON.parse(json) as {
      organizationId?: string
      source?: string
      plan?: {
        slug?: string
        includedCredits?: number
        retentionDays?: number
        overageAllowed?: boolean
        hardCapped?: boolean
        priceCents?: number | null
        spendingLimitCents?: number | null
      }
      periodStart?: string
      periodEnd?: string
    }

    if (
      typeof parsed.organizationId !== "string" ||
      (parsed.source !== "override" && parsed.source !== "subscription" && parsed.source !== "free-fallback") ||
      !parsed.plan ||
      (parsed.plan.slug !== "free" && parsed.plan.slug !== "pro" && parsed.plan.slug !== "enterprise") ||
      typeof parsed.plan.includedCredits !== "number" ||
      typeof parsed.plan.retentionDays !== "number" ||
      typeof parsed.plan.overageAllowed !== "boolean" ||
      typeof parsed.plan.hardCapped !== "boolean" ||
      (parsed.plan.priceCents !== null && typeof parsed.plan.priceCents !== "number") ||
      (parsed.plan.spendingLimitCents !== null && parsed.plan.spendingLimitCents !== undefined && typeof parsed.plan.spendingLimitCents !== "number") ||
      typeof parsed.periodStart !== "string" ||
      typeof parsed.periodEnd !== "string"
    ) {
      return null
    }

    return {
      organizationId: parsed.organizationId as OrganizationId,
      source: parsed.source as EffectivePlanResolution["source"],
      plan: {
        slug: parsed.plan.slug,
        includedCredits: parsed.plan.includedCredits,
        retentionDays: parsed.plan.retentionDays,
        overageAllowed: parsed.plan.overageAllowed,
        hardCapped: parsed.plan.hardCapped,
        priceCents: parsed.plan.priceCents ?? null,
        spendingLimitCents: parsed.plan.spendingLimitCents ?? null,
      },
      periodStart: new Date(parsed.periodStart),
      periodEnd: new Date(parsed.periodEnd),
    }
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

export const resolveEffectivePlanCached = Effect.fn("billing.resolveEffectivePlanCached")(function* (
  organizationId: OrganizationId,
) {
  const cacheOption = yield* Effect.serviceOption(CacheStore)
  const cache = Option.getOrUndefined(cacheOption)
  const cacheKey = buildCacheKey(organizationId)

  if (cache) {
    const cachedJson = yield* cache.get(cacheKey).pipe(Effect.catchTag("CacheError", () => Effect.succeed(null)))
    if (cachedJson !== null) {
      const parsed = parseCachedPlan(cachedJson)
      if (parsed !== null) {
        yield* Effect.annotateCurrentSpan("cache.hit", true)
        return parsed
      }
    }
  }

  yield* Effect.annotateCurrentSpan("cache.hit", false)
  const resolved = yield* resolveEffectivePlan(organizationId)

  if (cache) {
    yield* cache
      .set(cacheKey, encodeCachedPlan(resolved), { ttlSeconds: BILLING_EFFECTIVE_PLAN_CACHE_TTL_SECONDS })
      .pipe(Effect.catchTag("CacheError", () => Effect.void))
  }

  return resolved
})

export const invalidateEffectivePlanCache = Effect.fn("billing.invalidateEffectivePlanCache")(function* (
  organizationId: OrganizationId,
) {
  const cacheOption = yield* Effect.serviceOption(CacheStore)
  const cache = Option.getOrUndefined(cacheOption)
  if (!cache) return

  yield* cache.delete(buildCacheKey(organizationId)).pipe(Effect.catchTag("CacheError", () => Effect.void))
})
