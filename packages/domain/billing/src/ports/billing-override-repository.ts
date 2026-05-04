import type { OrganizationId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { BillingOverride } from "../entities/billing-override.ts"

export class BillingOverrideRepository extends Context.Service<
  BillingOverrideRepository,
  {
    findByOrganizationId: (id: OrganizationId) => Effect.Effect<BillingOverride | null, RepositoryError, SqlClient>
    upsert: (override: BillingOverride) => Effect.Effect<void, RepositoryError, SqlClient>
  }
>()("@domain/billing/BillingOverrideRepository") {}
