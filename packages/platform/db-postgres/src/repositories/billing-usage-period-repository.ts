import {
  type BillingUsagePeriod,
  BillingUsagePeriodRepository,
  CENT_TO_MICROCENTS,
  calculateOverageAmountMicrocents,
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
import { and, eq, gt, lte, sql } from "drizzle-orm"
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
  overageAmountMicrocents: row.overageAmountMicrocents,
  updatedAt: row.updatedAt,
})

const excludedPlanSlug = sql.raw("excluded.plan_slug")
const excludedConsumedCredits = sql.raw("excluded.consumed_credits")
const excludedIncludedCredits = sql.raw("excluded.included_credits")

const PRO_OVERAGE_MICRO_NUMERATOR = PRO_PLAN_CONFIG.overagePriceCentsPerUnit * CENT_TO_MICROCENTS
const PRO_OVERAGE_MICRO_DENOMINATOR = PRO_PLAN_CONFIG.overageCreditsPerUnit

export const BillingUsagePeriodRepositoryLive = Layer.effect(
  BillingUsagePeriodRepository,
  Effect.gen(function* () {
    return {
      upsert: (period: BillingUsagePeriod) =>
        Effect.gen(function* () {
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
                overageAmountMicrocents: period.overageAmountMicrocents,
                updatedAt: period.updatedAt,
              })
              .onConflictDoUpdate({
                target: [
                  billingUsagePeriods.organizationId,
                  billingUsagePeriods.periodStart,
                  billingUsagePeriods.periodEnd,
                ],
                set: {
                  planSlug: period.planSlug,
                  includedCredits: period.includedCredits,
                  consumedCredits: period.consumedCredits,
                  overageCredits: period.overageCredits,
                  reportedOverageCredits: period.reportedOverageCredits,
                  overageAmountMicrocents: period.overageAmountMicrocents,
                  updatedAt: new Date(),
                },
              }),
          )
        }),

      appendCreditsForBillingPeriod: (input) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

          const initialOverageCredits = Math.max(0, input.creditsDelta - input.persistedIncludedCredits)
          const initialOverageAmountMicrocents = calculateOverageAmountMicrocents(input.planSlug, initialOverageCredits)

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
                overageAmountMicrocents: initialOverageAmountMicrocents,
                updatedAt: new Date(),
              })
              .onConflictDoUpdate({
                target: [
                  billingUsagePeriods.organizationId,
                  billingUsagePeriods.periodStart,
                  billingUsagePeriods.periodEnd,
                ],
                set: {
                  planSlug: excludedPlanSlug,
                  includedCredits: excludedIncludedCredits,
                  consumedCredits: sql`${billingUsagePeriods.consumedCredits} + ${excludedConsumedCredits}`,
                  overageCredits: sql`GREATEST(0::bigint, (${billingUsagePeriods.consumedCredits} + ${excludedConsumedCredits} - ${excludedIncludedCredits})::bigint)`,
                  overageAmountMicrocents: sql`
CASE
  WHEN ${excludedPlanSlug} = ${"pro"}
  THEN FLOOR(
    (
      GREATEST(0::bigint, (${billingUsagePeriods.consumedCredits} + ${excludedConsumedCredits} - ${excludedIncludedCredits})::bigint)::numeric
      * (${PRO_OVERAGE_MICRO_NUMERATOR})::numeric
    )
      / (${PRO_OVERAGE_MICRO_DENOMINATOR})::numeric
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

      findByPeriod: ({ organizationId, periodStart, periodEnd }) =>
        Effect.gen(function* () {
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

      findCurrent: (_organizationId: OrganizationIdType) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const now = new Date()
          const [result] = yield* sqlClient.query((db, orgId) =>
            db
              .select()
              .from(billingUsagePeriods)
              .where(
                and(
                  eq(billingUsagePeriods.organizationId, orgId),
                  lte(billingUsagePeriods.periodStart, now),
                  gt(billingUsagePeriods.periodEnd, now),
                ),
              )
              .orderBy(billingUsagePeriods.periodStart)
              .limit(1),
          )
          return result ? toDomain(result) : null
        }),
    }
  }),
)
