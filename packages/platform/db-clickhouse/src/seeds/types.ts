import type { ClickHouseClient } from "@clickhouse/client"
import type { SeedScope } from "@domain/shared/seeding"
import type { Effect } from "effect"

export interface SeedContext {
  readonly client: ClickHouseClient
  /**
   * Per-project seeding context — see {@link SeedScope}. Each ClickHouse
   * seeder resolves trace/span hex ids and entity references via
   * `ctx.scope`, so the same seeder body works for both the canonical
   * bootstrap project (`pnpm ch:seed`) and a demo project created at
   * runtime via the backoffice.
   */
  readonly scope: SeedScope
}

export interface Seeder {
  readonly name: string
  readonly run: (ctx: SeedContext) => Effect.Effect<void, unknown>
}
