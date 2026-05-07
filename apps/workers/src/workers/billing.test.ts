import {
  authorizeBillableAction,
  BillingSpendReservation,
  BillingUsagePeriodRepository,
  buildBillingIdempotencyKey,
  PLAN_CONFIGS,
  recordBillableActionUseCase,
  recordTraceUsageBatchUseCase,
  resolveEffectivePlan,
} from "@domain/billing"
import { createFakeBillingSpendReservation } from "@domain/billing/testing"
import { generateId, OrganizationId, ProjectId, TraceId } from "@domain/shared"
import {
  BillingOverrideRepositoryLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  eq,
  OutboxEventWriterLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { organizations, subscriptions } from "@platform/db-postgres/schema/better-auth"
import { billingOverrides, billingUsageEvents, billingUsagePeriods } from "@platform/db-postgres/schema/billing"
import { outboxEvents } from "@platform/db-postgres/schema/outbox-events"
import { setupTestPostgres } from "@platform/testkit"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { describe, expect, it, vi } from "vitest"
import { TestQueueConsumer } from "../testing/index.ts"
import { createBillingWorker, TRACE_USAGE_BATCH_FLUSH_MS } from "./billing.ts"

const pg = setupTestPostgres()

const billingLayers = Layer.mergeAll(
  BillingOverrideRepositoryLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  OutboxEventWriterLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
)

// Default reservation for tests that don't exercise the spending-cap-under-concurrency path. The
// use-case only invokes `tryReserve` when an `idempotencyKey` is supplied, but the Effect requirement
// channel still tracks the dependency, so existing tests must provide some implementation.
const provideAlwaysAllowReservation = Effect.provideService(
  BillingSpendReservation,
  createFakeBillingSpendReservation("always-allow").reservation,
)

const provideAtomicReservation = Effect.provideService(
  BillingSpendReservation,
  createFakeBillingSpendReservation("atomic").reservation,
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
          idempotencyKey,
        }).pipe(
          withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)),
          provideAlwaysAllowReservation,
          withTracing,
        ),
      )

      return Effect.runPromise(
        recordBillableActionUseCase({
          organizationId: OrganizationId(organizationId),
          projectId: ProjectId(projectId),
          action,
          idempotencyKey,
          context: authorization.context,
        }).pipe(withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)), withTracing),
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

  it("treats concurrent duplicate record deliveries as one billed action", async () => {
    const organizationId = generateId()
    const projectId = generateId()
    const idempotencyKey = `flagger-scan:${organizationId}:flagger-a:trace-a`
    const context = {
      planSlug: "free" as const,
      planSource: "free-fallback" as const,
      periodStart: new Date("2026-04-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-01T00:00:00.000Z"),
      includedCredits: PLAN_CONFIGS.free.includedCredits,
      overageAllowed: false,
    }

    await pg.db.insert(organizations).values({
      id: organizationId,
      name: "Concurrent Duplicate Org",
      slug: `concurrent-duplicate-${organizationId}`,
    })

    const run = () =>
      Effect.runPromise(
        recordBillableActionUseCase({
          organizationId: OrganizationId(organizationId),
          projectId: ProjectId(projectId),
          action: "flagger-scan",
          idempotencyKey,
          context,
          traceId: TraceId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1"),
          metadata: { flaggerSlug: "flagger-a" },
        }).pipe(withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)), withTracing),
      )

    const [first, second] = await Promise.all([run(), run()])

    const events = await pg.db
      .select()
      .from(billingUsageEvents)
      .where(eq(billingUsageEvents.organizationId, organizationId))
    const [period] = await pg.db
      .select()
      .from(billingUsagePeriods)
      .where(eq(billingUsagePeriods.organizationId, organizationId))
    const outbox = await pg.db.select().from(outboxEvents).where(eq(outboxEvents.organizationId, organizationId))

    expect(first.consumedCredits).toBe(30)
    expect(second.consumedCredits).toBe(30)
    expect(events).toHaveLength(1)
    expect(period?.consumedCredits).toBe(30)
    expect(outbox).toHaveLength(1)
  })

  it("authorizes synchronously without recording, then records asynchronously from the authorization snapshot", async () => {
    const organizationId = generateId()
    const projectId = generateId()

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
        idempotencyKey: `flagger-scan:${organizationId}:trace-authorize`,
      }).pipe(
        withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)),
        provideAlwaysAllowReservation,
        withTracing,
      ),
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
      }).pipe(withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)), withTracing),
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
        traceUsages: [TraceId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1"), TraceId("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2")].map(
          (traceId) => ({ projectId: ProjectId(projectId), traceId }),
        ),
        planSlug: "free",
        planSource: "free-fallback",
        periodStart,
        periodEnd,
        includedCredits: PLAN_CONFIGS.free.includedCredits,
        overageAllowed: false,
      }).pipe(withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)), withTracing),
    )

    await Effect.runPromise(
      recordTraceUsageBatchUseCase({
        organizationId: OrganizationId(organizationId),
        traceUsages: [TraceId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1"), TraceId("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2")].map(
          (traceId) => ({ projectId: ProjectId(projectId), traceId }),
        ),
        planSlug: "free",
        planSource: "free-fallback",
        periodStart,
        periodEnd,
        includedCredits: PLAN_CONFIGS.free.includedCredits,
        overageAllowed: false,
      }).pipe(withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)), withTracing),
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
  })

  it("micro-batches trace usage jobs for the same organization period", async () => {
    const consumer = new TestQueueConsumer()
    const organizationId = generateId()
    const firstProjectId = generateId()
    const secondProjectId = generateId()
    const periodStart = new Date("2026-04-01T00:00:00.000Z")
    const periodEnd = new Date("2026-05-01T00:00:00.000Z")

    await pg.db.insert(organizations).values({
      id: organizationId,
      name: "Trace Micro Batch Org",
      slug: `trace-micro-batch-${organizationId}`,
    })

    createBillingWorker({ consumer, postgresClient: pg.appPostgresClient })

    const makePayload = (projectId: string, traceIds: readonly string[]) => ({
      organizationId,
      projectId,
      traceIds,
      planSlug: "free" as const,
      planSource: "free-fallback" as const,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      includedCredits: PLAN_CONFIGS.free.includedCredits,
      overageAllowed: false,
    })

    vi.useFakeTimers()
    try {
      const first = consumer.dispatchTask(
        "billing",
        "recordTraceUsageBatch",
        makePayload(firstProjectId, ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2"]),
      )
      const second = consumer.dispatchTask(
        "billing",
        "recordTraceUsageBatch",
        makePayload(secondProjectId, ["ccccccccccccccccccccccccccccccc3"]),
      )

      await vi.advanceTimersByTimeAsync(TRACE_USAGE_BATCH_FLUSH_MS)
      vi.useRealTimers()
      await Promise.all([first, second])
    } finally {
      vi.useRealTimers()
    }

    const events = await pg.db
      .select()
      .from(billingUsageEvents)
      .where(eq(billingUsageEvents.organizationId, organizationId))
    const [period] = await pg.db
      .select()
      .from(billingUsagePeriods)
      .where(eq(billingUsagePeriods.organizationId, organizationId))
    const emittedEvents = await pg.db.select().from(outboxEvents).where(eq(outboxEvents.organizationId, organizationId))

    expect(events).toHaveLength(3)
    expect(new Set(events.map((event) => event.projectId))).toEqual(new Set([firstProjectId, secondProjectId]))
    expect(period?.consumedCredits).toBe(3)
    expect(emittedEvents).toHaveLength(1)
    expect(emittedEvents[0]?.eventName).toBe("BillingUsagePeriodUpdated")
  })

  it("blocks exhausted free orgs but allows paid orgs to continue into overage", async () => {
    const freeOrgId = generateId()
    const proOrgId = generateId()
    const projectId = generateId()

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
        overageAmountMills: 0,
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
        overageAmountMills: 0,
        updatedAt: new Date("2026-06-15T12:00:00.000Z"),
      })

      const freeResult = await Effect.runPromise(
        authorizeBillableAction({
          organizationId: OrganizationId(freeOrgId),
          action: "flagger-scan",
          skipIfBlocked: true,
          idempotencyKey: `flagger-scan:${freeOrgId}:trace-free`,
        }).pipe(
          withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(freeOrgId)),
          provideAtomicReservation,
          withTracing,
        ),
      )

      const paidAuthorization = await Effect.runPromise(
        authorizeBillableAction({
          organizationId: OrganizationId(proOrgId),
          action: "trace",
          skipIfBlocked: true,
          idempotencyKey: `trace:${proOrgId}:${projectId}:trace-overage`,
        }).pipe(
          withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(proOrgId)),
          provideAlwaysAllowReservation,
          withTracing,
        ),
      )

      await Effect.runPromise(
        recordBillableActionUseCase({
          organizationId: OrganizationId(proOrgId),
          projectId: ProjectId(projectId),
          action: "trace",
          idempotencyKey: `trace:${proOrgId}:${projectId}:trace-overage`,
          context: paidAuthorization.context,
        }).pipe(withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(proOrgId)), withTracing),
      )

      const publishedBillingEvents = await pg.db
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.organizationId, proOrgId))

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
      expect(updatedPaidPeriod?.overageAmountMills).toBeGreaterThan(0)
      expect(publishedBillingEvents.some((event) => event.eventName === "BillingUsagePeriodUpdated")).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it("applies a pro spending cap from organization settings before recording new overage", async () => {
    const organizationId = generateId()
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
      overageAmountMills: 0,
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
        idempotencyKey: `trace:${organizationId}:spend-cap-projection`,
      }).pipe(
        withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)),
        provideAlwaysAllowReservation,
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
      overageAmountMills: 0,
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

  it("does not roll back reportedOverageCredits when an out-of-order advance arrives", async () => {
    // Regression: the overage worker reports cumulative ranges to Stripe and then
    // calls `advanceReportedOverageCredits` to checkpoint how much has been
    // reported. If a slow attempt lands after a faster one (e.g. a retried job
    // running alongside a newer job), a blind UPDATE used to overwrite the
    // higher value and cause the next cycle to re-report credits that Stripe
    // had already accepted — overcharging the customer. The CAS now refuses
    // backward advances.
    const organizationId = generateId()
    const periodStart = new Date("2026-10-01T00:00:00.000Z")
    const periodEnd = new Date("2026-11-01T00:00:00.000Z")

    await pg.db.insert(billingUsagePeriods).values({
      id: generateId(),
      organizationId,
      planSlug: "pro",
      periodStart,
      periodEnd,
      includedCredits: 0,
      consumedCredits: 100,
      overageCredits: 100,
      reportedOverageCredits: 100,
      overageAmountMills: 0,
      updatedAt: new Date("2026-10-15T12:00:00.000Z"),
    })

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const periodRepo = yield* BillingUsagePeriodRepository
        return yield* periodRepo.advanceReportedOverageCredits({
          organizationId: OrganizationId(organizationId),
          periodStart,
          periodEnd,
          reportedOverageCredits: 50,
        })
      }).pipe(
        withPostgres(BillingUsagePeriodRepositoryLive, pg.appPostgresClient, OrganizationId(organizationId)),
        withTracing,
      ),
    )

    expect(result).toBeNull()

    const [period] = await pg.db
      .select()
      .from(billingUsagePeriods)
      .where(eq(billingUsagePeriods.organizationId, organizationId))

    expect(period?.reportedOverageCredits).toBe(100)
  })

  describe("Pro spending cap concurrency", () => {
    /**
     * Setup shared by both tests:
     *
     * - Pro org sitting at exactly 100% of included credits (consumed = includedCredits = 100_000).
     * - Spending limit = base $99 + $0.30 of overage headroom = 9930 cents. The Pro overage rate
     *   is $0.002/credit, so $0.30 buys exactly 150 overage credits.
     * - Each `live-eval-scan` costs 30 credits → 5 reservations fit, the 6th overshoots.
     * - 10 concurrent authorizations.
     *
     * Without atomic reservation, every concurrent caller reads the same 100_000 snapshot, projects
     * `100_030 ≤ 100_150 (cap)` and is allowed. All 10 then record → final consumed = 100_300, overage = 300,
     * spend = $99.60, overshooting the $99.30 cap by 100% of available overage.
     *
     * With atomic reservation, exactly 5 succeed and the worker writes 5 records → final consumed = 100_150,
     * overage = 150, spend = $99.30 = cap.
     */
    const PRO_BASE_CENTS = PLAN_CONFIGS.pro.priceCents as number
    const SPENDING_LIMIT_CENTS = PRO_BASE_CENTS + 30
    const PERIOD_START = new Date("2026-08-01T00:00:00.000Z")
    const PERIOD_END = new Date("2026-09-01T00:00:00.000Z")
    const CONCURRENCY = 10
    const ACTION_COST = 30

    const seedCappedProOrgAtIncludedLimit = async (organizationId: string) => {
      await pg.db.insert(organizations).values({
        id: organizationId,
        name: "Concurrent Pro Org",
        slug: `concurrent-${organizationId}`,
        settings: { billing: { spendingLimitCents: SPENDING_LIMIT_CENTS } },
      })
      await pg.db.insert(subscriptions).values({
        id: generateId(),
        plan: "pro",
        referenceId: organizationId,
        stripeCustomerId: `cus_concurrent_${organizationId}`,
        stripeSubscriptionId: `sub_concurrent_${organizationId}`,
        status: "active",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      })
      await pg.db.insert(billingUsagePeriods).values({
        id: generateId(),
        organizationId,
        planSlug: "pro",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        includedCredits: PLAN_CONFIGS.pro.includedCredits,
        consumedCredits: PLAN_CONFIGS.pro.includedCredits,
        overageCredits: 0,
        reportedOverageCredits: 0,
        overageAmountMills: 0,
        updatedAt: PERIOD_START,
      })
    }

    const runConcurrentAuthorizeAndRecord = async (
      organizationId: string,
      projectId: string,
      authorize: (idempotencyKey: string) => Effect.Effect<{ allowed: boolean }, unknown>,
    ) => {
      const requests = Array.from({ length: CONCURRENCY }, (_, index) => index)

      const authorizations = await Promise.all(
        requests.map((index) => {
          const idempotencyKey = buildBillingIdempotencyKey("live-eval-scan", [
            organizationId,
            "evaluation-a",
            `trace-${index}`,
          ])
          return Effect.runPromise(authorize(idempotencyKey)).then((authorization) => ({
            index,
            idempotencyKey,
            allowed: authorization.allowed,
          }))
        }),
      )

      const allowedAuthorizations = authorizations.filter((authorization) => authorization.allowed)

      // Workers process records sequentially after authorization fans out: each accepted
      // authorization eventually causes the period counter to advance.
      for (const authorization of allowedAuthorizations) {
        await Effect.runPromise(
          recordBillableActionUseCase({
            organizationId: OrganizationId(organizationId),
            projectId: ProjectId(projectId),
            action: "live-eval-scan",
            idempotencyKey: authorization.idempotencyKey,
            context: {
              planSlug: "pro",
              planSource: "subscription",
              periodStart: PERIOD_START,
              periodEnd: PERIOD_END,
              includedCredits: PLAN_CONFIGS.pro.includedCredits,
              overageAllowed: true,
            },
          }).pipe(withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)), withTracing),
        )
      }

      const [period] = await pg.db
        .select()
        .from(billingUsagePeriods)
        .where(eq(billingUsagePeriods.organizationId, organizationId))

      return { authorizations, allowedCount: allowedAuthorizations.length, period }
    }

    it("demonstrates spend overshoot when authorize relies only on the Postgres snapshot", async () => {
      const organizationId = generateId()
      const projectId = generateId()
      await seedCappedProOrgAtIncludedLimit(organizationId)

      // Reservation is still invoked here, but the fake adapter deliberately always allows so the
      // authorization path behaves like a snapshot-only deployment near the cap boundary.
      const result = await runConcurrentAuthorizeAndRecord(organizationId, projectId, (idempotencyKey) =>
        authorizeBillableAction({
          organizationId: OrganizationId(organizationId),
          action: "live-eval-scan",
          skipIfBlocked: true,
          idempotencyKey,
        }).pipe(
          withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)),
          provideAlwaysAllowReservation,
          withTracing,
        ),
      )

      const finalConsumed = result.period?.consumedCredits ?? 0
      const finalOverage = result.period?.overageCredits ?? 0
      const finalSpendCents = PRO_BASE_CENTS + (finalOverage * 2000) / 10_000

      expect(result.allowedCount).toBe(CONCURRENCY)
      expect(finalConsumed).toBe(PLAN_CONFIGS.pro.includedCredits + CONCURRENCY * ACTION_COST)
      // Cap is $99.30; without reservation, final spend reaches $99.60 — $0.30 over the cap, i.e. 100%
      // of the available overage budget gets spent on top of what was already allowed.
      expect(finalSpendCents).toBeGreaterThan(SPENDING_LIMIT_CENTS)
    })

    it("bounds spend within the cap when authorize uses the spend-reservation port", async () => {
      const organizationId = generateId()
      const projectId = generateId()
      await seedCappedProOrgAtIncludedLimit(organizationId)

      const { reservation } = createFakeBillingSpendReservation("atomic")

      const result = await runConcurrentAuthorizeAndRecord(organizationId, projectId, (idempotencyKey) =>
        authorizeBillableAction({
          organizationId: OrganizationId(organizationId),
          action: "live-eval-scan",
          skipIfBlocked: true,
          idempotencyKey,
        }).pipe(
          withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)),
          Effect.provideService(BillingSpendReservation, reservation),
          withTracing,
        ),
      )

      const finalConsumed = result.period?.consumedCredits ?? 0
      const finalOverage = result.period?.overageCredits ?? 0
      const finalSpendCents = PRO_BASE_CENTS + (finalOverage * 2000) / 10_000
      const expectedAllowed = Math.floor(((SPENDING_LIMIT_CENTS - PRO_BASE_CENTS) * 5) / ACTION_COST)

      expect(expectedAllowed).toBe(5)
      expect(result.allowedCount).toBe(expectedAllowed)
      expect(finalConsumed).toBe(PLAN_CONFIGS.pro.includedCredits + expectedAllowed * ACTION_COST)
      expect(finalSpendCents).toBeLessThanOrEqual(SPENDING_LIMIT_CENTS)
    })

    it("treats authorize retries with the same idempotency key as a single reservation", async () => {
      const organizationId = generateId()
      await seedCappedProOrgAtIncludedLimit(organizationId)

      const { reservation } = createFakeBillingSpendReservation("atomic")
      const idempotencyKey = buildBillingIdempotencyKey("live-eval-scan", [
        organizationId,
        "evaluation-a",
        "trace-retry",
      ])

      const runAuthorize = () =>
        Effect.runPromise(
          authorizeBillableAction({
            organizationId: OrganizationId(organizationId),
            action: "live-eval-scan",
            skipIfBlocked: true,
            idempotencyKey,
          }).pipe(
            withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)),
            Effect.provideService(BillingSpendReservation, reservation),
            withTracing,
          ),
        )

      // Same logical action authorized 4 times (worker retried before publish landed). The reservation
      // must only count once so the cap stays consistent.
      const results = await Promise.all([runAuthorize(), runAuthorize(), runAuthorize(), runAuthorize()])

      expect(results.every((authorization) => authorization.allowed)).toBe(true)

      // Five distinct other actions should still fit (1 retried + 5 fresh = 6 distinct → 6th would exceed).
      const otherKeys = ["a", "b", "c", "d", "e"].map((suffix) =>
        buildBillingIdempotencyKey("live-eval-scan", [organizationId, "evaluation-a", `trace-${suffix}`]),
      )
      const otherResults = []
      for (const key of otherKeys) {
        otherResults.push(
          await Effect.runPromise(
            authorizeBillableAction({
              organizationId: OrganizationId(organizationId),
              action: "live-eval-scan",
              skipIfBlocked: true,
              idempotencyKey: key,
            }).pipe(
              withPostgres(billingLayers, pg.appPostgresClient, OrganizationId(organizationId)),
              Effect.provideService(BillingSpendReservation, reservation),
              withTracing,
            ),
          ),
        )
      }

      // Total reserved logical actions = 5 (retried + 4 fresh) → fits within 150 credit cap.
      // The 5th `other` push would be the 6th distinct → refused.
      expect(otherResults.slice(0, 4).every((authorization) => authorization.allowed)).toBe(true)
      expect(otherResults[4]?.allowed).toBe(false)
    })
  })
})
