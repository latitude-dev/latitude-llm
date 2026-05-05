import type { OrganizationId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { PlanSlug } from "../constants.ts"
import type { BillingUsagePeriod } from "../entities/billing-usage-period.ts"

export interface AppendBillingPeriodCreditsInput {
  readonly organizationId: OrganizationId
  readonly periodStart: Date
  readonly periodEnd: Date
  readonly planSlug: PlanSlug
  readonly persistedIncludedCredits: number
  readonly creditsDelta: number
}

export interface AdvanceReportedOverageCreditsInput {
  readonly organizationId: OrganizationId
  readonly periodStart: Date
  readonly periodEnd: Date
  readonly reportedOverageCredits: number
}

export class BillingUsagePeriodRepository extends Context.Service<
  BillingUsagePeriodRepository,
  {
    upsert: (period: BillingUsagePeriod) => Effect.Effect<void, RepositoryError, SqlClient>
    /**
     * Atomically increments `consumedCredits` by `creditsDelta` and recomputes overage aggregates.
     */
    appendCreditsForBillingPeriod: (
      input: AppendBillingPeriodCreditsInput,
    ) => Effect.Effect<BillingUsagePeriod, RepositoryError, SqlClient>
    findByPeriod: (params: {
      organizationId: OrganizationId
      periodStart: Date
      periodEnd: Date
    }) => Effect.Effect<BillingUsagePeriod | null, RepositoryError, SqlClient>
    advanceReportedOverageCredits: (
      input: AdvanceReportedOverageCreditsInput,
    ) => Effect.Effect<BillingUsagePeriod | null, RepositoryError, SqlClient>
    findCurrent: (
      organizationId: OrganizationId,
    ) => Effect.Effect<BillingUsagePeriod | null, RepositoryError, SqlClient>
  }
>()("@domain/billing/BillingUsagePeriodRepository") {}
