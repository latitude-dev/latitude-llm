import {
  BillingOverrideRepository,
  resolveEffectivePlan,
  SELF_HOSTED_RETENTION_DAYS_MAX,
  StripeSubscriptionLookup,
  UnknownStripePlanError,
} from "@domain/billing"
import { createFakeBillingOverrideRepository, createFakeStripeSubscriptionLookup } from "@domain/billing/testing"
import { OrganizationId, type OrganizationSettings, SettingsReader, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer, Result } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const ORGANIZATION_ID = OrganizationId("o".repeat(24))

const createTestLayer = (input?: { readonly organizationSettings?: OrganizationSettings | null }) => {
  const { repository: billingOverrideRepository, overridesByOrganizationId } = createFakeBillingOverrideRepository()
  const { service: stripeSubscriptionLookup, subscriptionsByOrganizationId } = createFakeStripeSubscriptionLookup()

  const layer = Layer.mergeAll(
    Layer.succeed(BillingOverrideRepository, billingOverrideRepository),
    Layer.succeed(StripeSubscriptionLookup, stripeSubscriptionLookup),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORGANIZATION_ID })),
    Layer.succeed(SettingsReader, {
      getOrganizationSettings: () => Effect.succeed(input?.organizationSettings ?? null),
      getProjectSettings: () => Effect.die("resolveEffectivePlan does not read project settings"),
    }),
  )

  return {
    layer,
    overridesByOrganizationId,
    subscriptionsByOrganizationId,
  }
}

describe("resolveEffectivePlan", () => {
  beforeEach(() => {
    vi.stubEnv("LAT_BILLING_ENABLED", "true")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("falls back to the free plan when the organization has no override or subscription", async () => {
    const { layer } = createTestLayer({ organizationSettings: { billing: { spendingLimitCents: 12_345 } } })

    const result = await Effect.runPromise(resolveEffectivePlan(ORGANIZATION_ID).pipe(Effect.provide(layer)))

    expect(result.source).toBe("free-fallback")
    expect(result.plan).toMatchObject({
      slug: "free",
      includedCredits: 20_000,
      hardCapped: true,
      spendingLimitCents: null,
    })
  })

  it("prefers a billing override and keeps spending limits disabled for non-pro override plans", async () => {
    const { layer, overridesByOrganizationId } = createTestLayer({
      organizationSettings: { billing: { spendingLimitCents: 99_999 } },
    })

    overridesByOrganizationId.set(String(ORGANIZATION_ID), {
      id: "override-1",
      organizationId: ORGANIZATION_ID,
      plan: "enterprise",
      includedCredits: 500_000,
      retentionDays: 365,
      notes: "contract",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    })

    const result = await Effect.runPromise(resolveEffectivePlan(ORGANIZATION_ID).pipe(Effect.provide(layer)))

    expect(result.source).toBe("override")
    expect(result.plan).toMatchObject({
      slug: "enterprise",
      includedCredits: 500_000,
      retentionDays: 365,
      spendingLimitCents: null,
    })
  })

  it("resolves an active Stripe subscription and applies the pro spending limit", async () => {
    const { layer, subscriptionsByOrganizationId } = createTestLayer({
      organizationSettings: { billing: { spendingLimitCents: 15_000 } },
    })

    subscriptionsByOrganizationId.set(String(ORGANIZATION_ID), {
      plan: "pro",
      status: "active",
      periodStart: new Date("2026-03-01T00:00:00.000Z"),
      periodEnd: new Date("2026-04-01T00:00:00.000Z"),
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
    })

    const result = await Effect.runPromise(resolveEffectivePlan(ORGANIZATION_ID).pipe(Effect.provide(layer)))

    expect(result).toMatchObject({
      source: "subscription",
      periodStart: new Date("2026-03-01T00:00:00.000Z"),
      periodEnd: new Date("2026-04-01T00:00:00.000Z"),
      plan: {
        slug: "pro",
        includedCredits: 100_000,
        spendingLimitCents: 15_000,
      },
    })
  })

  it("fails closed when the Stripe plan cannot be mapped", async () => {
    const { layer, subscriptionsByOrganizationId } = createTestLayer()

    subscriptionsByOrganizationId.set(String(ORGANIZATION_ID), {
      plan: "mystery-plan",
      status: "active",
      periodStart: new Date("2026-03-01T00:00:00.000Z"),
      periodEnd: new Date("2026-04-01T00:00:00.000Z"),
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
    })

    const result = await Effect.runPromise(
      Effect.result(resolveEffectivePlan(ORGANIZATION_ID).pipe(Effect.provide(layer))),
    )

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(UnknownStripePlanError)
    }
  })

  describe("without billing enforcement", () => {
    beforeEach(() => {
      vi.stubEnv("LAT_BILLING_ENABLED", "false")
    })

    it("resolves an unmetered self-hosted plan instead of the free fallback", async () => {
      const { layer } = createTestLayer()

      const result = await Effect.runPromise(resolveEffectivePlan(ORGANIZATION_ID).pipe(Effect.provide(layer)))

      expect(result.source).toBe("self-hosted")
      expect(result.plan).toMatchObject({
        slug: "self-hosted",
        includedCredits: Number.POSITIVE_INFINITY,
        retentionDays: SELF_HOSTED_RETENTION_DAYS_MAX,
        hardCapped: false,
        overageAllowed: true,
        spendingLimitCents: null,
      })
    })

    it("stamps the operator's configured retention", async () => {
      vi.stubEnv("LAT_TELEMETRY_RETENTION_DAYS", "180")
      const { layer } = createTestLayer()

      const result = await Effect.runPromise(resolveEffectivePlan(ORGANIZATION_ID).pipe(Effect.provide(layer)))

      expect(result.plan.retentionDays).toBe(180)
    })

    it("dies on a retention value the ClickHouse TTL cannot express", async () => {
      vi.stubEnv("LAT_TELEMETRY_RETENTION_DAYS", String(SELF_HOSTED_RETENTION_DAYS_MAX + 1))
      const { layer } = createTestLayer()

      const result = await Effect.runPromise(
        Effect.result(resolveEffectivePlan(ORGANIZATION_ID).pipe(Effect.provide(layer), Effect.sandbox)),
      )

      expect(Result.isFailure(result)).toBe(true)
    })

    it("still honors a billing override, so an operator can pin retention down", async () => {
      const { layer, overridesByOrganizationId } = createTestLayer()

      overridesByOrganizationId.set(String(ORGANIZATION_ID), {
        id: "override-1",
        organizationId: ORGANIZATION_ID,
        plan: "free",
        includedCredits: null,
        retentionDays: 14,
        notes: "keep the box small",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      })

      const result = await Effect.runPromise(resolveEffectivePlan(ORGANIZATION_ID).pipe(Effect.provide(layer)))

      expect(result.source).toBe("override")
      expect(result.plan).toMatchObject({ slug: "free", retentionDays: 14 })
    })
  })
})
