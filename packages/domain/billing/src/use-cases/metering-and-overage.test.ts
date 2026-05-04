import {
  BillingUsageEventRepository,
  BillingUsagePeriodRepository,
  calculateMaxReportableOverageCreditsForCap,
  PRO_PLAN_CONFIG,
  recordBillableActionUseCase,
  recordTraceUsageBatchUseCase,
  reportBillingOverageUseCase,
  StripeBillingProvider,
} from "@domain/billing"
import {
  createFakeBillingUsageEventRepository,
  createFakeBillingUsagePeriodRepository,
  createFakeStripeBillingProvider,
  seedBillingUsagePeriod,
} from "@domain/billing/testing"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { OrganizationId, ProjectId, SqlClient, TraceId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"

const ORGANIZATION_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))
const OTHER_PROJECT_ID = ProjectId("q".repeat(24))
const PERIOD_START = new Date("2026-01-01T00:00:00.000Z")
const PERIOD_END = new Date("2026-02-01T00:00:00.000Z")
const SQL_CLIENT = createFakeSqlClient({ organizationId: ORGANIZATION_ID })

const createBillingQueueLayer = () => {
  const { repository: events, eventsByPeriodAndIdempotencyKey } = createFakeBillingUsageEventRepository()
  const { repository: periods, periodsByKey } = createFakeBillingUsagePeriodRepository()
  const outboxEvents: OutboxWriteEvent[] = []

  return {
    outboxEvents,
    periods,
    periodsByKey,
    eventsByPeriodAndIdempotencyKey,
    layer: Layer.mergeAll(
      Layer.succeed(OutboxEventWriter, {
        write: (event) =>
          Effect.sync(() => {
            outboxEvents.push(event)
          }),
      }),
      Layer.succeed(BillingUsageEventRepository, events),
      Layer.succeed(BillingUsagePeriodRepository, periods),
      Layer.succeed(SqlClient, SQL_CLIENT),
    ),
  }
}

describe("recordBillableActionUseCase", () => {
  it("writes a billing usage period event when a subscription-backed period advances", async () => {
    const { layer, outboxEvents, periods } = createBillingQueueLayer()

    await Effect.runPromise(
      periods
        .upsert(
          seedBillingUsagePeriod({
            organizationId: ORGANIZATION_ID,
            planSlug: "pro",
            periodStart: PERIOD_START,
            periodEnd: PERIOD_END,
            includedCredits: 100_000,
            consumedCredits: 100_000,
          }),
        )
        .pipe(Effect.provideService(SqlClient, SQL_CLIENT)),
    )

    const result = await Effect.runPromise(
      recordBillableActionUseCase({
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        action: "live-eval-scan",
        idempotencyKey: "live-eval:1",
        context: {
          planSlug: "pro",
          planSource: "subscription",
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
          includedCredits: 100_000,
          overageAllowed: true,
        },
        traceId: TraceId("t".repeat(32)),
      }).pipe(Effect.provide(layer)),
    )

    expect(result.overageCredits).toBe(30)
    expect(outboxEvents[0]).toMatchObject({
      eventName: "BillingUsagePeriodUpdated",
      payload: {
        organizationId: ORGANIZATION_ID,
        periodStart: PERIOD_START.toISOString(),
        periodEnd: PERIOD_END.toISOString(),
        planSource: "subscription",
        overageAllowed: true,
        overageCredits: 30,
        reportedOverageCredits: 0,
      },
    })
  })
})

describe("recordTraceUsageBatchUseCase", () => {
  it("deduplicates trace ids before recording usage", async () => {
    const { layer, eventsByPeriodAndIdempotencyKey } = createBillingQueueLayer()

    const result = await Effect.runPromise(
      recordTraceUsageBatchUseCase({
        organizationId: ORGANIZATION_ID,
        traceUsages: [TraceId("a".repeat(32)), TraceId("a".repeat(32)), TraceId("b".repeat(32))].map((traceId) => ({
          projectId: PROJECT_ID,
          traceId,
        })),
        planSlug: "free",
        planSource: "free-fallback",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        includedCredits: 20_000,
        overageAllowed: false,
      }).pipe(Effect.provide(layer)),
    )

    expect(eventsByPeriodAndIdempotencyKey.size).toBe(2)
    expect(result.consumedCredits).toBe(2)
  })

  it("keeps same trace ids distinct across projects", async () => {
    const { layer, eventsByPeriodAndIdempotencyKey } = createBillingQueueLayer()

    const result = await Effect.runPromise(
      recordTraceUsageBatchUseCase({
        organizationId: ORGANIZATION_ID,
        traceUsages: [
          { projectId: PROJECT_ID, traceId: TraceId("a".repeat(32)) },
          { projectId: OTHER_PROJECT_ID, traceId: TraceId("a".repeat(32)) },
        ],
        planSlug: "free",
        planSource: "free-fallback",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        includedCredits: 20_000,
        overageAllowed: false,
      }).pipe(Effect.provide(layer)),
    )

    expect(eventsByPeriodAndIdempotencyKey.size).toBe(2)
    expect(result.consumedCredits).toBe(2)
  })

  it("returns the current period when every trace in the batch was already recorded", async () => {
    const { layer, periods } = createBillingQueueLayer()

    await Effect.runPromise(
      periods
        .upsert(
          seedBillingUsagePeriod({
            organizationId: ORGANIZATION_ID,
            planSlug: "free",
            periodStart: PERIOD_START,
            periodEnd: PERIOD_END,
            includedCredits: 20_000,
            consumedCredits: 42,
          }),
        )
        .pipe(Effect.provideService(SqlClient, SQL_CLIENT)),
    )

    await Effect.runPromise(
      recordTraceUsageBatchUseCase({
        organizationId: ORGANIZATION_ID,
        traceUsages: [{ projectId: PROJECT_ID, traceId: TraceId("a".repeat(32)) }],
        planSlug: "free",
        planSource: "free-fallback",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        includedCredits: 20_000,
        overageAllowed: false,
      }).pipe(Effect.provide(layer)),
    )

    const duplicate = await Effect.runPromise(
      recordTraceUsageBatchUseCase({
        organizationId: ORGANIZATION_ID,
        traceUsages: [{ projectId: PROJECT_ID, traceId: TraceId("a".repeat(32)) }],
        planSlug: "free",
        planSource: "free-fallback",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        includedCredits: 20_000,
        overageAllowed: false,
      }).pipe(Effect.provide(layer)),
    )

    expect(duplicate.consumedCredits).toBe(43)
  })
})

