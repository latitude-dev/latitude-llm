import {
  BillingUsageEventRepository,
  BillingUsagePeriodRepository,
  checkCreditAvailabilityUseCase,
  recordUsageEventUseCase,
} from "@domain/billing"
import {
  createFakeBillingUsageEventRepository,
  createFakeBillingUsagePeriodRepository,
  seedBillingUsagePeriod,
} from "@domain/billing/testing"
import { OutboxEventWriter } from "@domain/events"
import { OrganizationId, ProjectId, SqlClient, TraceId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"

const ORGANIZATION_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))
const PERIOD_START = new Date("2026-01-01T00:00:00.000Z")
const PERIOD_END = new Date("2026-02-01T00:00:00.000Z")
const SQL_CLIENT = createFakeSqlClient({ organizationId: ORGANIZATION_ID })

const buildEventKey = (periodStart: Date, idempotencyKey: string) => `${periodStart.toISOString()}:${idempotencyKey}`

const createLayer = () => {
  const { repository: events, eventsByPeriodAndIdempotencyKey } = createFakeBillingUsageEventRepository()
  const { repository: periods, periodsByKey } = createFakeBillingUsagePeriodRepository()

  return {
    eventsByPeriodAndIdempotencyKey,
    periodsByKey,
    periods,
    layer: Layer.mergeAll(
      Layer.succeed(BillingUsageEventRepository, events),
      Layer.succeed(BillingUsagePeriodRepository, periods),
      Layer.succeed(OutboxEventWriter, { write: () => Effect.void }),
      Layer.succeed(SqlClient, SQL_CLIENT),
    ),
  }
}

describe("recordUsageEventUseCase", () => {
  it("records a new usage event and appends credits to the billing period", async () => {
    const { layer, eventsByPeriodAndIdempotencyKey } = createLayer()

    const result = await Effect.runPromise(
      recordUsageEventUseCase({
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        action: "trace",
        idempotencyKey: "trace:1",
        planSlug: "free",
        planSource: "free-fallback",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        includedCredits: 20_000,
        overageAllowed: false,
        traceId: TraceId("t".repeat(32)),
      }).pipe(Effect.provide(layer)),
    )

    expect(eventsByPeriodAndIdempotencyKey.has(buildEventKey(PERIOD_START, "trace:1"))).toBe(true)
    expect(result).toMatchObject({
      organizationId: ORGANIZATION_ID,
      consumedCredits: 1,
      overageCredits: 0,
    })
  })

  it("returns the existing period snapshot when the idempotency key was already recorded", async () => {
    const { layer, periods, periodsByKey, eventsByPeriodAndIdempotencyKey } = createLayer()

    await Effect.runPromise(
      periods
        .upsert(
          seedBillingUsagePeriod({
            organizationId: ORGANIZATION_ID,
            planSlug: "pro",
            periodStart: PERIOD_START,
            periodEnd: PERIOD_END,
            includedCredits: 100_000,
            consumedCredits: 100_030,
          }),
        )
        .pipe(Effect.provideService(SqlClient, SQL_CLIENT)),
    )

    eventsByPeriodAndIdempotencyKey.set(buildEventKey(PERIOD_START, "dup-key"), {
      id: "evt-dup",
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      action: "live-eval-scan",
      credits: 30,
      idempotencyKey: "dup-key",
      happenedAt: new Date("2026-01-15T00:00:00.000Z"),
      billingPeriodStart: PERIOD_START,
      billingPeriodEnd: PERIOD_END,
    })

    const duplicate = await Effect.runPromise(
      recordUsageEventUseCase({
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        action: "live-eval-scan",
        idempotencyKey: "dup-key",
        planSlug: "pro",
        planSource: "subscription",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        includedCredits: 100_000,
        overageAllowed: true,
      }).pipe(Effect.provide(layer)),
    )

    expect(duplicate.consumedCredits).toBe(100_030)
    expect(periodsByKey.size).toBe(1)
  })

  it("returns an empty period snapshot when a duplicate event exists before any period row was created", async () => {
    const { layer, eventsByPeriodAndIdempotencyKey } = createLayer()

    eventsByPeriodAndIdempotencyKey.set(buildEventKey(PERIOD_START, "trace:before-period"), {
      id: "evt-1",
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      action: "trace",
      credits: 1,
      idempotencyKey: "trace:before-period",
      happenedAt: new Date("2026-01-15T00:00:00.000Z"),
      billingPeriodStart: PERIOD_START,
      billingPeriodEnd: PERIOD_END,
    })

    const duplicate = await Effect.runPromise(
      recordUsageEventUseCase({
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        action: "trace",
        idempotencyKey: "trace:before-period",
        planSlug: "free",
        planSource: "free-fallback",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        includedCredits: 20_000,
        overageAllowed: false,
      }).pipe(Effect.provide(layer)),
    )

    expect(duplicate).toMatchObject({
      organizationId: ORGANIZATION_ID,
      consumedCredits: 0,
    })
  })

  it("allows the same idempotency key to be reused in a later billing period", async () => {
    const { layer, eventsByPeriodAndIdempotencyKey } = createLayer()
    const nextPeriodStart = new Date("2026-02-01T00:00:00.000Z")
    const nextPeriodEnd = new Date("2026-03-01T00:00:00.000Z")

    await Effect.runPromise(
      recordUsageEventUseCase({
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        action: "trace",
        idempotencyKey: "trace:reused",
        planSlug: "free",
        planSource: "free-fallback",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        includedCredits: 20_000,
        overageAllowed: false,
      }).pipe(Effect.provide(layer)),
    )

    const nextPeriod = await Effect.runPromise(
      recordUsageEventUseCase({
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        action: "trace",
        idempotencyKey: "trace:reused",
        planSlug: "free",
        planSource: "free-fallback",
        periodStart: nextPeriodStart,
        periodEnd: nextPeriodEnd,
        includedCredits: 20_000,
        overageAllowed: false,
      }).pipe(Effect.provide(layer)),
    )

    expect(nextPeriod.consumedCredits).toBe(1)
    expect(eventsByPeriodAndIdempotencyKey.size).toBe(2)
  })
})

describe("checkCreditAvailabilityUseCase", () => {
  it("fails a hard-capped check when the action would exceed the included credits", async () => {
    const { layer, periods } = createLayer()

    await Effect.runPromise(
      periods
        .upsert(
          seedBillingUsagePeriod({
            organizationId: ORGANIZATION_ID,
            planSlug: "free",
            periodStart: PERIOD_START,
            periodEnd: PERIOD_END,
            includedCredits: 20_000,
            consumedCredits: 19_980,
          }),
        )
        .pipe(Effect.provideService(SqlClient, SQL_CLIENT)),
    )

    const allowed = await Effect.runPromise(
      checkCreditAvailabilityUseCase({
        organizationId: ORGANIZATION_ID,
        action: "live-eval-scan",
        planSlug: "free",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        includedCredits: 20_000,
        hardCapped: true,
        priceCents: null,
        spendingLimitCents: null,
      }).pipe(Effect.provide(layer)),
    )

    expect(allowed).toBe(false)
  })

  it("fails a pro spend-cap check when the projected spend would exceed the cap", async () => {
    const { layer, periods } = createLayer()

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

    const allowed = await Effect.runPromise(
      checkCreditAvailabilityUseCase({
        organizationId: ORGANIZATION_ID,
        action: "live-eval-scan",
        planSlug: "pro",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        includedCredits: 100_000,
        hardCapped: false,
        priceCents: 9_900,
        spendingLimitCents: 9_900,
      }).pipe(Effect.provide(layer)),
    )

    expect(allowed).toBe(false)
  })
})
