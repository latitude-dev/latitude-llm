import type { OrganizationId, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { OverageReportFailedError } from "../errors.ts"

export interface ReportBillingOverageInput {
  readonly organizationId: OrganizationId
  readonly periodStart: Date
  readonly periodEnd: Date
  readonly overageCreditsToReport: number
}

export type ReportBillingOverageResult =
  | { readonly status: "reported" }
  | {
      readonly status: "skipped"
      readonly reason: "stripe-not-configured" | "subscription-not-found"
    }

export class BillingOverageReporter extends Context.Service<
  BillingOverageReporter,
  {
    reportOverage: (
      input: ReportBillingOverageInput,
    ) => Effect.Effect<ReportBillingOverageResult, OverageReportFailedError, SqlClient>
  }
>()("@domain/billing/BillingOverageReporter") {}
