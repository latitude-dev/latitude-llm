import { Data } from "effect"

export class UnknownStripePlanError extends Data.TaggedError("UnknownStripePlanError")<{
  readonly planName: string
}> {
  readonly httpStatus = 500
  get httpMessage() {
    return `Unknown Stripe plan name: ${this.planName}`
  }
}

export class NoCreditsRemainingError extends Data.TaggedError("NoCreditsRemainingError")<{
  readonly organizationId: string
  readonly planSlug: string
  readonly action: string
}> {
  readonly httpStatus = 402
  readonly httpMessage = "Billing limit reached for the current billing period"
}

export class UsageEventAlreadyRecordedError extends Data.TaggedError("UsageEventAlreadyRecordedError")<{
  readonly idempotencyKey: string
}> {
  readonly httpStatus = 409
  get httpMessage() {
    return `Usage event already recorded for key: ${this.idempotencyKey}`
  }
}

export class NoSubscriptionFoundError extends Data.TaggedError("NoSubscriptionFoundError")<Record<never, never>> {
  readonly httpStatus = 404
  readonly httpMessage = "No active subscription found for organization"
}

export class OverageReportFailedError extends Data.TaggedError("OverageReportFailedError")<{
  readonly organizationId: string
  readonly cause: unknown
}> {
  readonly httpStatus = 502
  readonly httpMessage = "Failed to report billing overage to Stripe"
}
