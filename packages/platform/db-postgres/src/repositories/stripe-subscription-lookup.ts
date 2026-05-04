import { StripeSubscriptionLookup } from "@domain/billing"
import { type OrganizationId as OrganizationIdType, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, eq, inArray } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { subscriptions } from "../schema/better-auth.ts"

export const StripeSubscriptionLookupLive = Layer.effect(
  StripeSubscriptionLookup,
  Effect.gen(function* () {
    return {
      findActiveByOrganizationId: (organizationId: OrganizationIdType) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [result] = yield* sqlClient.query((db) =>
            db
              .select({
                plan: subscriptions.plan,
                status: subscriptions.status,
                periodStart: subscriptions.periodStart,
                periodEnd: subscriptions.periodEnd,
              })
              .from(subscriptions)
              .where(
                and(
                  eq(subscriptions.referenceId, organizationId),
                  inArray(subscriptions.status, ["active", "trialing"]),
                ),
              )
              .orderBy(subscriptions.periodEnd)
              .limit(1),
          )

          if (!result) return null

          return {
            plan: result.plan,
            status: result.status,
            periodStart: result.periodStart,
            periodEnd: result.periodEnd,
          }
        }),
    }
  }),
)
