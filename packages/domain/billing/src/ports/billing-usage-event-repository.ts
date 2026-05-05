import type { RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { BillingUsageEvent } from "../entities/billing-usage-event.ts"
import type { UsageEventAlreadyRecordedError } from "../errors.ts"

export class BillingUsageEventRepository extends Context.Service<
  BillingUsageEventRepository,
  {
    insert: (
      event: BillingUsageEvent,
    ) => Effect.Effect<void, UsageEventAlreadyRecordedError | RepositoryError, SqlClient>
    findByKey: (key: string) => Effect.Effect<BillingUsageEvent | null, RepositoryError, SqlClient>
  }
>()("@domain/billing/BillingUsageEventRepository") {}
