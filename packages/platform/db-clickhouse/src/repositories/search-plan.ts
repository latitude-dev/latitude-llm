import { AI, resolveEmbeddingConfig } from "@domain/ai"
import {
  normalizeLiteralPhrase,
  type ParsedSearchQuery,
  TRACE_SEARCH_MIN_RELEVANCE_SCORE,
  tokenizePhrase,
} from "@domain/spans"
import { parseEnv } from "@platform/env"
import { Effect, Option } from "effect"

/**
 * Shared search-plan builder used by both `TraceRepository` and
 * `SessionRepository`. The plan emits a `(trace_id, relevance_score)` subquery;
 * each repository wraps that subquery in the rollup shape it needs (per-trace
 * for the trace list, per-session for the session list).
 *
 * Kept as plain functions plus one Effect (`planSearch`) so the AI service is
 * pulled from the runtime context rather than threaded through a factory.
 */

/**
 * Cap on the semantic-side **chunk-row** candidate pool. Each trace can carry
 * multiple chunks now, so the cap is sized for chunks, not traces. Cosine scan
 * stays linear over the embeddings table; above ~30k chunk rows per project
 * latency becomes user-visible. The cap trades recall on the long tail for
 * bounded query time — at the average ~3-chunks-per-trace ratio that's ~10k
 * traces, comfortably above realistic project sizes inside the 30-day TTL
 * window.
 */
const SEMANTIC_SCAN_LIMIT = 30_000

/**
 * Candidate window for indexed vector retrieval. ClickHouse defaults
 * `max_limit_for_vector_search_queries` to 100, so semantic plans also carry a
 * per-query setting that raises the guardrail to this value.
 */
const SEMANTIC_VECTOR_LIMIT = 1_000
const SEMANTIC_VECTOR_SEARCH_SETTINGS = {
  max_limit_for_vector_search_queries: SEMANTIC_VECTOR_LIMIT,
} as const

/**
 * Hard cap on the per-trace candidate set returned to the application by
 * `fetchSearchCandidates` (session-level search). Semantic plans already
 * enforce `SEMANTIC_SCAN_LIMIT` server-side, but the lexical and hybrid
 * shapes have no inherent bound — a broad phrase on an XL project could
 * match hundreds of thousands of trace documents. Without this cap those
 * rows stream into the Node worker as a single result set and then ship
 * straight back to ClickHouse as a query parameter, which (a) risks OOMing
 * the worker and (b) inflates the rollup query payload past anything the
 * PREWHERE win can recoup.
 *
 * 50k is generous: well above realistic ranked-search recall and small
 * enough that `Array(FixedString(32))` serialization stays under ~2 MB.
 */
export const MAX_SEARCH_CANDIDATES = 50_000

const useSharedMessageEmbeddingsReads = (): boolean =>
  Effect.runSync(parseEnv("LAT_TRACE_SEARCH_SHARED_MESSAGE_EMBEDDINGS_READS", "boolean", false))