describe("reportBillingOverageUseCase", () => {
  it("skips when the Stripe billing provider is not configured", async () => {
    const { service } = createFakeStripeBillingProvider({ configured: false })

    const result = await Effect.runPromise(
      reportBillingOverageUseCase({
        organizationId: ORGANIZATION_ID,
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        overageCreditsToReport: 30,
        cumulativeOverageCredits: 30,
      }).pipe(Effect.provide(Layer.succeed(StripeBillingProvider, service))),
    )

    expect(result).toEqual({ status: "skipped", reason: "provider-not-configured" })
  })

  it("attaches the overage price item before reporting when the subscription is missing it", async () => {
    const { service, attachedCalls, recordedEvents } = createFakeStripeBillingProvider({ configured: true })

    const result = await Effect.runPromise(
      reportBillingOverageUseCase({
        organizationId: ORGANIZATION_ID,
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        overageCreditsToReport: 30,
        cumulativeOverageCredits: 30,
      }).pipe(Effect.provide(Layer.succeed(StripeBillingProvider, service))),
    )

    expect(result).toEqual({ status: "reported" })
    expect(attachedCalls).toEqual(["sub_123"])
    expect(recordedEvents[0]).toMatchObject({
      organizationId: ORGANIZATION_ID,
      stripeCustomerId: "cus_123",
      overageCreditsToReport: 30,
      cumulativeOverageCredits: 30,
    })
  })

  it("uses the cumulative snapshot in the meter event identifier so retries deduplicate after accrual", async () => {
    // Regression: the worker is invoked twice for the same period — once
    // before any new accrual, once after. Both invocations carry the same
    // snapshot value (the publisher pinned it at enqueue time), so even
    // though the value-to-report differs (because reportedOverageCredits has
    // moved between calls), the identifier is stable and Stripe deduplicates
    // the second event. Without this, retries-after-partial-failure could
    // double-charge: the first attempt's value would already be on the
    // meter and the retry would *add* a new event with overlapping range.
    const { service, recordedEvents } = createFakeStripeBillingProvider({
      configured: true,
      attachedSubscriptionIds: ["sub_123"],
    })

    await Effect.runPromise(
      reportBillingOverageUseCase({
        organizationId: ORGANIZATION_ID,
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        overageCreditsToReport: 50,
        cumulativeOverageCredits: 100,
      }).pipe(Effect.provide(Layer.succeed(StripeBillingProvider, service))),
    )

    await Effect.runPromise(
      reportBillingOverageUseCase({
        organizationId: ORGANIZATION_ID,
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        overageCreditsToReport: 30,
        cumulativeOverageCredits: 100,
      }).pipe(Effect.provide(Layer.succeed(StripeBillingProvider, service))),
    )

    expect(recordedEvents).toHaveLength(2)
    expect(recordedEvents[0]).toMatchObject({ cumulativeOverageCredits: 100, overageCreditsToReport: 50 })
    expect(recordedEvents[1]).toMatchObject({ cumulativeOverageCredits: 100, overageCreditsToReport: 30 })
  })
})

describe("calculateMaxReportableOverageCreditsForCap", () => {
  it("caps reportable overage so base subscription plus metered usage stays within the spending limit", () => {
    expect(
      calculateMaxReportableOverageCreditsForCap(
        PRO_PLAN_CONFIG.slug,
        PRO_PLAN_CONFIG.includedCredits,
        PRO_PLAN_CONFIG.priceCents,
        PRO_PLAN_CONFIG.priceCents + 4_000,
      ),
    ).toBe(20_000)
  })

  it("returns zero reportable overage when the spending limit equals the base subscription price", () => {
    expect(
      calculateMaxReportableOverageCreditsForCap(
        PRO_PLAN_CONFIG.slug,
        PRO_PLAN_CONFIG.includedCredits,
        PRO_PLAN_CONFIG.priceCents,
        PRO_PLAN_CONFIG.priceCents,
      ),
    ).toBe(0)
  })
})
