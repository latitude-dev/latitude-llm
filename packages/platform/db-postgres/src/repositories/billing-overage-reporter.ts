import {
  BillingOverageReporter,
  OverageReportFailedError,
  PRO_PLAN_CONFIG,
  type ReportBillingOverageResult,
} from "@domain/billing"
import { SqlClient, type SqlClientShape } from "@domain/shared"
import { parseEnvOptional } from "@platform/env"
import { and, desc, eq, inArray } from "drizzle-orm"
import { Effect, Layer } from "effect"
import Stripe from "stripe"
import type { Operator } from "../client.ts"
import { subscriptions } from "../schema/better-auth.ts"

export const BillingOverageReporterLive = Layer.effect(
  BillingOverageReporter,
  Effect.sync(() => {
    const stripeSecretKey = Effect.runSync(parseEnvOptional("LAT_STRIPE_SECRET_KEY", "string"))
    const proOveragePriceId = Effect.runSync(parseEnvOptional("LAT_STRIPE_PRO_OVERAGE_PRICE_ID", "string"))
    const proOverageMeterEventName = Effect.runSync(
      parseEnvOptional("LAT_STRIPE_PRO_OVERAGE_METER_EVENT_NAME", "string"),
    )
    const stripeClient = stripeSecretKey
      ? new Stripe(stripeSecretKey, {
          apiVersion: "2026-04-22.dahlia",
        })
      : null

    return {
      reportOverage: (input) =>
        Effect.gen(function* () {
          if (!stripeClient || !proOveragePriceId || !proOverageMeterEventName) {
            return {
              status: "skipped",
              reason: "stripe-not-configured",
            } satisfies ReportBillingOverageResult
          }

          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [subscription] = yield* sqlClient
            .query((db) =>
              db
                .select({
                  stripeCustomerId: subscriptions.stripeCustomerId,
                  stripeSubscriptionId: subscriptions.stripeSubscriptionId,
                })
                .from(subscriptions)
                .where(
                  and(
                    eq(subscriptions.referenceId, input.organizationId),
                    inArray(subscriptions.status, ["active", "trialing"]),
                    eq(subscriptions.plan, PRO_PLAN_CONFIG.slug),
                  ),
                )
                .orderBy(desc(subscriptions.periodEnd))
                .limit(1),
            )
            .pipe(
              Effect.mapError(
                (cause) =>
                  new OverageReportFailedError({
                    organizationId: input.organizationId,
                    cause,
                  }),
              ),
            )

          if (!subscription?.stripeSubscriptionId || !subscription.stripeCustomerId) {
            return {
              status: "skipped",
              reason: "subscription-not-found",
            } satisfies ReportBillingOverageResult
          }

          const stripeSubscriptionId = subscription.stripeSubscriptionId
          const stripeCustomerId = subscription.stripeCustomerId

          const stripeSubscription = yield* Effect.tryPromise({
            try: () => stripeClient.subscriptions.retrieve(stripeSubscriptionId),
            catch: (cause) =>
              new OverageReportFailedError({
                organizationId: input.organizationId,
                cause,
              }),
          })

          if (!stripeSubscription.items.data.some((item) => item.price.id === proOveragePriceId)) {
            yield* Effect.tryPromise({
              try: () =>
                stripeClient.subscriptionItems.create({
                  subscription: stripeSubscription.id,
                  price: proOveragePriceId,
                }),
              catch: (cause) =>
                new OverageReportFailedError({
                  organizationId: input.organizationId,
                  cause,
                }),
            })
          }

          yield* Effect.tryPromise({
            try: () =>
              stripeClient.billing.meterEvents.create({
                event_name: proOverageMeterEventName,
                identifier: `${input.organizationId}:${input.periodStart.toISOString()}:${input.periodEnd.toISOString()}:${input.overageCreditsToReport}`,
                payload: {
                  stripe_customer_id: stripeCustomerId,
                  value: String(input.overageCreditsToReport),
                },
                timestamp: Math.floor(Date.now() / 1000),
              }),
            catch: (cause) =>
              new OverageReportFailedError({
                organizationId: input.organizationId,
                cause,
              }),
          })

          return { status: "reported" } satisfies ReportBillingOverageResult
        }),
    }
  }),
)
