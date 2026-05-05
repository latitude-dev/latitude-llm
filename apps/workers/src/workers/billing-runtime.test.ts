import { meterBillableAction, PLAN_CONFIGS, resolveEffectivePlan } from "@domain/billing"
import { QueuePublisher } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { generateId, OrganizationId, ProjectId } from "@domain/shared"
import {
  BillingOverrideRepositoryLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  eq,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { organizations, subscriptions } from "@platform/db-postgres/schema/better-auth"
import { billingOverrides, billingUsageEvents, billingUsagePeriods } from "@platform/db-postgres/schema/billing"
import { setupTestPostgres } from "@platform/testkit"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { describe, expect, it, vi } from "vitest"

const pg = setupTestPostgres()

const billingLayers = Layer.mergeAll(
  BillingOverrideRepositoryLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
)

describe("billing runtime integration", () => {
  it("prefers a manual override over an active Stripe subscription", async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"))

      const organizationId = generateId()

      await pg.db.insert(organizations).values({
        id: organizationId,
        name: "Override Org",
        slug: `override-${organizationId}`,
      })

      await pg.db.insert(subscriptions).values({
        id: generateId(),
        plan: "pro",
        referenceId: organizationId,
        stripeCustomerId: "cus_test_override",
        stripeSubscriptionId: "sub_test_override",
        status: "active",
        periodStart: new Date("2026-01-10T00:00:00.000Z"),
        periodEnd: new Date("2026-02-10T00:00:00.000Z"),
      })
      await pg.db.insert(billingOverrides).values({
        id: generateId(),
        organizationId,
        plan: "enterprise",
        includedCredits: 250_000,
        retentionDays: 180,
        notes: "contract override",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      })

      const result = await Effect.runPromise(
        resolveEffectivePlan(OrganizationId(organizationId)).pipe(
          withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)),
          withTracing,
        ),
      )

      expect(result.source).toBe("override")
      expect(result.plan.slug).toBe("enterprise")
      expect(result.plan.includedCredits).toBe(250_000)
      expect(result.plan.retentionDays).toBe(180)
      expect(result.periodStart.toISOString()).toBe("2026-01-01T00:00:00.000Z")
      expect(result.periodEnd.toISOString()).toBe("2026-02-01T00:00:00.000Z")
    } finally {
      vi.useRealTimers()
    }
  })

  it("resolves paid periods from Stripe and fails closed on unknown Stripe plans", async () => {
    const knownOrgId = generateId()
    const unknownOrgId = generateId()

    await pg.db.insert(organizations).values([
      {
        id: knownOrgId,
        name: "Known Billing Org",
        slug: `known-${knownOrgId}`,
      },
      {
        id: unknownOrgId,
        name: "Unknown Billing Org",
        slug: `unknown-${unknownOrgId}`,
      },
    ])

    await pg.db.insert(subscriptions).values([
      {
        id: generateId(),
        plan: "pro",
        referenceId: knownOrgId,
        stripeCustomerId: "cus_test_known",
        stripeSubscriptionId: "sub_test_known",
        status: "trialing",
        periodStart: new Date("2026-03-05T00:00:00.000Z"),
        periodEnd: new Date("2026-04-05T00:00:00.000Z"),
      },
      {
        id: generateId(),
        plan: "mystery-tier",
        referenceId: unknownOrgId,
        stripeCustomerId: "cus_test_unknown",
        stripeSubscriptionId: "sub_test_unknown",
        status: "active",
        periodStart: new Date("2026-03-05T00:00:00.000Z"),
        periodEnd: new Date("2026-04-05T00:00:00.000Z"),
      },
    ])

    const known = await Effect.runPromise(
      resolveEffectivePlan(OrganizationId(knownOrgId)).pipe(
        withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(knownOrgId)),
        withTracing,
      ),
    )

    expect(known.source).toBe("subscription")
    expect(known.plan.slug).toBe("pro")
    expect(known.periodStart.toISOString()).toBe("2026-03-05T00:00:00.000Z")
    expect(known.periodEnd.toISOString()).toBe("2026-04-05T00:00:00.000Z")

    await expect(
      Effect.runPromise(
        resolveEffectivePlan(OrganizationId(unknownOrgId)).pipe(
          withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(unknownOrgId)),
          withTracing,
        ),
      ),
    ).rejects.toMatchObject({
      _tag: "UnknownStripePlanError",
      planName: "mystery-tier",
    })
  })

  it("does not double-charge duplicate queue or workflow retries for the same idempotency key", async () => {
    const organizationId = generateId()
    const projectId = generateId()
    const queue = createFakeQueuePublisher()

    await pg.db.insert(organizations).values({
      id: organizationId,
      name: "Retry Org",
      slug: `retry-${organizationId}`,
    })

    await pg.db.insert(subscriptions).values({
      id: generateId(),
      plan: "pro",
      referenceId: organizationId,
      stripeCustomerId: "cus_retry",
      stripeSubscriptionId: "sub_retry",
      status: "active",
      periodStart: new Date("2026-04-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-01T00:00:00.000Z"),
    })

    const run = (action: "live-eval-scan" | "eval-generation", idempotencyKey: string) =>
      Effect.runPromise(
        meterBillableAction({
          organizationId: OrganizationId(organizationId),
          projectId: ProjectId(projectId),
          action,
          idempotencyKey,
          skipIfBlocked: true,
        }).pipe(
          withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)),
          Effect.provideService(QueuePublisher, queue.publisher),
          withTracing,
        ),
      )

    await run("live-eval-scan", `live-eval-scan:${organizationId}:evaluation-a:trace-a`)
    await run("live-eval-scan", `live-eval-scan:${organizationId}:evaluation-a:trace-a`)
    await run("eval-generation", `eval-generation:${organizationId}:billing-op-a`)
    await run("eval-generation", `eval-generation:${organizationId}:billing-op-a`)

    const events = await pg.db
      .select()
      .from(billingUsageEvents)
      .where(eq(billingUsageEvents.organizationId, organizationId))
    const [period] = await pg.db
      .select()
      .from(billingUsagePeriods)
      .where(eq(billingUsagePeriods.organizationId, organizationId))

    expect(events).toHaveLength(2)
    expect(events.map((event) => event.credits).sort((a, b) => a - b)).toEqual([30, 1000])
    expect(period?.consumedCredits).toBe(1030)
  })

  it("blocks exhausted free orgs but allows paid orgs to continue into overage", async () => {
    const freeOrgId = generateId()
    const proOrgId = generateId()
    const projectId = generateId()
    const queue = createFakeQueuePublisher()

    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"))

      await pg.db.insert(organizations).values([
        {
          id: freeOrgId,
          name: "Free Billing Org",
          slug: `free-${freeOrgId}`,
        },
        {
          id: proOrgId,
          name: "Pro Billing Org",
          slug: `pro-${proOrgId}`,
        },
      ])

      await pg.db.insert(billingUsagePeriods).values({
        id: generateId(),
        organizationId: freeOrgId,
        planSlug: "free",
        periodStart: new Date("2026-06-01T00:00:00.000Z"),
        periodEnd: new Date("2026-07-01T00:00:00.000Z"),
        includedCredits: PLAN_CONFIGS.free.includedCredits,
        consumedCredits: PLAN_CONFIGS.free.includedCredits,
        overageCredits: 0,
        reportedOverageCredits: 0,
        overageAmountMicrocents: 0,
        updatedAt: new Date("2026-06-15T12:00:00.000Z"),
      })

      await pg.db.insert(subscriptions).values({
        id: generateId(),
        plan: "pro",
        referenceId: proOrgId,
        stripeCustomerId: "cus_overage",
        stripeSubscriptionId: "sub_overage",
        status: "active",
        periodStart: new Date("2026-06-01T00:00:00.000Z"),
        periodEnd: new Date("2026-07-01T00:00:00.000Z"),
      })
      await pg.db.insert(billingUsagePeriods).values({
        id: generateId(),
        organizationId: proOrgId,
        planSlug: "pro",
        periodStart: new Date("2026-06-01T00:00:00.000Z"),
        periodEnd: new Date("2026-07-01T00:00:00.000Z"),
        includedCredits: PLAN_CONFIGS.pro.includedCredits,
        consumedCredits: PLAN_CONFIGS.pro.includedCredits,
        overageCredits: 0,
        reportedOverageCredits: 0,
        overageAmountMicrocents: 0,
        updatedAt: new Date("2026-06-15T12:00:00.000Z"),
      })

      const freeResult = await Effect.runPromise(
        meterBillableAction({
          organizationId: OrganizationId(freeOrgId),
          projectId: ProjectId(projectId),
          action: "flagger-scan",
          idempotencyKey: `flagger-scan:${freeOrgId}:flagger-a:trace-a`,
          skipIfBlocked: true,
        }).pipe(
          withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(freeOrgId)),
          Effect.provideService(QueuePublisher, queue.publisher),
          withTracing,
        ),
      )

      const paidResult = await Effect.runPromise(
        meterBillableAction({
          organizationId: OrganizationId(proOrgId),
          projectId: ProjectId(projectId),
          action: "trace",
          idempotencyKey: `trace:${proOrgId}:${projectId}:trace-overage`,
          skipIfBlocked: true,
        }).pipe(
          withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(proOrgId)),
          Effect.provideService(QueuePublisher, queue.publisher),
          withTracing,
        ),
      )

      const [updatedPaidPeriod] = await pg.db
        .select()
        .from(billingUsagePeriods)
        .where(eq(billingUsagePeriods.organizationId, proOrgId))

      expect(freeResult).toEqual({
        allowed: false,
        period: {
          start: new Date("2026-06-01T00:00:00.000Z"),
          end: new Date("2026-07-01T00:00:00.000Z"),
          includedCredits: PLAN_CONFIGS.free.includedCredits,
          consumedCredits: PLAN_CONFIGS.free.includedCredits,
          overageCredits: 0,
        },
      })

      expect(paidResult.allowed).toBe(true)
      expect(updatedPaidPeriod?.consumedCredits).toBe(PLAN_CONFIGS.pro.includedCredits + 1)
      expect(updatedPaidPeriod?.overageCredits).toBe(1)
      expect(updatedPaidPeriod?.overageAmountMicrocents).toBeGreaterThan(0)
      expect(
        queue.getPublishedByDedupeKey("billing", `billing:reportOverage:${proOrgId}:2026-06-01T00:00:00.000Z`),
      ).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it("applies a pro spending cap from organization settings before recording new overage", async () => {
    const organizationId = generateId()
    const projectId = generateId()
    const queue = createFakeQueuePublisher()
    const proBasePriceCents = PLAN_CONFIGS.pro.priceCents

    if (proBasePriceCents === null) {
      throw new Error("Expected Pro plan base price to be configured")
    }

    await pg.db.insert(organizations).values([
      {
        id: organizationId,
        name: "Capped Pro Org",
        slug: `capped-${organizationId}`,
        settings: {
          billing: {
            spendingLimitCents: proBasePriceCents,
          },
        },
      },
    ])

    await pg.db.insert(subscriptions).values({
      id: generateId(),
      plan: "pro",
      referenceId: organizationId,
      stripeCustomerId: "cus_cap",
      stripeSubscriptionId: "sub_cap",
      status: "active",
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-01T00:00:00.000Z"),
    })
    await pg.db.insert(billingUsagePeriods).values({
      id: generateId(),
      organizationId,
      planSlug: "pro",
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-01T00:00:00.000Z"),
      includedCredits: PLAN_CONFIGS.pro.includedCredits,
      consumedCredits: PLAN_CONFIGS.pro.includedCredits,
      overageCredits: 0,
      reportedOverageCredits: 0,
      overageAmountMicrocents: 0,
      updatedAt: new Date("2026-07-15T12:00:00.000Z"),
    })

    const plan = await Effect.runPromise(
      resolveEffectivePlan(OrganizationId(organizationId)).pipe(
        withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)),
        withTracing,
      ),
    )

    const result = await Effect.runPromise(
      meterBillableAction({
        organizationId: OrganizationId(organizationId),
        projectId: ProjectId(projectId),
        action: "trace",
        idempotencyKey: `trace:${organizationId}:${projectId}:trace-cap`,
      }).pipe(
        withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)),
        Effect.provideService(QueuePublisher, queue.publisher),
        withTracing,
      ),
    )

    const [updatedPeriod] = await pg.db
      .select()
      .from(billingUsagePeriods)
      .where(eq(billingUsagePeriods.organizationId, organizationId))

    expect(plan.plan.spendingLimitCents).toBe(proBasePriceCents)
    expect(result.allowed).toBe(false)
    expect(updatedPeriod?.consumedCredits).toBe(PLAN_CONFIGS.pro.includedCredits)
    expect(updatedPeriod?.overageCredits).toBe(0)
    expect(
      queue.getPublishedByDedupeKey("billing", `billing:reportOverage:${organizationId}:2026-07-01T00:00:00.000Z`),
    ).toBeUndefined()
  })
})
