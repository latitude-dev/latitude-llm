import type { ClickHouseClient } from "@clickhouse/client"
import type { Effect } from "effect"

export interface SeedContext {
  readonly client: ClickHouseClient
}

export interface Seeder {
  readonly name: string
  readonly run: (ctx: SeedContext) => Effect.Effect<void, unknown>
}
