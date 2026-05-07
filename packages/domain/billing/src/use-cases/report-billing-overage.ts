import type { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import type { OverageReportFailedError } from "../errors.ts"
import { StripeBillingProvider } from "../ports/stripe-billing-provider.ts"

export interface ReportBillingOverageInput {
  readonly organizationId: OrganizationId
  readonly stripeCustomerId: string
  readonly stripeSubscriptionId: string
  readonly periodStart: Date
  readonly periodEnd: Date
  readonly overageCreditsToReport: number
  /** See `RecordOverageMeterEventInput.cumulativeOverageCredits`. */
  readonly cumulativeOverageCredits: number
}

export type ReportBillingOverageResult =
  | { readonly status: "reported" }
  | {
      readonly status: "skipped"
      readonly reason: "provider-not-configured"
    }

export const reportBillingOverageUseCase = Effect.fn("billing.reportOverage")(function* (
  input: ReportBillingOverageInput,
) {
  yield* Effect.annotateCurrentSpan("billing.organizationId", input.organizationId)

  const provider = yield* StripeBillingProvider
  if (!(yield* provider.isConfigured())) {
    return { status: "skipped", reason: "provider-not-configured" } satisfies ReportBillingOverageResult
  }

  if (
    !(yield* provider.hasOveragePriceItem({
      organizationId: input.organizationId,
      stripeSubscriptionId: input.stripeSubscriptionId,
    }))
  ) {
    yield* provider.attachOveragePriceItem({
      organizationId: input.organizationId,
      stripeSubscriptionId: input.stripeSubscriptionId,
    })
  }

  yield* provider.recordOverageMeterEvent({
    organizationId: input.organizationId,
    stripeCustomerId: input.stripeCustomerId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    overageCreditsToReport: input.overageCreditsToReport,
    cumulativeOverageCredits: input.cumulativeOverageCredits,
  })

  return { status: "reported" } satisfies ReportBillingOverageResult
}) satisfies (
  input: ReportBillingOverageInput,
) => Effect.Effect<ReportBillingOverageResult, OverageReportFailedError, StripeBillingProvider>
