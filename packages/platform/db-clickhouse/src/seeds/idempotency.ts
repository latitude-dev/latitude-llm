import type { ClickHouseClient } from "@clickhouse/client"
import { Effect } from "effect"
import { queryClickhouse } from "../sql.ts"

/**
 * Checks whether a seeder's footprint already exists in the database.
 *
 * Each seeder picks a sentinel row that's unique to its fixture set (e.g. the
 * first deterministic `trace_id` it inserts, or any row tagged with its
 * `metadata.seed` marker). If the sentinel is present, the seeder no-ops.
 * Manually-inserted data isn't matched by these sentinels, so re-running
 * `pnpm ch:seed` leaves user-introduced rows alone. To force a refresh, use
 * `pnpm ch:seed:reset` (table-level truncate) or `pnpm db:reset` (volume nuke).
 */
export const isSentinelPresent = (
  client: ClickHouseClient,
  table: string,
  whereClause: string,
  params: Record<string, unknown>,
): Effect.Effect<boolean, unknown> =>
  queryClickhouse<{ present: string }>(
    client,
    `SELECT count() AS present FROM ${table} WHERE ${whereClause} LIMIT 1`,
    params,
  ).pipe(Effect.map((rows) => Number(rows[0]?.present ?? "0") > 0))
