import {
  authorizeBillableAction,
  BillingOverrideRepository,
  BillingSpendReservation,
  BillingUsagePeriodRepository,
  StripeSubscriptionLookup,
} from "@domain/billing"
import {
  createFakeBillingOverrideRepository,
  createFakeBillingSpendReservation,
  createFakeBillingUsagePeriodRepository,
  createFakeStripeSubscriptionLookup,
  seedBillingUsagePeriod,
} from "@domain/billing/testing"
import { OrganizationId, SettingsReader, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const ORGANIZATION_ID = OrganizationId("o".repeat(24))
const PERIOD_START = new Date("2026-01-01T00:00:00.000Z")
const PERIOD_END = new Date("2026-02-01T00:00:00.000Z")
const SQL_CLIENT = createFakeSqlClient({ organizationId: ORGANIZATION_ID })

const PRO_SUBSCRIPTION = {
  plan: "pro",
  status: "active",
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  stripeCustomerId: "cus_test",
  stripeSubscriptionId: "sub_test",
} as const

const createLayer = (input?: {
  readonly periods?: ReturnType<typeof createFakeBillingUsagePeriodRepository>["repository"] | undefined
  readonly reservation?: ReturnType<typeof createFakeBillingSpendReservation>["reservation"] | undefined
  readonly subscription?: typeof PRO_SUBSCRIPTION | null | undefined
  readonly organizationSettings?: { readonly billing?: { readonly spendingLimitCents?: number } } | null
}) => {
  const { repository: billingOverrideRepository } = createFakeBillingOverrideRepository()
  const { repository: periods } = createFakeBillingUsagePeriodRepository()
  const { reservation } = createFakeBillingSpendReservation()
  const { service: stripeSubscriptionLookup, subscriptionsByOrganizationId } = createFakeStripeSubscriptionLookup()

  if (input?.subscription) {
    subscriptionsByOrganizationId.set(ORGANIZATION_ID, input.subscription)
  }

  return Layer.mergeAll(
    Layer.succeed(BillingOverrideRepository, billingOverrideRepository),
    Layer.succeed(BillingUsagePeriodRepository, input?.periods ?? periods),
    Layer.succeed(BillingSpendReservation, input?.reservation ?? reservation),
    Layer.succeed(StripeSubscriptionLookup, stripeSubscriptionLookup),
    Layer.succeed(SqlClient, SQL_CLIENT),
    Layer.succeed(SettingsReader, {
      getOrganizationSettings: () => Effect.succeed(input?.organizationSettings ?? null),
      getProjectSettings: () => Effect.die("authorizeBillableAction tests do not read project settings"),
    }),
  )
}

describe("authorizeBillableAction", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("allows a free-plan action while credits remain", async () => {
    const result = await Effect.runPromise(
      authorizeBillableAction({
        organizationId: ORGANIZATION_ID,
        action: "live-eval-scan",
        skipIfBlocked: true,
        idempotencyKey: "live-eval:1",
      }).pipe(Effect.provide(createLayer())),
    )

    expect(result).toMatchObject({
      allowed: true,
      period: null,
      context: {
        planSlug: "free",
        planSource: "free-fallback",
        includedCredits: 20_000,
      },
    })
  })

  it("blocks a hard-capped plan once the action would exceed remaining credits", async () => {
    const { repository: periods } = createFakeBillingUsagePeriodRepository()

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

    const result = await Effect.runPromise(
      authorizeBillableAction({
        organizationId: ORGANIZATION_ID,
        action: "live-eval-scan",
        skipIfBlocked: true,
        idempotencyKey: "live-eval:2",
      }).pipe(Effect.provide(createLayer({ periods }))),
    )

    expect(result.allowed).toBe(false)
    expect(result.period?.consumedCredits).toBe(19_980)
  })

  it("blocks a pro action when the snapshot projection already exceeds the spending cap", async () => {
    const { repository: periods } = createFakeBillingUsagePeriodRepository()

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
      authorizeBillableAction({
        organizationId: ORGANIZATION_ID,
        action: "live-eval-scan",
        skipIfBlocked: true,
        idempotencyKey: "live-eval:3",
      }).pipe(
        Effect.provide(
          createLayer({
            periods,
            subscription: PRO_SUBSCRIPTION,
            organizationSettings: { billing: { spendingLimitCents: 9_900 } },
          }),
        ),
      ),
    )

    expect(result.allowed).toBe(false)
    expect(result.context.planSlug).toBe("pro")
  })

  it("treats repeated authorization retries for the same idempotency key as a single reservation", async () => {
    const { reservation, counters } = createFakeBillingSpendReservation("atomic")
    const { repository: periods } = createFakeBillingUsagePeriodRepository()

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

    const run = () =>
      authorizeBillableAction({
        organizationId: ORGANIZATION_ID,
        action: "live-eval-scan",
        skipIfBlocked: true,
        idempotencyKey: "live-eval:retry",
      }).pipe(
        Effect.provide(
          createLayer({
            periods,
            reservation,
            subscription: PRO_SUBSCRIPTION,
            organizationSettings: { billing: { spendingLimitCents: 9_930 } },
          }),
        ),
      )

    const first = await Effect.runPromise(run())
    const second = await Effect.runPromise(run())

    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(true)
    expect(counters.size).toBe(1)
    expect([...counters.values()][0]?.reservedCredits).toBe(100_030)
  })

  it("routes hard-capped free-plan authorization through the reservation port", async () => {
    const { reservation, counters } = createFakeBillingSpendReservation("atomic")

    const result = await Effect.runPromise(
      authorizeBillableAction({
        organizationId: ORGANIZATION_ID,
        action: "live-eval-scan",
        skipIfBlocked: true,
        idempotencyKey: "live-eval:free-reservation",
      }).pipe(Effect.provide(createLayer({ reservation }))),
    )

    expect(result.allowed).toBe(true)
    expect(counters.size).toBe(1)
    expect([...counters.values()][0]?.reservedCredits).toBe(30)
  })
})
