import {
  type CheckOverageItemInput,
  OverageReportFailedError,
  type RecordOverageMeterEventInput,
  StripeBillingProvider,
} from "@domain/billing"
import { parseEnvOptional } from "@platform/env"
import { Effect, Layer } from "effect"
import Stripe from "stripe"

export const StripeBillingProviderLive = Layer.effect(
  StripeBillingProvider,
  Effect.all({
    stripeSecretKey: parseEnvOptional("LAT_STRIPE_SECRET_KEY", "string"),
    proOveragePriceId: parseEnvOptional("LAT_STRIPE_PRO_OVERAGE_PRICE_ID", "string"),
    proOverageMeterEventName: parseEnvOptional("LAT_STRIPE_PRO_OVERAGE_METER_EVENT_NAME", "string"),
  }).pipe(
    Effect.map(({ stripeSecretKey, proOveragePriceId, proOverageMeterEventName }) => {
      const stripeClient = stripeSecretKey
        ? new Stripe(stripeSecretKey, {
            apiVersion: "2026-04-22.dahlia",
          })
        : null

      const configured =
        stripeClient !== null && proOveragePriceId !== undefined && proOverageMeterEventName !== undefined

      return {
        isConfigured: () => Effect.succeed(configured),

        hasOveragePriceItem: Effect.fn("dbPostgres.stripeBilling.hasOveragePriceItem")(function* (
          input: CheckOverageItemInput,
        ) {
          if (!stripeClient || !proOveragePriceId) return false
          const subscription = yield* Effect.tryPromise({
            try: () => stripeClient.subscriptions.retrieve(input.stripeSubscriptionId),
            catch: (cause) =>
              new OverageReportFailedError({
                organizationId: input.organizationId,
                cause,
              }),
          })

          return subscription.items.data.some((item) => item.price.id === proOveragePriceId)
        }),

        attachOveragePriceItem: Effect.fn("dbPostgres.stripeBilling.attachOveragePriceItem")(function* (
          input: CheckOverageItemInput,
        ) {
          if (!stripeClient || !proOveragePriceId) return
          yield* Effect.tryPromise({
            try: () =>
              stripeClient.subscriptionItems.create({
                subscription: input.stripeSubscriptionId,
                price: proOveragePriceId,
              }),
            catch: (cause) =>
              new OverageReportFailedError({
                organizationId: input.organizationId,
                cause,
              }),
          })
        }),

        recordOverageMeterEvent: Effect.fn("dbPostgres.stripeBilling.recordOverageMeterEvent")(function* (
          input: RecordOverageMeterEventInput,
        ) {
          if (!stripeClient || !proOverageMeterEventName) return
          yield* Effect.tryPromise({
            try: () =>
              stripeClient.billing.meterEvents.create({
                event_name: proOverageMeterEventName,
                // Identifier embeds `cumulativeOverageCredits` (the snapshot
                // observed when the report was enqueued), NOT the delta value
                // sent to Stripe. This guarantees that bullmq retries — which
                // re-deliver the same payload — produce the same identifier
                // and Stripe deduplicates them, even when usage has accrued
                // between attempts. (Using the delta in the identifier could
                // cause Stripe to accept overlapping events on retry-after-
                // partial-failure with concurrent accrual, double-counting
                // the credits in the overlap.)
                identifier: `${input.organizationId}:${input.periodStart.toISOString()}:${input.periodEnd.toISOString()}:${input.cumulativeOverageCredits}`,
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
        }),
      }
    }),
  ),
)
