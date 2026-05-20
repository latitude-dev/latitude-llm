import type { ClickHouseClient } from "@clickhouse/client"
import { Effect } from "effect"
import { commandClickhouse, queryClickhouse } from "../sql.ts"

const MIGRATION_LEDGER_TABLE = "goose_db_version"

/**
 * Truncates every data table in the current ClickHouse database so a
 * subsequent seed run starts from a clean slate. Used by `ch:seed` to keep
 * re-runs idempotent — the fixture seeders insert deterministic
 * `trace_id`/`span_id` pairs with `start_time` rebased to the current
 * `timelineAnchor`, so without a wipe each run accreted a new span onto the
 * same trace and drifted the session's "last activity" forward.
 *
 * Discovers storage tables dynamically via `system.tables` (filtering out
 * MaterializedView / View definitions, which carry no rows of their own, and
 * the goose migration ledger) so future schema additions are wiped without
 * needing to touch this file.
 */
export const truncateDataTables = (
  client: ClickHouseClient,
  { quiet = false }: { readonly quiet?: boolean } = {},
): Effect.Effect<readonly string[], unknown> =>
  Effect.gen(function* () {
    const rows = yield* queryClickhouse<{ name: string }>(
      client,
      `SELECT name FROM system.tables
        WHERE database = currentDatabase()
          AND engine NOT LIKE '%View%'
          AND name != {ledger:String}
        ORDER BY name`,
      { ledger: MIGRATION_LEDGER_TABLE },
    )

    const names = rows.map((r) => r.name)
    for (const name of names) {
      if (!quiet) console.log(`  -> TRUNCATE ${name}`)
      // `SYNC` makes the truncate block until parts are actually dropped —
      // important because the next step (seeders) inserts straight into
      // these tables and we don't want a background drop racing the insert.
      yield* commandClickhouse(client, `TRUNCATE TABLE ${name} SYNC`)
    }
    return names
  })
