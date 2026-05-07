import { CacheStore, generateId, OrganizationId } from "@domain/shared"
import { resolveEffectivePlanCached } from "@platform/db-postgres"
import { organizations, subscriptions } from "@platform/db-postgres/schema/better-auth"
import { withTracing } from "@repo/observability"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BillingOverrideRepositoryLive } from "./repositories/billing-override-repository.ts"
import { SettingsReaderLive } from "./repositories/settings-reader-repository.ts"
import { StripeSubscriptionLookupLive } from "./repositories/stripe-subscription-lookup.ts"
import { setupTestPostgres } from "./test/in-memory-postgres.ts"
import { withPostgres } from "./with-postgres.ts"

const pg = setupTestPostgres()

const billingLayers = Layer.mergeAll(BillingOverrideRepositoryLive, SettingsReaderLive, StripeSubscriptionLookupLive)

describe("resolveEffectivePlanCached", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("reuses a cached plan snapshot within the TTL window", async () => {
    vi.setSystemTime(new Date("2026-09-15T12:00:00.000Z"))
    const organizationId = generateId()
    const cache = new Map<string, string>()

    await pg.db.insert(organizations).values({
      id: organizationId,
      name: "Cached Plan Org",
      slug: `cached-plan-${organizationId}`,
    })

    await pg.db.insert(subscriptions).values({
      id: generateId(),
      plan: "pro",
      referenceId: organizationId,
      stripeCustomerId: "cus_cached_plan",
      stripeSubscriptionId: "sub_cached_plan",
      status: "active",
      periodStart: new Date("2026-09-01T00:00:00.000Z"),
      periodEnd: new Date("2026-10-01T00:00:00.000Z"),
    })

    const run = () =>
      Effect.runPromise(
        resolveEffectivePlanCached(OrganizationId(organizationId)).pipe(
          withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)),
          Effect.provide(
            Layer.succeed(CacheStore, {
              get: (key: string) => Effect.succeed(cache.get(key) ?? null),
              set: (key: string, value: string) =>
                Effect.sync(() => {
                  cache.set(key, value)
                }),
              delete: (key: string) =>
                Effect.sync(() => {
                  cache.delete(key)
                }),
            }),
          ),
          withTracing,
        ),
      )

    const first = await run()

    await pg.db.delete(subscriptions).where(eq(subscriptions.referenceId, organizationId))

    const second = await run()

    expect(first.source).toBe("subscription")
    expect(first.plan.slug).toBe("pro")
    expect(second.source).toBe("subscription")
    expect(second.plan.slug).toBe("pro")
  })

  it("clips the cache TTL to the resolved billing period end", async () => {
    vi.setSystemTime(new Date("2026-09-30T23:59:30.000Z"))
    const organizationId = generateId()
    let cachedTtlSeconds: number | undefined

    await pg.db.insert(organizations).values({
      id: organizationId,
      name: "Boundary Cache Org",
      slug: `boundary-cache-${organizationId}`,
    })

    const result = await Effect.runPromise(
      resolveEffectivePlanCached(OrganizationId(organizationId)).pipe(
        withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)),
        Effect.provide(
          Layer.succeed(CacheStore, {
            get: () => Effect.succeed(null),
            set: (_key: string, _value: string, options) =>
              Effect.sync(() => {
                cachedTtlSeconds = options?.ttlSeconds
              }),
            delete: () => Effect.void,
          }),
        ),
        withTracing,
      ),
    )

    expect(result.source).toBe("free-fallback")
    expect(result.periodEnd).toEqual(new Date("2026-10-01T00:00:00.000Z"))
    expect(cachedTtlSeconds).toBe(30)
  })
})
