import type { RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { BillingUsageEvent } from "../entities/billing-usage-event.ts"

export class BillingUsageEventRepository extends Context.Service<
  BillingUsageEventRepository,
  {
    insertIfAbsent: (event: BillingUsageEvent) => Effect.Effect<boolean, RepositoryError, SqlClient>
    insertMany: (events: readonly BillingUsageEvent[]) => Effect.Effect<number, RepositoryError, SqlClient>
    findOptionalByKey: (key: string) => Effect.Effect<BillingUsageEvent | null, RepositoryError, SqlClient>
  }
>()("@domain/billing/BillingUsageEventRepository") {}
