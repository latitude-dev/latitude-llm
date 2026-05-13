import type { OrganizationId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { OverageReportFailedError } from "../errors.ts"

/**
 * Low-level Stripe billing primitives used by `reportBillingOverageUseCase`.
 *
 * The port intentionally does not encode policy (e.g. "auto-attach the overage
 * price item if missing") — that decision lives in the domain use-case so the
 * Postgres / Stripe adapter only owns transport.
 */
export interface CheckOverageItemInput {
  readonly organizationId: OrganizationId
  readonly stripeSubscriptionId: string
}

export interface RecordOverageMeterEventInput {
  readonly organizationId: OrganizationId
  readonly stripeCustomerId: string
  readonly periodStart: Date
  readonly periodEnd: Date
  /**
   * Incremental credits to add to the Stripe meter for this call. Sent as the
   * meter event's `value`. Always equals `cumulativeOverageCredits - reportedOverageCredits`
   * at the time the worker decides to report.
   */
  readonly overageCreditsToReport: number
  /**
   * Cumulative `overageCredits` observed when the report was enqueued. Embedded
   * in the meter event identifier so that retries with this same snapshot
   * deduplicate at Stripe — even if `reportedOverageCredits` has not been
   * advanced yet on the Latitude side.
   */
  readonly cumulativeOverageCredits: number
}

export class StripeBillingProvider extends Context.Service<
  StripeBillingProvider,
  {
    /**
     * `true` when the Stripe billing provider is wired with the secret key,
     * the overage price id, and the meter event name. `false` means the
     * provider is intentionally skipped (e.g. preview environments).
     */
    isConfigured: () => Effect.Effect<boolean>

    hasOveragePriceItem: (input: CheckOverageItemInput) => Effect.Effect<boolean, OverageReportFailedError>

    attachOveragePriceItem: (input: CheckOverageItemInput) => Effect.Effect<void, OverageReportFailedError>

    recordOverageMeterEvent: (input: RecordOverageMeterEventInput) => Effect.Effect<void, OverageReportFailedError>
  }
>()("@domain/billing/StripeBillingProvider") {}
