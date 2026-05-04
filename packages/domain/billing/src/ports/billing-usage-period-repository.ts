import type { OrganizationId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { BillingUsagePeriod } from "../entities/billing-usage-period.ts"

export class BillingUsagePeriodRepository extends Context.Service<
  BillingUsagePeriodRepository,
  {
    upsert: (period: BillingUsagePeriod) => Effect.Effect<void, RepositoryError, SqlClient>
    findByPeriod: (params: {
      organizationId: OrganizationId
      periodStart: Date
      periodEnd: Date
    }) => Effect.Effect<BillingUsagePeriod | null, RepositoryError, SqlClient>
    findCurrent: (
      organizationId: OrganizationId,
    ) => Effect.Effect<BillingUsagePeriod | null, RepositoryError, SqlClient>
  }
>()("@domain/billing/BillingUsagePeriodRepository") {}
