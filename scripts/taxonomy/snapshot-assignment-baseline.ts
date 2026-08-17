#!/usr/bin/env tsx
/**
 * Snapshot the pre-change assignment baseline for the fit floor (LAT-866).
 *
 * `taxonomy_observations` is retained for TAXONOMY_OBSERVATION_RETENTION_DAYS (30),
 * so the rows that record what the old floor admitted stop existing about a month
 * from now — the baseline is destroyed by retention, not by the deploy, and there is
 * no querying it later. Run this BEFORE the floor change reaches production and
 * commit the output next to the PR.
 *
 * Unlike `pull-fresh-pilot.ts` this pulls no embeddings, summaries or session ids —
 * only per-(organization, project, method) counts and confidence quantiles — so the
 * output is safe to commit.
 *
 * `wouldRejectAtFloor` is the prediction: the share of currently-ASSIGNED
 * observations sitting below the new floor. Comparing it per project against the
 * coverage the `taxonomy.gardenTaxonomyWorkflow.assignmentCoverage` span reports
 * after the deploy is the actual verification — a fleet-wide 13% tells you nothing
 * about which projects paid it.
 *
 * Requires read access to production ClickHouse via the standard env vars:
 *   LAT_CLICKHOUSE_URL, LAT_CLICKHOUSE_USER, LAT_CLICKHOUSE_PASSWORD, LAT_CLICKHOUSE_DB
 * (pull them from Secrets Manager or your local prod config).
 *
 *   LAT_CLICKHOUSE_URL=… … pnpm --filter @app/workers exec tsx \
 *     scripts/taxonomy/snapshot-assignment-baseline.ts [outPath] [floor] [lookbackDays]
 */
import { writeFileSync } from "node:fs"
import { createClient } from "@clickhouse/client"

const DEFAULT_OUT = "taxonomy-assignment-baseline.json"
const DEFAULT_FLOOR = 0.75
/** The gardening sample window, so the snapshot is comparable to the per-run coverage span. */
const DEFAULT_LOOKBACK_DAYS = 7

const out = process.argv[2] ?? DEFAULT_OUT
const floor = Number.parseFloat(process.argv[3] ?? String(DEFAULT_FLOOR))
const lookbackDays = Number.parseInt(process.argv[4] ?? String(DEFAULT_LOOKBACK_DAYS), 10)

const client = createClient({
  url: process.env.LAT_CLICKHOUSE_URL,
  username: process.env.LAT_CLICKHOUSE_USER,
  password: process.env.LAT_CLICKHOUSE_PASSWORD,
  database: process.env.LAT_CLICKHOUSE_DB ?? "latitude",
})

/**
 * Grouped by `assignment_method` on purpose: `centroid_online` (freshly gated) and
 * `gardening_reassign` (the whole window, re-gated every pass) are different
 * populations, and pooling them reports a mixture that moves when the mode does.
 *
 * The confidence of a `noise` row is the top similarity that FAILED, so the
 * `wouldRejectAtFloor` denominator is assigned rows only.
 */
const query = `
  SELECT organization_id                                        AS organizationId,
         project_id                                             AS projectId,
         assignment_method                                      AS assignmentMethod,
         count()                                                AS observations,
         countIf(assigned_cluster_id = '')                       AS unassigned,
         round(min(assignment_confidence), 4)                    AS confidenceMin,
         round(quantile(0.10)(assignment_confidence), 4)          AS confidenceP10,
         round(quantile(0.50)(assignment_confidence), 4)          AS confidenceP50,
         round(quantile(0.90)(assignment_confidence), 4)          AS confidenceP90,
         countIf(assigned_cluster_id != '')                       AS assigned,
         countIf(assigned_cluster_id != '' AND assignment_confidence < {floor:Float64}) AS assignedBelowFloor,
         round(
           countIf(assigned_cluster_id != '' AND assignment_confidence < {floor:Float64})
           / nullIf(countIf(assigned_cluster_id != ''), 0),
         4)                                                      AS wouldRejectAtFloor
  FROM latitude.taxonomy_observations FINAL
  WHERE length(observation_id) = 24
    AND start_time >= now() - INTERVAL {days:UInt32} DAY
  GROUP BY organization_id, project_id, assignment_method
  ORDER BY observations DESC
`

interface BaselineRow {
  readonly organizationId: string
  readonly projectId: string
  readonly assignmentMethod: string
  readonly observations: string | number
  readonly assigned: string | number
  readonly assignedBelowFloor: string | number
  readonly wouldRejectAtFloor: number | null
}

const main = async () => {
  const rs = await client.query({
    query,
    query_params: { floor, days: lookbackDays },
    format: "JSONEachRow",
  })
  const rows = await rs.json<BaselineRow>()

  const total = rows.reduce((sum, row) => sum + Number(row.assigned), 0)
  const belowFloor = rows.reduce((sum, row) => sum + Number(row.assignedBelowFloor), 0)
  const snapshot = {
    // Stamped so a later reader can tell how stale the baseline is against the 30-day TTL.
    capturedAt: new Date().toISOString(),
    floor,
    lookbackDays,
    fleet: {
      assigned: total,
      assignedBelowFloor: belowFloor,
      wouldRejectAtFloor: total === 0 ? null : Number((belowFloor / total).toFixed(4)),
    },
    rows,
  }
  writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`)
  console.log(
    `wrote ${rows.length} (org, project, method) rows to ${out}\n` +
      `fleet: ${belowFloor}/${total} assigned observations below ${floor} ` +
      `(${snapshot.fleet.wouldRejectAtFloor === null ? "n/a" : `${(snapshot.fleet.wouldRejectAtFloor * 100).toFixed(1)}%`})`,
  )
  await client.close()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
