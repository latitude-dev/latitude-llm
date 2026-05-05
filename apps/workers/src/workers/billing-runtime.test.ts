import {
  authorizeBillableAction,
  BillingUsagePeriodRepository,
  PLAN_CONFIGS,
  recordBillableActionUseCase,
  recordTraceUsageBatchUseCase,
  resolveEffectivePlan,
} from "@domain/billing"
import { QueuePublisher } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { generateId, OrganizationId, ProjectId, TraceId } from "@domain/shared"
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

    const run = async (action: "live-eval-scan" | "eval-generation", idempotencyKey: string) => {
      const authorization = await Effect.runPromise(
        authorizeBillableAction({
          organizationId: OrganizationId(organizationId),
          action,
          skipIfBlocked: true,
        }).pipe(withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)), withTracing),
      )

      return Effect.runPromise(
        recordBillableActionUseCase({
          organizationId: OrganizationId(organizationId),
          projectId: ProjectId(projectId),
          action,
          idempotencyKey,
          context: authorization.context,
        }).pipe(
          withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)),
          Effect.provideService(QueuePublisher, queue.publisher),
          withTracing,
        ),
      )
    }

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

  it("authorizes synchronously without recording, then records asynchronously from the authorization snapshot", async () => {
    const organizationId = generateId()
    const projectId = generateId()
    const queue = createFakeQueuePublisher()

    await pg.db.insert(organizations).values({
      id: organizationId,
      name: "Authorize Org",
      slug: `authorize-${organizationId}`,
    })

    const authorization = await Effect.runPromise(
      authorizeBillableAction({
        organizationId: OrganizationId(organizationId),
        action: "flagger-scan",
        skipIfBlocked: true,
      }).pipe(withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)), withTracing),
    )

    const preRecordEvents = await pg.db
      .select()
      .from(billingUsageEvents)
      .where(eq(billingUsageEvents.organizationId, organizationId))

    expect(authorization.allowed).toBe(true)
    expect(preRecordEvents).toHaveLength(0)

    await Effect.runPromise(
      recordBillableActionUseCase({
        organizationId: OrganizationId(organizationId),
        projectId: ProjectId(projectId),
        action: "flagger-scan",
        idempotencyKey: `flagger-scan:${organizationId}:flagger-a:trace-a`,
        context: authorization.context,
      }).pipe(
        withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)),
        Effect.provideService(QueuePublisher, queue.publisher),
        withTracing,
      ),
    )

    const events = await pg.db
      .select()
      .from(billingUsageEvents)
      .where(eq(billingUsageEvents.organizationId, organizationId))
    const [period] = await pg.db
      .select()
      .from(billingUsagePeriods)
      .where(eq(billingUsagePeriods.organizationId, organizationId))

    expect(events).toHaveLength(1)
    expect(events[0]?.action).toBe("flagger-scan")
    expect(period?.consumedCredits).toBe(30)
  })

  it("records trace usage batches idempotently across queue retries", async () => {
    const organizationId = generateId()
    const projectId = generateId()
    const queue = createFakeQueuePublisher()
    const periodStart = new Date("2026-04-01T00:00:00.000Z")
    const periodEnd = new Date("2026-05-01T00:00:00.000Z")

    await pg.db.insert(organizations).values({
      id: organizationId,
      name: "Trace Batch Org",
      slug: `trace-batch-${organizationId}`,
    })

    await Effect.runPromise(
      recordTraceUsageBatchUseCase({
        organizationId: OrganizationId(organizationId),
        projectId: ProjectId(projectId),
        traceIds: [TraceId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1"), TraceId("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2")],
        planSlug: "free",
        planSource: "free-fallback",
        periodStart,
        periodEnd,
        includedCredits: PLAN_CONFIGS.free.includedCredits,
        overageAllowed: false,
      }).pipe(
        withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)),
        Effect.provideService(QueuePublisher, queue.publisher),
        withTracing,
      ),
    )

    await Effect.runPromise(
      recordTraceUsageBatchUseCase({
        organizationId: OrganizationId(organizationId),
        projectId: ProjectId(projectId),
        traceIds: [TraceId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1"), TraceId("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2")],
        planSlug: "free",
        planSource: "free-fallback",
        periodStart,
        periodEnd,
        includedCredits: PLAN_CONFIGS.free.includedCredits,
        overageAllowed: false,
      }).pipe(
        withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)),
        Effect.provideService(QueuePublisher, queue.publisher),
        withTracing,
      ),
    )

    const events = await pg.db
      .select()
      .from(billingUsageEvents)
      .where(eq(billingUsageEvents.organizationId, organizationId))
    const [period] = await pg.db
      .select()
      .from(billingUsagePeriods)
      .where(eq(billingUsagePeriods.organizationId, organizationId))

    expect(events).toHaveLength(2)
    expect(period?.consumedCredits).toBe(2)
    expect(period?.overageCredits).toBe(0)
    expect(queue.published.filter((message) => message.queue === "billing-overage")).toHaveLength(0)
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
        authorizeBillableAction({
          organizationId: OrganizationId(freeOrgId),
          action: "flagger-scan",
          skipIfBlocked: true,
        }).pipe(withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(freeOrgId)), withTracing),
      )

      const paidAuthorization = await Effect.runPromise(
        authorizeBillableAction({
          organizationId: OrganizationId(proOrgId),
          action: "trace",
          skipIfBlocked: true,
        }).pipe(withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(proOrgId)), withTracing),
      )

      await Effect.runPromise(
        recordBillableActionUseCase({
          organizationId: OrganizationId(proOrgId),
          projectId: ProjectId(projectId),
          action: "trace",
          idempotencyKey: `trace:${proOrgId}:${projectId}:trace-overage`,
          context: paidAuthorization.context,
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
        context: {
          planSlug: "free",
          planSource: "free-fallback",
          periodStart: new Date("2026-06-01T00:00:00.000Z"),
          periodEnd: new Date("2026-07-01T00:00:00.000Z"),
          includedCredits: PLAN_CONFIGS.free.includedCredits,
          overageAllowed: false,
        },
        period: {
          start: new Date("2026-06-01T00:00:00.000Z"),
          end: new Date("2026-07-01T00:00:00.000Z"),
          includedCredits: PLAN_CONFIGS.free.includedCredits,
          consumedCredits: PLAN_CONFIGS.free.includedCredits,
          overageCredits: 0,
        },
      })

      expect(paidAuthorization.allowed).toBe(true)
      expect(updatedPaidPeriod?.consumedCredits).toBe(PLAN_CONFIGS.pro.includedCredits + 1)
      expect(updatedPaidPeriod?.overageCredits).toBe(1)
      expect(updatedPaidPeriod?.overageAmountMicrocents).toBeGreaterThan(0)
      expect(
        queue.getPublishedByDedupeKey(
          "billing-overage",
          `billing:reportOverage:${proOrgId}:2026-06-01T00:00:00.000Z:2026-07-01T00:00:00.000Z`,
        ),
      ).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it("applies a pro spending cap from organization settings before recording new overage", async () => {
    const organizationId = generateId()
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
      authorizeBillableAction({
        organizationId: OrganizationId(organizationId),
        action: "trace",
      }).pipe(withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)), withTracing),
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
      queue.getPublishedByDedupeKey(
        "billing-overage",
        `billing:reportOverage:${organizationId}:2026-07-01T00:00:00.000Z:2026-08-01T00:00:00.000Z`,
      ),
    ).toBeUndefined()
  })

  it("advances reported overage credits without overwriting fresher usage totals", async () => {
    const organizationId = generateId()
    const periodStart = new Date("2026-08-01T00:00:00.000Z")
    const periodEnd = new Date("2026-09-01T00:00:00.000Z")

    await pg.db.insert(billingUsagePeriods).values({
      id: generateId(),
      organizationId,
      planSlug: "pro",
      periodStart,
      periodEnd,
      includedCredits: 0,
      consumedCredits: 3,
      overageCredits: 3,
      reportedOverageCredits: 0,
      overageAmountMicrocents: 0,
      updatedAt: new Date("2026-08-15T12:00:00.000Z"),
    })

    await Effect.runPromise(
      Effect.gen(function* () {
        const periodRepo = yield* BillingUsagePeriodRepository

        yield* periodRepo.appendCreditsForBillingPeriod({
          organizationId: OrganizationId(organizationId),
          periodStart,
          periodEnd,
          planSlug: "pro",
          persistedIncludedCredits: 0,
          creditsDelta: 2,
        })

        yield* periodRepo.advanceReportedOverageCredits({
          organizationId: OrganizationId(organizationId),
          periodStart,
          periodEnd,
          reportedOverageCredits: 3,
        })
      }).pipe(
        withPostgres(BillingUsagePeriodRepositoryLive, pg.appPostgresClient, OrganizationId(organizationId)),
        withTracing,
      ),
    )

    const [period] = await pg.db
      .select()
      .from(billingUsagePeriods)
      .where(eq(billingUsagePeriods.organizationId, organizationId))

    expect(period?.consumedCredits).toBe(5)
    expect(period?.overageCredits).toBe(5)
    expect(period?.reportedOverageCredits).toBe(3)
  })
})
