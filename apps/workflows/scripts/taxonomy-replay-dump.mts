#!/usr/bin/env tsx
/**
 * Dump one project's real taxonomy observations from production ClickHouse so
 * the replay harness can rebuild its trees offline, pass by pass.
 *
 *   pnpm --filter @app/workflows exec tsx scripts/taxonomy-replay-dump.mts <projectId> [days]
 *
 * Needs production ClickHouse in the environment (the local .env points at the
 * local instance, so set these inline rather than editing it):
 *   LAT_CLICKHOUSE_URL=https://<host>.clickhouse.cloud:8443   (production endpoint)
 *   LAT_CLICKHOUSE_USER=... LAT_CLICKHOUSE_PASSWORD=... LAT_CLICKHOUSE_DB=latitude
 *
 * Writes to ~/Desktop/taxonomy-replay/<projectId>/ (outside the repo — these are
 * real customer conversations; never commit them):
 *   embeddings.f32   row-major float32, 2048 dims, one row per observation
 *   meta.json        { dims, rows, observations: [{ id, sessionId, startTime, hash64 }] }
 *   texts.json       { [observationId]: transcript }
 *
 * WHY hash64 AND NOT A PRECOMPUTED RANK. Production picks each pass's sample with
 *
 *   row_number() OVER (PARTITION BY toDate(start_time) ORDER BY cityHash64(observation_id)) AS rn
 *   ... ORDER BY rn ASC, observation_id ASC LIMIT 1500
 *
 * evaluated over the rows already inside that pass's 7-day window. The oldest day
 * of a window is only partially included, so a rank computed over the whole day is
 * inflated for exactly that day and the round-robin would under-draw from it.
 * Carrying the raw hash instead lets the harness re-rank per window and reproduce
 * the sample exactly, without needing a JS implementation of cityHash64.
 *
 * WHY THE ROW ORDER IS LOAD-BEARING. k-means++ draws its seeds as indices into the
 * member list, so a re-ordered pool builds a different tree from identical data.
 * The harness must feed members in production's final order — `start_time DESC,
 * observation_id ASC` — which is why startTime is dumped at full precision.
 */

import { createWriteStream } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
// Via the workspace package rather than @clickhouse/client directly: that dep
// belongs to @platform/db-clickhouse, and adding the edge here would re-resolve
// the lockfile against the 7-day release-age gate for no benefit.
import { createClickhouseClient } from "@platform/db-clickhouse"

const EMBEDDING_DIMS = 2048
const PAGE = 500

const projectId = process.argv[2]
const days = Number(process.argv[3] ?? 45)
/**
 * Per-day ceiling on the rows pulled, ranked the way production ranks them.
 * A pass's round robin draws roughly 1500/7 ~ 214 rows from each of seven dense
 * days, so anything above that is never reachable and only costs bandwidth. The
 * default leaves generous headroom for windows where sparse days push the draw
 * deeper into the dense ones. 0 disables the limit.
 */
const maxPerDay = Number(process.argv[4] ?? 0)
/** Transcripts are 4-24KB each and only needed for eyeballing, never for the replay. */
const skipTexts = process.env.SKIP_TEXTS === "1"
if (!projectId) throw new Error("usage: taxonomy-replay-dump.mts <projectId> [days] [maxPerDay]")

// Reads LAT_CLICKHOUSE_URL / _USER / _PASSWORD / _DB from the environment.
const client = createClickhouseClient()

const outDir = join(homedir(), "Desktop", "taxonomy-replay", projectId)
await mkdir(outDir, { recursive: true })

// `ts`, not `start_time`: an alias matching the column name shadows it, and the
// WHERE clause then compares String to DateTime (ClickHouse NO_COMMON_TYPE).
interface Row {
  observation_id: string
  session_id: string
  ts: string
  hash64: string
  transcript: string
  embedding: number[]
}

// Pinned ONCE, server-side. Re-evaluating `now()` per page slides the window
// between pages, so rows fall off the old edge mid-scan and OFFSET pagination
// shifts underneath itself — that silently duplicated and skipped rows on an
// actively-ingesting project.
// The UPPER bound matters too: without it, rows inserted mid-scan qualify and
// are picked up or missed depending on where their id sorts against the cursor.
// Both ends pinned makes the dump an exact snapshot of one instant.
const { cutoff, upper } = await client
  .query({
    query: `SELECT toString(now() - INTERVAL {d:UInt16} DAY) AS cutoff, toString(now()) AS upper`,
    query_params: { d: days },
    format: "JSONEachRow",
  })
  .then((r) => r.json<{ cutoff: string; upper: string }>())
  .then((r) => ({ cutoff: r[0]?.cutoff ?? "", upper: r[0]?.upper ?? "" }))

