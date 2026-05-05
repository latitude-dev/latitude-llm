import type { OrganizationId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { OverageReportFailedError } from "../errors.ts"

export interface ReportBillingOverageInput {
  readonly organizationId: OrganizationId
  readonly stripeCustomerId: string
  readonly stripeSubscriptionId: string
  readonly periodStart: Date
  readonly periodEnd: Date
  readonly overageCreditsToReport: number
}

export type ReportBillingOverageResult =
  | { readonly status: "reported" }
  | {
      readonly status: "skipped"
      readonly reason: "provider-not-configured"
    }

export class BillingOverageReporter extends Context.Service<
  BillingOverageReporter,
  {
    reportOverage: (
      input: ReportBillingOverageInput,
    ) => Effect.Effect<ReportBillingOverageResult, OverageReportFailedError>
  }
>()("@domain/billing/BillingOverageReporter") {}
