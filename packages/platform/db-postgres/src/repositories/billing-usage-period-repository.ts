import { type BillingUsagePeriod, BillingUsagePeriodRepository } from "@domain/billing"
import {
  generateId,
  OrganizationId,
  type OrganizationId as OrganizationIdType,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { and, eq, gt, lte } from "drizzle-orm"
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

      findCurrent: (organizationId: OrganizationIdType) =>
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
