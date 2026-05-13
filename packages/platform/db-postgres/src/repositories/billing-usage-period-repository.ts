import {
  type BillingUsagePeriod,
  BillingUsagePeriodRepository,
  CENT_TO_MILLS,
  calculateOverageAmountMills,
  PRO_PLAN_CONFIG,
} from "@domain/billing"
import {
  generateId,
  OrganizationId,
  type OrganizationId as OrganizationIdType,
  RepositoryError,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { and, eq, gt, lt, lte, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { billingUsagePeriods } from "../schema/billing.ts"

const toDomain = (row: typeof billingUsagePeriods.$inferSelect): BillingUsagePeriod => ({
  organizationId: OrganizationId(row.organizationId),
  planSlug: row.planSlug as BillingUsagePeriod["planSlug"],
  periodStart: row.periodStart,
  periodEnd: row.periodEnd,
  includedCredits: row.includedCredits,
  consumedCredits: row.consumedCredits,
  overageCredits: row.overageCredits,
  reportedOverageCredits: row.reportedOverageCredits,
  overageAmountMills: row.overageAmountMills,
  updatedAt: row.updatedAt,
})

const excludedPlanSlug = sql.raw("excluded.plan_slug")
const excludedConsumedCredits = sql.raw("excluded.consumed_credits")
const excludedIncludedCredits = sql.raw("excluded.included_credits")

const PRO_OVERAGE_MILLS_NUMERATOR = PRO_PLAN_CONFIG.overagePriceCentsPerUnit * CENT_TO_MILLS
const PRO_OVERAGE_MILLS_DENOMINATOR = PRO_PLAN_CONFIG.overageCreditsPerUnit

type AppendCreditsInput = Parameters<
  (typeof BillingUsagePeriodRepository)["Service"]["appendCreditsForBillingPeriod"]
>[0]
type FindPeriodInput = Parameters<(typeof BillingUsagePeriodRepository)["Service"]["findOptionalByPeriod"]>[0]
type AdvanceReportedOverageInput = Parameters<
  (typeof BillingUsagePeriodRepository)["Service"]["advanceReportedOverageCredits"]
>[0]

export const BillingUsagePeriodRepositoryLive = Layer.succeed(BillingUsagePeriodRepository, {
  upsert: Effect.fn("dbPostgres.billingUsagePeriod.upsert")(function* (period: BillingUsagePeriod) {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
    yield* sqlClient.query((db) =>
      db
        .insert(billingUsagePeriods)
        .values({
          id: generateId(),
          organizationId: period.organizationId,
          planSlug: period.planSlug,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          includedCredits: period.includedCredits,
          consumedCredits: period.consumedCredits,
          overageCredits: period.overageCredits,
          reportedOverageCredits: period.reportedOverageCredits,
          overageAmountMills: period.overageAmountMills,
          updatedAt: period.updatedAt,
        })
        .onConflictDoUpdate({
          target: [billingUsagePeriods.organizationId, billingUsagePeriods.periodStart, billingUsagePeriods.periodEnd],
          set: {
            planSlug: period.planSlug,
            includedCredits: period.includedCredits,
            consumedCredits: period.consumedCredits,
            overageCredits: period.overageCredits,
            reportedOverageCredits: period.reportedOverageCredits,
            overageAmountMills: period.overageAmountMills,
            updatedAt: new Date(),
          },
        }),
    )
  }),
  appendCreditsForBillingPeriod: Effect.fn("dbPostgres.billingUsagePeriod.appendCreditsForBillingPeriod")(function* (
    input: AppendCreditsInput,
  ) {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    const initialOverageCredits = Math.max(0, input.creditsDelta - input.persistedIncludedCredits)
    const initialOverageAmountMills = calculateOverageAmountMills(input.planSlug, initialOverageCredits)

    const [result] = yield* sqlClient.query((db) =>
      db
        .insert(billingUsagePeriods)
        .values({
          id: generateId(),
          organizationId: input.organizationId,
          planSlug: input.planSlug,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          includedCredits: input.persistedIncludedCredits,
          consumedCredits: input.creditsDelta,
          overageCredits: initialOverageCredits,
          reportedOverageCredits: 0,
          overageAmountMills: initialOverageAmountMills,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [billingUsagePeriods.organizationId, billingUsagePeriods.periodStart, billingUsagePeriods.periodEnd],
          set: {
            planSlug: excludedPlanSlug,
            includedCredits: excludedIncludedCredits,
            consumedCredits: sql`${billingUsagePeriods.consumedCredits} + ${excludedConsumedCredits}`,
            overageCredits: sql`GREATEST(0::bigint, (${billingUsagePeriods.consumedCredits} + ${excludedConsumedCredits} - ${excludedIncludedCredits})::bigint)`,
            overageAmountMills: sql`
CASE
  WHEN ${excludedPlanSlug} = ${"pro"}
  THEN FLOOR(
    (
      GREATEST(0::bigint, (${billingUsagePeriods.consumedCredits} + ${excludedConsumedCredits} - ${excludedIncludedCredits})::bigint)::numeric
      * (${PRO_OVERAGE_MILLS_NUMERATOR})::numeric
    )
      / (${PRO_OVERAGE_MILLS_DENOMINATOR})::numeric
  )::bigint
ELSE 0::bigint
END`,
            reportedOverageCredits: sql`${billingUsagePeriods.reportedOverageCredits}`,
            updatedAt: new Date(),
          },
        })
        .returning(),
    )

    if (result === undefined) {
      return yield* Effect.fail(
        new RepositoryError({
          cause: new Error("appendCreditsForBillingPeriod expected a persisted row"),
          operation: "billingUsagePeriods.appendCreditsForBillingPeriod",
        }),
      )
    }

    return toDomain(result)
  }),
  findOptionalByPeriod: Effect.fn("dbPostgres.billingUsagePeriod.findOptionalByPeriod")(function* (
    input: FindPeriodInput,
  ) {
    const { organizationId, periodStart, periodEnd } = input
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
    const [result] = yield* sqlClient.query((db) =>
      db
        .select()
        .from(billingUsagePeriods)
        .where(
          and(
            eq(billingUsagePeriods.organizationId, organizationId),
            eq(billingUsagePeriods.periodStart, periodStart),
            eq(billingUsagePeriods.periodEnd, periodEnd),
          ),
        )
        .limit(1),
    )

    return result ? toDomain(result) : null
  }),
  advanceReportedOverageCredits: Effect.fn("dbPostgres.billingUsagePeriod.advanceReportedOverageCredits")(function* (
    input: AdvanceReportedOverageInput,
  ) {
    const { organizationId, periodStart, periodEnd, reportedOverageCredits } = input
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
    // Forward-only CAS: only advance when the new value is strictly greater
    // than the current `reportedOverageCredits`. Two concurrent overage
    // workers (or an out-of-order retry) could otherwise call advance with
    // different snapshot values and the loser would silently roll the
    // counter backwards, causing already-reported credits to be reported
    // again to Stripe on the next cycle.
    const [result] = yield* sqlClient.query((db) =>
      db
        .update(billingUsagePeriods)
        .set({
          reportedOverageCredits,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(billingUsagePeriods.organizationId, organizationId),
            eq(billingUsagePeriods.periodStart, periodStart),
            eq(billingUsagePeriods.periodEnd, periodEnd),
            lt(billingUsagePeriods.reportedOverageCredits, reportedOverageCredits),
          ),
        )
        .returning(),
    )

    return result ? toDomain(result) : null
  }),
  findOptionalCurrent: Effect.fn("dbPostgres.billingUsagePeriod.findOptionalCurrent")(function* (
    organizationId: OrganizationIdType,
  ) {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
    const now = new Date()
    const [result] = yield* sqlClient.query((db) =>
      db
        .select()
        .from(billingUsagePeriods)
        .where(
          and(
            eq(billingUsagePeriods.organizationId, organizationId),
            lte(billingUsagePeriods.periodStart, now),
            gt(billingUsagePeriods.periodEnd, now),
          ),
        )
        .orderBy(billingUsagePeriods.periodStart)
        .limit(1),
    )

    return result ? toDomain(result) : null
  }),
})
