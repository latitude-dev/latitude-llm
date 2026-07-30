import { StripeSubscriptionLookup, type StripeSubscriptionRow } from "@domain/billing"
import { type OrganizationId as OrganizationIdType, SqlClient, type SqlClientShape } from "@domain/shared"
import { parseEnvOptional } from "@platform/env"
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm"
import { Effect, Layer, Result } from "effect"
import Stripe from "stripe"
import type { Operator } from "../client.ts"
import { subscriptions } from "../schema/better-auth.ts"
import { isSubscriptionPeriodStale, pickLicensedSubscriptionPeriod } from "./stripe-subscription-period.ts"

const STRIPE_PERIOD_REFRESH_TIMEOUT_MS = 3_000

const toRow = (result: {
  plan: string
  status: string | null
  periodStart: Date | null
  periodEnd: Date | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
}): StripeSubscriptionRow => ({
  plan: result.plan,
  status: result.status,
  periodStart: result.periodStart,
  periodEnd: result.periodEnd,
  stripeCustomerId: result.stripeCustomerId,
  stripeSubscriptionId: result.stripeSubscriptionId,
})

export const StripeSubscriptionLookupLive = Layer.effect(
  StripeSubscriptionLookup,
  Effect.gen(function* () {
    const stripeSecretKey = yield* parseEnvOptional("LAT_STRIPE_SECRET_KEY", "string")
    const stripeClient = stripeSecretKey
      ? new Stripe(stripeSecretKey, {
          apiVersion: "2026-05-27.dahlia",
          timeout: STRIPE_PERIOD_REFRESH_TIMEOUT_MS,
          maxNetworkRetries: 0,
        })
      : null

    const findOptionalActiveByOrganizationId = Effect.fn(
      "dbPostgres.stripeSubscription.findOptionalActiveByOrganizationId",
    )(function* (organizationId: OrganizationIdType) {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const [result] = yield* sqlClient.query((db) =>
        db
          .select({
            id: subscriptions.id,
            plan: subscriptions.plan,
            status: subscriptions.status,
            periodStart: subscriptions.periodStart,
            periodEnd: subscriptions.periodEnd,
            stripeCustomerId: subscriptions.stripeCustomerId,
            stripeSubscriptionId: subscriptions.stripeSubscriptionId,
          })
          .from(subscriptions)
          .where(
            and(eq(subscriptions.referenceId, organizationId), inArray(subscriptions.status, ["active", "trialing"])),
          )
          .orderBy(desc(subscriptions.periodEnd))
          .limit(1),
      )

      if (!result) return null

      const row = toRow(result)
      if (
        !stripeClient ||
        result.stripeSubscriptionId === null ||
        !isSubscriptionPeriodStale(result.periodEnd, new Date())
      ) {
        return row
      }

      const stripeSubscriptionId = result.stripeSubscriptionId

      yield* Effect.annotateCurrentSpan({
        "billing.alert": "stale_subscription_period",
        "billing.stripe_subscription_id": stripeSubscriptionId,
      })

      const retrieveResult = yield* Effect.result(
        Effect.tryPromise({
          try: () => stripeClient.subscriptions.retrieve(stripeSubscriptionId),
          catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
        }).pipe(
          Effect.timeoutOrElse({
            duration: STRIPE_PERIOD_REFRESH_TIMEOUT_MS,
            orElse: () => Effect.fail(new Error("Stripe subscription period refresh timed out")),
          }),
        ),
      )

      if (Result.isFailure(retrieveResult)) {
        yield* Effect.annotateCurrentSpan({
          "billing.alert": "stale_subscription_period_refresh_failed",
          "billing.stripe_subscription_id": stripeSubscriptionId,
          "error.message": retrieveResult.failure.message,
        })
        return row
      }

      const refreshed = pickLicensedSubscriptionPeriod(retrieveResult.success.items.data)
      if (refreshed === null) return row
      if (result.periodEnd !== null && refreshed.periodEnd.getTime() <= result.periodEnd.getTime()) {
        return row
      }

      const [updated] = yield* sqlClient.query((db) =>
        db
          .update(subscriptions)
          .set({
            periodStart: refreshed.periodStart,
            periodEnd: refreshed.periodEnd,
          })
          .where(
            and(
              eq(subscriptions.id, result.id),
              or(isNull(subscriptions.periodEnd), lt(subscriptions.periodEnd, refreshed.periodEnd)),
            ),
          )
          .returning({
            plan: subscriptions.plan,
            status: subscriptions.status,
            periodStart: subscriptions.periodStart,
            periodEnd: subscriptions.periodEnd,
            stripeCustomerId: subscriptions.stripeCustomerId,
            stripeSubscriptionId: subscriptions.stripeSubscriptionId,
          }),
      )

      if (!updated) {
        const [current] = yield* sqlClient.query((db) =>
          db
            .select({
              plan: subscriptions.plan,
              status: subscriptions.status,
              periodStart: subscriptions.periodStart,
              periodEnd: subscriptions.periodEnd,
              stripeCustomerId: subscriptions.stripeCustomerId,
              stripeSubscriptionId: subscriptions.stripeSubscriptionId,
            })
            .from(subscriptions)
            .where(eq(subscriptions.id, result.id))
            .limit(1),
        )
        return current ? toRow(current) : row
      }

      yield* Effect.annotateCurrentSpan({
        "billing.subscription_period_refreshed": "true",
        "billing.period_start": refreshed.periodStart.toISOString(),
        "billing.period_end": refreshed.periodEnd.toISOString(),
      })

      return toRow(updated)
    })

    return {
      findOptionalActiveByOrganizationId,
    }
  }),
)
