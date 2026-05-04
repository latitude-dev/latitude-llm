import {
  BillingUsagePeriodRepository,
  calculateMaxReportableOverageCreditsForCap,
  PRO_PLAN_CONFIG,
  reportBillingOverageUseCase,
  StripeSubscriptionLookup,
} from "@domain/billing"
import { OrganizationId, SettingsReader } from "@domain/shared"
import {
  BillingUsagePeriodRepositoryLive,
  SettingsReaderLive,
  StripeBillingProviderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Data, Effect, Layer } from "effect"
import { getPostgresClient } from "../clients.ts"

const logger = createLogger("workflows-billing-overage")

class BillingOverageActivityError extends Data.TaggedError("BillingOverageActivityError")<{
  readonly cause: unknown
}> {
  readonly httpStatus = 500

  get httpMessage() {
    return "Billing overage activity failed"
  }
}

export type ReportBillingOverageActivityInput = {
  readonly organizationId: string
  readonly periodStart: string
  readonly periodEnd: string
  readonly snapshotOverageCredits: number
}

export type ReportBillingOverageActivityResult =
  | { readonly status: "reported"; readonly reportedOverageCredits: number }
  | {
      readonly status: "skipped"
      readonly reason:
        | "period-not-found"
        | "not-pro-plan"
        | "already-reported"
        | "subscription-not-found"
        | "provider-not-configured"
        | "spending-limit-reached"
    }

const reportBillingOverageEffect = Effect.fn("workflows.billing.reportOverage")(function* (
  input: ReportBillingOverageActivityInput,
) {
  const organizationId = OrganizationId(input.organizationId)
  const periodStart = new Date(input.periodStart)
  const periodEnd = new Date(input.periodEnd)
  const snapshotOverageCredits = input.snapshotOverageCredits
  const periodRepo = yield* BillingUsagePeriodRepository
  const period = yield* periodRepo.findOptionalByPeriod({
    organizationId,
    periodStart,
    periodEnd,
  })

  if (!period) {
    return { status: "skipped", reason: "period-not-found" } satisfies ReportBillingOverageActivityResult
  }

  if (period.planSlug !== PRO_PLAN_CONFIG.slug) {
    return { status: "skipped", reason: "not-pro-plan" } satisfies ReportBillingOverageActivityResult
  }

  const settingsReader = yield* SettingsReader
  const settings = yield* settingsReader.getOrganizationSettings()
  const spendingLimitCents = settings?.billing?.spendingLimitCents ?? null
  const reportableSnapshotOverageCredits =
    spendingLimitCents === null
      ? snapshotOverageCredits
      : Math.min(
          snapshotOverageCredits,
          calculateMaxReportableOverageCreditsForCap(
            period.planSlug,
            period.includedCredits,
            PRO_PLAN_CONFIG.priceCents,
            spendingLimitCents,
          ),
        )

  // Report up to the snapshot captured at enqueue time, capped by the customer
  // spending limit. Using current DB overage would let a replayed workflow pick
  // up additional accrual and send a different Stripe event identifier for
  // credits outside the original job.
  if (period.reportedOverageCredits >= reportableSnapshotOverageCredits) {
    if (snapshotOverageCredits > reportableSnapshotOverageCredits) {
      return { status: "skipped", reason: "spending-limit-reached" } satisfies ReportBillingOverageActivityResult
    }
    return { status: "skipped", reason: "already-reported" } satisfies ReportBillingOverageActivityResult
  }

  const subscriptionLookup = yield* StripeSubscriptionLookup
  const subscription = yield* subscriptionLookup.findOptionalActiveByOrganizationId(organizationId)

  if (!subscription?.stripeSubscriptionId || !subscription.stripeCustomerId) {
    return { status: "skipped", reason: "subscription-not-found" } satisfies ReportBillingOverageActivityResult
  }

  const result = yield* reportBillingOverageUseCase({
    organizationId,
    stripeCustomerId: subscription.stripeCustomerId,
    stripeSubscriptionId: subscription.stripeSubscriptionId,
    periodStart,
    periodEnd,
    overageCreditsToReport: reportableSnapshotOverageCredits - period.reportedOverageCredits,
    cumulativeOverageCredits: reportableSnapshotOverageCredits,
  })

  if (result.status !== "reported") {
    return { status: "skipped", reason: result.reason } satisfies ReportBillingOverageActivityResult
  }

  yield* periodRepo.advanceReportedOverageCredits({
    organizationId,
    periodStart,
    periodEnd,
    reportedOverageCredits: reportableSnapshotOverageCredits,
  })

  return {
    status: "reported",
    reportedOverageCredits: reportableSnapshotOverageCredits,
  } satisfies ReportBillingOverageActivityResult
})

export const reportBillingOverage = (
  input: ReportBillingOverageActivityInput,
): Promise<ReportBillingOverageActivityResult> =>
  Effect.runPromise(
    reportBillingOverageEffect(input).pipe(
      withPostgres(
        Layer.mergeAll(
          BillingUsagePeriodRepositoryLive,
          SettingsReaderLive,
          StripeBillingProviderLive,
          StripeSubscriptionLookupLive,
        ),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      withTracing,
      Effect.tap((result) =>
        Effect.sync(() => {
          if (result.status === "reported") {
            logger.info("Billing overage sync completed", {
              organizationId: input.organizationId,
              periodStart: input.periodStart,
              periodEnd: input.periodEnd,
              reportedOverageCredits: result.reportedOverageCredits,
            })
            return
          }

          logger.info("Billing overage sync skipped", {
            organizationId: input.organizationId,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            reason: result.reason,
          })
        }),
      ),
      Effect.mapError((cause) => new BillingOverageActivityError({ cause })),
    ),
  )
