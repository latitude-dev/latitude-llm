import type { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import { BillingUsageEventRepository } from "../ports/billing-usage-event-repository.ts"
import { summarizeBillingUsageBreakdown } from "../usage-breakdown.ts"

export interface GetBillingUsageBreakdownInput {
  readonly organizationId: OrganizationId
  readonly periodStart: Date
  readonly periodEnd: Date
}

/**
 * Where a billing period's credits went, per project and product area. Derived from
 * the usage-event ledger, so it only covers periods inside the ledger's retention
 * window; the period counter in `billing_usage_periods` stays authoritative for totals.
 */
export const getBillingUsageBreakdownUseCase = Effect.fn("billing.getUsageBreakdown")(function* (
  input: GetBillingUsageBreakdownInput,
) {
  const eventRepo = yield* BillingUsageEventRepository
  const rows = yield* eventRepo.summarizeByPeriod(input)
  return summarizeBillingUsageBreakdown(rows)
})