function escapeLikePattern(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

/**
 * Compose quoted-search filters:
 *   - `"..."` is a case-sensitive literal substring over normalized
 *     `search_text`, implemented with indexed `LIKE`.
 *   - `` `...` `` is a case-insensitive ordered token phrase. ClickHouse 26.2
 *     does not expose `hasPhrase`, so we combine an indexed `hasAllTokens`
 *     prefilter with `hasSubstr(tokens(lower(...)), phraseTokens)` to enforce
 *     token adjacency and order.
 *
 * A phrase that normalizes/tokenizes to nothing intentionally matches zero rows
 * rather than silently dropping the filter.
 */
function buildLexicalSearchSubquery(parsed: ParsedSearchQuery): {
  subquery: string
  params: Record<string, unknown>
} {
  const literalPhrases = parsed.literalPhrases.map(normalizeLiteralPhrase)
  const tokenized = parsed.tokenPhrases.map(tokenizePhrase)
  const matchNothing =
    literalPhrases.some((phrase) => phrase.length === 0) || tokenized.some((tokens) => tokens.length === 0)

  if (matchNothing) {
    return {
      subquery: `SELECT CAST(trace_id AS String) AS trace_id
                 FROM trace_search_documents
                 WHERE organization_id = {organizationId:String}
                   AND project_id = {projectId:String}
                   AND 0`,
      params: {},
    }
  }

  const predicates: string[] = []
  const params: Record<string, unknown> = {}

  literalPhrases.forEach((phrase, phraseIdx) => {
    const paramName = `literalPhrase${phraseIdx}`
    predicates.push(`search_text LIKE {${paramName}:String}`)
    params[paramName] = `%${escapeLikePattern(phrase)}%`
  })

  tokenized.forEach((tokens, phraseIdx) => {
    const paramName = `tokenPhrase${phraseIdx}`
    predicates.push(
      `hasAllTokens(search_text, {${paramName}:Array(String)}) AND hasSubstr(tokens(lower(search_text), 'splitByNonAlpha'), {${paramName}:Array(String)})`,
    )
    params[paramName] = [...tokens]
  })

  const phraseClause = predicates.length > 0 ? `AND ${predicates.join(" AND ")}` : ""

  return {
    subquery: `SELECT CAST(trace_id AS String) AS trace_id
               FROM trace_search_documents
               WHERE organization_id = {organizationId:String}
                 AND project_id = {projectId:String}
                 ${phraseClause}`,
    params,
  }
}

/**
 * Builds a subquery for semantic search candidates using a pre-computed query
 * embedding. The embedding table holds one row per trace **chunk**, so we
 * compute per-chunk cosine similarity and roll up to a per-trace score via
 * `max(...) GROUP BY trace_id` — a trace's relevance is its best-matching
 * chunk's similarity. The inner `ORDER BY semantic_score DESC LIMIT N` bounds
 * the per-project cosine scan cost by keeping the nearest chunks first; the
 * outer rollup collapses surviving chunks back into one row per trace for the
 * downstream join.
 *
 * When `semanticMetadata` is `true`, the rollup also surfaces `argMax(...)`
 * of `chunk_index`, `first_message_index`, `last_message_index` aligned to the
 * winning `semantic_score` — used by `getTraceSearchHighlights` (LAT-601) to
 * paint the matched conversational region as a semantic-region highlight.
 * `false` keeps the SQL byte-identical to the pre-PR-2 listing query so
 * existing callers see no change.
 */
function buildLegacySemanticSearchSubquery(
  queryEmbedding: readonly number[],
  semanticMetadata: boolean,
): {
  subquery: string
  params: Record<string, unknown>
  clickhouseSettings?: Record<string, string | number | boolean>
} {
  const innerExtraCols = semanticMetadata
    ? `,
                  chunk_index,
                  first_message_index,
                  last_message_index`
    : ""
  const outerExtraCols = semanticMetadata
    ? `,
                argMax(chunk_index, semantic_score)         AS matched_chunk_index,
                argMax(first_message_index, semantic_score) AS matched_first_message_index,
                argMax(last_message_index, semantic_score)  AS matched_last_message_index`
    : ""

  return {
    subquery: `SELECT
                trace_id,
                max(semantic_score) AS semantic_score${outerExtraCols}
              FROM (
                SELECT
                  CAST(trace_id AS String) AS trace_id,
                  (1 - cosineDistance(embedding, {queryEmbedding:Array(Float32)})) AS semantic_score${innerExtraCols}
                FROM trace_search_embeddings
                WHERE organization_id = {organizationId:String}
                  AND project_id = {projectId:String}
                ORDER BY semantic_score DESC
                LIMIT {semanticScanLimit:UInt32}
              )
              GROUP BY trace_id`,
    params: {
      queryEmbedding: [...queryEmbedding],
      semanticScanLimit: SEMANTIC_SCAN_LIMIT,
    },
  }
}

function buildSharedMessageSemanticSearchSubquery(
  queryEmbedding: readonly number[],
  semanticMetadata: boolean,
  embeddingModel: string,
): {
  subquery: string
  params: Record<string, unknown>
  clickhouseSettings?: Record<string, string | number | boolean>
} {
  const outerExtraCols = semanticMetadata
    ? `,
                argMax(message_index, semantic_score) AS matched_chunk_index,
                argMax(message_index, semantic_score) AS matched_first_message_index,
                argMax(message_index, semantic_score) AS matched_last_message_index`
    : ""

  return {
    subquery: `SELECT
                trace_id,
                max(semantic_score) AS semantic_score${outerExtraCols}
              FROM (
                SELECT
                  CAST(o.trace_id AS String) AS trace_id,
                  o.message_index AS message_index,
                  e.semantic_score AS semantic_score
                FROM (
                  SELECT
                    organization_id,
                    project_id,
                    trace_id,
                    message_index,
                    argMax(content_hash, indexed_at) AS content_hash,
                    argMax(role, indexed_at) AS role
                  FROM trace_message_occurrences
                  WHERE organization_id = {organizationId:String}
                    AND project_id = {projectId:String}
                  GROUP BY organization_id, project_id, trace_id, message_index
                ) AS o
                INNER JOIN (
                  SELECT
                    content_hash,
                    (1 - cosineDistance(embedding, {queryEmbedding:Array(Float32)})) AS semantic_score
                  FROM message_embeddings
                  WHERE organization_id = {organizationId:String}
                    AND project_id = {projectId:String}
                    AND embedding_model = {embeddingModel:String}
                  ORDER BY cosineDistance(embedding, {queryEmbedding:Array(Float32)}) ASC
                  LIMIT {semanticVectorLimit:UInt32}
                ) AS e ON o.content_hash = e.content_hash
                WHERE o.role IN ('user', 'assistant')
                ORDER BY semantic_score DESC
              ) AS semantic_candidates
              GROUP BY trace_id`,
    params: {
      queryEmbedding: [...queryEmbedding],
      embeddingModel,
      semanticVectorLimit: SEMANTIC_VECTOR_LIMIT,
    },
    clickhouseSettings: SEMANTIC_VECTOR_SEARCH_SETTINGS,
  }
}

function buildSemanticSearchSubquery(
  queryEmbedding: readonly number[],
  semanticMetadata: boolean,
  embeddingModel: string,
): {
  subquery: string
  params: Record<string, unknown>
  clickhouseSettings?: Record<string, string | number | boolean>
} {
  return useSharedMessageEmbeddingsReads()
    ? buildSharedMessageSemanticSearchSubquery(queryEmbedding, semanticMetadata, embeddingModel)
    : buildLegacySemanticSearchSubquery(queryEmbedding, semanticMetadata)
}

/**
 * Plan returned by `buildSearchPlan`. Callers branch on `ranked`:
 *   - `ranked = true`  → ORDER BY relevance_score DESC (semantic / hybrid).
 *   - `ranked = false` → pure phrase filter, callers should keep the default
 *     sort so phrase matches surface in chronological order rather than by
 *     trace_id hash.
 *
 * `semanticMetadata` (LAT-601): when true the subquery exposes the winning
 * chunk's metadata alongside `relevance_score` —
 * `matched_chunk_index`, `matched_first_message_index`,
 * `matched_last_message_index`. NULL on traces that matched purely lexically
 * or were indexed before migration 00017. Default `false` keeps the SQL
 * byte-identical to before; the listing query plan is unchanged.
 *
 * @public
 */
export type SearchPlan = {
  readonly ranked: boolean
  readonly subquery: string
  readonly params: Record<string, unknown>
  readonly clickhouseSettings?: Record<string, string | number | boolean>
  readonly semanticMetadata: boolean
}

/**
 * Translate `(literalPhrases, tokenPhrases, semanticPrompt, queryEmbedding)`
 * into one of three shapes (the spec's table collapses to three live shapes —
 * the empty/empty case is gated upstream by `isActiveSearch`):
 *
 *   - phrase-only (`ranked=false`): literal and/or token-phrase filter.
 *   - semantic-only (`ranked=true`): cosine ranker with the relevance floor.
 *   - hybrid (`ranked=true`): phrase filter narrows the candidate set, cosine
 *     similarity ranks the survivors. Phrase matches without an embedding
 *     stay in (relevance_score = 0); the lexical filter already enforced
 *     precision, so the semantic floor is dropped to avoid losing them.
 *
 * If a semantic prompt was typed but the embedder is unavailable, the plan
 * collapses to phrase-only (no semantic ranking) when phrases are present,
 * or to a deliberate empty result when there are no phrases — same fallback
 * shape the previous design relied on.
 */
type QueryEmbedding = {
  readonly embedding: readonly number[]
  readonly model: string
}

function buildSearchPlan(
  parsed: ParsedSearchQuery,
  queryEmbedding: QueryEmbedding | undefined,
  semanticMetadata: boolean,
): SearchPlan {
  const hasPhrases = parsed.literalPhrases.length > 0 || parsed.tokenPhrases.length > 0
  const hasSemantic = parsed.semanticPrompt.length > 0
  const hasEmbedding = !!queryEmbedding && queryEmbedding.embedding.length > 0

  // Outer projection for plans that don't actually carry semantic metadata
  // (phrase-only, semantic-without-embedding). The columns are present so
  // every plan has the same shape when `semanticMetadata: true`; values are
  // NULL because there's no winning chunk to point at.
  const nullMetadataCols = semanticMetadata
    ? `,
                      CAST(NULL AS Nullable(UInt16))  AS matched_chunk_index,
                      CAST(NULL AS Nullable(UInt32))  AS matched_first_message_index,
                      CAST(NULL AS Nullable(UInt32))  AS matched_last_message_index`
    : ""

  if (hasPhrases && !hasSemantic) {
    const lex = buildLexicalSearchSubquery(parsed)
    return {
      ranked: false,
      subquery: `SELECT trace_id, 0.0 AS relevance_score${nullMetadataCols} FROM (${lex.subquery})`,
      params: lex.params,
      semanticMetadata,
    }
  }

  if (!hasPhrases && hasSemantic) {
    if (!hasEmbedding) {
      return {
        ranked: true,
        subquery: `SELECT CAST(trace_id AS String) AS trace_id, 0.0 AS relevance_score${nullMetadataCols}
                   FROM trace_search_documents
                   WHERE organization_id = {organizationId:String}
                     AND project_id = {projectId:String}
                     AND 0`,
        params: {},
        semanticMetadata,
      }
    }
    const sem = buildSemanticSearchSubquery(queryEmbedding.embedding, semanticMetadata, queryEmbedding.model)
    const semanticPassthrough = semanticMetadata
      ? `,
                 matched_chunk_index,
                 matched_first_message_index,
                 matched_last_message_index`
      : ""
    return {
      ranked: true,
      subquery: `SELECT trace_id, semantic_score AS relevance_score${semanticPassthrough}
                 FROM (${sem.subquery})
                 WHERE semantic_score >= {minRelevanceScore:Float64}`,
      params: {
        ...sem.params,
        minRelevanceScore: TRACE_SEARCH_MIN_RELEVANCE_SCORE,
      },
      ...(sem.clickhouseSettings ? { clickhouseSettings: sem.clickhouseSettings } : {}),
      semanticMetadata,
    }
  }

  // hasPhrases && hasSemantic
  const lex = buildLexicalSearchSubquery(parsed)
  if (!hasEmbedding) {
    return {
      ranked: false,
      subquery: `SELECT trace_id, 0.0 AS relevance_score${nullMetadataCols} FROM (${lex.subquery})`,
      params: lex.params,
      semanticMetadata,
    }
  }
  const sem = buildSemanticSearchSubquery(queryEmbedding.embedding, semanticMetadata, queryEmbedding.model)
  // LEFT JOIN keeps phrase-matching traces without an embedding (semantic_score
  // defaults to 0.0 in CH for the missing side of an outer join). The lexical
  // filter is the precision gate, so no semantic floor here.
  //
  // Semantic-metadata pass-through: `sem.matched_*` columns are already
  // 1-per-trace (the inner subquery rolls them up via argMax), so MAX over
  // them in the outer GROUP BY is a no-op that just lets us forward them.
  // On lexical-only matches the LEFT JOIN gives NULLs, which propagate
  // through MAX — the read side treats NULL as "no semantic-region data".
  const hybridMetadataCols = semanticMetadata
    ? `,
                      max(sem.matched_chunk_index)         AS matched_chunk_index,
                      max(sem.matched_first_message_index) AS matched_first_message_index,
                      max(sem.matched_last_message_index)  AS matched_last_message_index`
    : ""
  return {
    ranked: true,
    subquery: `SELECT lex.trace_id AS trace_id,
                      max(sem.semantic_score) AS relevance_score${hybridMetadataCols}
               FROM (${lex.subquery}) AS lex
               LEFT JOIN (${sem.subquery}) AS sem
                 ON lex.trace_id = sem.trace_id
               GROUP BY lex.trace_id`,
    params: { ...lex.params, ...sem.params },
    ...(sem.clickhouseSettings ? { clickhouseSettings: sem.clickhouseSettings } : {}),
    semanticMetadata,
  }
}

/**
 * Whether the parsed query carries enough signal to flip the read path onto
 * the search subquery. Empty-input or whitespace-only inputs short-circuit.
 */
export function isActiveSearch(parsed: ParsedSearchQuery): boolean {
  return parsed.literalPhrases.length > 0 || parsed.tokenPhrases.length > 0 || parsed.semanticPrompt.length > 0
}

/**
 * Voyage round-trip for a semantic prompt. Returns `undefined` when the
 * embedder is unavailable (no `AI` service in context, or the call failed) so
 * the caller can fall through to the lexical-only plan.
 *
 * `Effect.serviceOption` keeps `AI` an *optional* dependency — the effect type
 * stays `never` in its requirements channel.
 */
const generateQueryEmbedding = (semanticPrompt: string): Effect.Effect<QueryEmbedding | undefined, never> =>
  Effect.gen(function* () {
    const aiOption = yield* Effect.serviceOption(AI)
    if (Option.isNone(aiOption)) return undefined

    const embedding = yield* resolveEmbeddingConfig().pipe(
      Effect.tapError((error) =>
        Effect.logWarning("trace-search: invalid embedding configuration; falling back to lexical-only", error),
      ),
      Effect.orElseSucceed(() => undefined),
    )
    if (embedding === undefined) return undefined

    const result = yield* aiOption.value
      .embed({
        text: semanticPrompt,
        provider: embedding.provider,
        model: embedding.model,
        inputType: "query",
      })
      .pipe(
        Effect.tapError((error) =>
          Effect.logWarning("trace-search: query-side embedding failed; falling back to lexical-only", error),
        ),
        Effect.orElseSucceed(() => undefined),
      )

    return result ? { embedding: result.embedding, model: embedding.model } : undefined
  })

interface PlanSearchOptions {
  readonly semanticMetadata?: boolean
}

/**
 * Resolve a parsed search query into a `SearchPlan`. Skips the embedder
 * when the parsed query has no semantic prompt — phrase-only queries are
 * pure filters and don't need a Voyage round-trip.
 */
export const planSearch = (
  parsed: ParsedSearchQuery,
  options: PlanSearchOptions = {},
): Effect.Effect<SearchPlan, never> =>
  Effect.gen(function* () {
    const queryEmbedding =
      parsed.semanticPrompt.length > 0 ? yield* generateQueryEmbedding(parsed.semanticPrompt) : undefined
    return buildSearchPlan(parsed, queryEmbedding, options.semanticMetadata ?? false)
  })
