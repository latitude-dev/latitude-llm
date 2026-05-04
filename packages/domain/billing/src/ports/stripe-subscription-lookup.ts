import type { OrganizationId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"

export interface StripeSubscriptionRow {
  plan: string
  status: string | null
  periodStart: Date | null
  periodEnd: Date | null
}

export class StripeSubscriptionLookup extends Context.Service<
  StripeSubscriptionLookup,
  {
    findActiveByOrganizationId: (
      organizationId: OrganizationId,
    ) => Effect.Effect<StripeSubscriptionRow | null, RepositoryError, SqlClient>
  }
>()("@domain/billing/StripeSubscriptionLookup") {}
