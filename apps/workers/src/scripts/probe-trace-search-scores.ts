import { AI } from "@domain/ai"
import { OrganizationId, ProjectId } from "@domain/shared"
import { TRACE_SEARCH_EMBEDDING_DIMENSIONS, TRACE_SEARCH_EMBEDDING_MODEL } from "@domain/spans"
import { withAi } from "@platform/ai"
import { AIEmbedLive } from "@platform/ai-voyage"
import { closeClickhouse, queryClickhouse } from "@platform/db-clickhouse"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect } from "effect"
import { getClickhouseClient, getRedisClient } from "../clients.ts"

loadDevelopmentEnvironments(new URL("../server.ts", import.meta.url).href)

const ORG_ID = OrganizationId(process.env.PROBE_ORG_ID ?? "iapkf6osmlm7mbw9kulosua4")
const PROJECT_ID = ProjectId(process.env.PROBE_PROJECT_ID ?? "yvl1e78evmwfs2mosyjb08rc")

const QUERIES = [
  "anvil delivery problem",
  "rocket skates malfunction",
  "warranty policy",
  "release schedule",
  "p99 latency",
  "order status check",
  "JSON response",
  "totally unrelated banana",
]

type Row = { score: string }

const probe = (query: string) =>
  Effect.gen(function* () {
    const ai = yield* AI
    const result = yield* ai.embed({
      text: query,
      model: TRACE_SEARCH_EMBEDDING_MODEL,
      dimensions: TRACE_SEARCH_EMBEDDING_DIMENSIONS,
      inputType: "query",
    })
    const embedding = [...result.embedding]

    const rows = yield* queryClickhouse<Row>(
      clickhouse,
      `WITH chunk_scores AS (
         SELECT trace_id, (1 - cosineDistance(embedding, {q:Array(Float32)})) AS s
         FROM trace_search_embeddings
         WHERE organization_id = {org:String} AND project_id = {proj:String}
         ORDER BY cosineDistance(embedding, {q:Array(Float32)}) ASC
         LIMIT 30000
       )
       SELECT toString(round(max(s), 4)) AS score
       FROM chunk_scores
       GROUP BY trace_id
       ORDER BY max(s) DESC`,
      { q: embedding, org: ORG_ID as string, proj: PROJECT_ID as string },
    )

    const scores = rows.map((r) => Number(r.score)).filter((n) => Number.isFinite(n))
    const top = scores.slice(0, 5)
    const pct = (p: number) => scores[Math.min(scores.length - 1, Math.floor(scores.length * p))]
    return { query, count: scores.length, top, p10: pct(0.1), p50: pct(0.5), p90: pct(0.9), min: scores.at(-1) ?? 0 }
  })

const clickhouse = getClickhouseClient()
const redis = getRedisClient()

void Effect.runPromise(
  Effect.gen(function* () {
    for (const query of QUERIES) {
      const result = yield* probe(query)
      console.log(JSON.stringify(result))
    }
  }).pipe(
    withAi(AIEmbedLive, redis),
    Effect.ensuring(
      Effect.promise(async () => {
        await Promise.allSettled([closeClickhouse(clickhouse), redis.quit().catch(() => undefined)])
      }),
    ),
  ),
).catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
