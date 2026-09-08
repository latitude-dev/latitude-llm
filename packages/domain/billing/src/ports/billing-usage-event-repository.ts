import type { OrganizationId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { BillingUsageEvent } from "../entities/billing-usage-event.ts"
import type { BillingUsageLedgerSummaryRow } from "../usage-breakdown.ts"

export interface SummarizeBillingUsageEventsInput {
  readonly organizationId: OrganizationId
  readonly periodStart: Date
  readonly periodEnd: Date
}

export class BillingUsageEventRepository extends Context.Service<
  BillingUsageEventRepository,
  {
    insertIfAbsent: (event: BillingUsageEvent) => Effect.Effect<boolean, RepositoryError, SqlClient>
    insertMany: (events: readonly BillingUsageEvent[]) => Effect.Effect<number, RepositoryError, SqlClient>
    findOptionalByKey: (key: string) => Effect.Effect<BillingUsageEvent | null, RepositoryError, SqlClient>
    /** Credits per project, action, and metering label for one billing period. */
    summarizeByPeriod: (
      input: SummarizeBillingUsageEventsInput,
    ) => Effect.Effect<readonly BillingUsageLedgerSummaryRow[], RepositoryError, SqlClient>
  }
>()("@domain/billing/BillingUsageEventRepository") {}