const PREDICATES = `project_id = {p:String} AND length(embedding) > 0
              AND length(observation_id) = 24
              AND start_time >= parseDateTimeBestEffort({cutoff:String})
              AND start_time <= parseDateTimeBestEffort({upper:String})`

// Same day-partitioned hash ranking production samples with, so the ceiling cuts
// exactly the rows no window could ever reach.
const rankClause = maxPerDay
  ? `AND observation_id IN (
              SELECT observation_id FROM (
                SELECT observation_id,
                       row_number() OVER (PARTITION BY toDate(start_time)
                                          ORDER BY cityHash64(observation_id)) AS rn
                FROM taxonomy_observations FINAL WHERE ${PREDICATES}
              ) WHERE rn <= {mpd:UInt32}
            )`
  : ""

const total = await client
  .query({
    query: `SELECT count() AS n FROM taxonomy_observations FINAL
            WHERE ${PREDICATES} ${rankClause}`,
    query_params: { p: projectId, cutoff, upper, mpd: maxPerDay },
    format: "JSONEachRow",
  })
  .then((r) => r.json<{ n: string }>())
  .then((r) => Number(r[0]?.n ?? 0))

console.log(`${projectId}: ${total} observations over ${days}d`)
if (total === 0) throw new Error("nothing to dump — wrong project id, or outside retention")

const f32 = createWriteStream(join(outDir, "embeddings.f32"))
const observations: { id: string; sessionId: string; startTime: string; hash64: string }[] = []
const texts: Record<string, string> = {}

// Keyset pagination on observation_id, not OFFSET: OFFSET re-scans and re-ranks
// on every page, so a concurrent insert shifts rows across page boundaries. The
// ORDER BY is the dump's own stable key, NOT production's member order — the
// harness re-sorts per window.
let after = ""
for (;;) {
  const rows = await client
    .query({
      query: `SELECT observation_id, session_id,
                     toString(start_time) AS ts,
                     toString(cityHash64(observation_id)) AS hash64,
                     ${skipTexts ? `'' AS transcript` : `JSONExtractString(projection_metadata, 'summary') AS transcript`},
                     embedding
              FROM taxonomy_observations FINAL
              WHERE ${PREDICATES} ${rankClause}
                AND observation_id > {after:String}
              ORDER BY observation_id ASC
              LIMIT {lim:UInt32}`,
      query_params: { p: projectId, cutoff, upper, mpd: maxPerDay, lim: PAGE, after },
      format: "JSONEachRow",
    })
    .then((r) => r.json<Row>())

  if (rows.length === 0) break
  for (const row of rows) {
    if (row.embedding.length !== EMBEDDING_DIMS) {
      throw new Error(`${row.observation_id}: ${row.embedding.length} dims, expected ${EMBEDDING_DIMS}`)
    }
    f32.write(Buffer.from(new Float32Array(row.embedding).buffer))
    observations.push({
      id: row.observation_id,
      sessionId: row.session_id,
      startTime: row.ts,
      hash64: row.hash64,
    })
    texts[row.observation_id] = row.transcript
    after = row.observation_id
  }
  process.stdout.write(`\r  ${observations.length}/${total}`)
}

const unique = new Set(observations.map((o) => o.id)).size
if (unique !== observations.length) throw new Error(`${observations.length - unique} duplicate observations — dump is unusable`)

await new Promise<void>((resolve, reject) => f32.end((error?: Error) => (error ? reject(error) : resolve())))
await writeFile(join(outDir, "meta.json"), JSON.stringify({ dims: EMBEDDING_DIMS, rows: observations.length, projectId, observations }))
if (!skipTexts) await writeFile(join(outDir, "texts.json"), JSON.stringify(texts))
await client.close()

const emptyTranscripts = Object.values(texts).filter((t) => t.length === 0).length
console.log(`\ndone → ${outDir}`)
console.log(`  ${observations.length} rows, ${((observations.length * EMBEDDING_DIMS * 4) / 1048576).toFixed(0)} MB embeddings`)
if (skipTexts) console.log(`  transcripts skipped (SKIP_TEXTS=1) — re-run without it to eyeball clusters`)
else if (emptyTranscripts > 0)
  console.log(`  WARNING ${emptyTranscripts} rows have an empty transcript — eyeballing those clusters will be blind`)
