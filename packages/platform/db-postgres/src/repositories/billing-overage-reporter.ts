import { BillingOverageReporter, OverageReportFailedError, type ReportBillingOverageResult } from "@domain/billing"
import { parseEnvOptional } from "@platform/env"
import { Effect, Layer } from "effect"
import Stripe from "stripe"

export const BillingOverageReporterLive = Layer.effect(
  BillingOverageReporter,
  Effect.gen(function* () {
    const stripeSecretKey = yield* parseEnvOptional("LAT_STRIPE_SECRET_KEY", "string")
    const proOveragePriceId = yield* parseEnvOptional("LAT_STRIPE_PRO_OVERAGE_PRICE_ID", "string")
    const proOverageMeterEventName = yield* parseEnvOptional("LAT_STRIPE_PRO_OVERAGE_METER_EVENT_NAME", "string")
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
              reason: "provider-not-configured",
            } satisfies ReportBillingOverageResult
          }

          const stripeSubscription = yield* Effect.tryPromise({
            try: () => stripeClient.subscriptions.retrieve(input.stripeSubscriptionId),
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
                  stripe_customer_id: input.stripeCustomerId,
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
