import { AI } from "@domain/ai"
import {
  type ParsedSearchQuery,
  TRACE_SEARCH_EMBEDDING_DIMENSIONS,
  TRACE_SEARCH_EMBEDDING_MODEL,
  TRACE_SEARCH_MIN_RELEVANCE_SCORE,
} from "@domain/spans"
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
 * Tokenize a backtick phrase the same way the `search_text` text index does:
 * lower-case first, then split on every non-alphanumeric ASCII byte (matching
 * CH's `splitByNonAlpha`). Empty fragments are dropped.
 */
function tokenizePhrase(phrase: string): readonly string[] {
  return phrase
    .toLowerCase()
    .split(/[^A-Za-z0-9]+/)
    .filter((t) => t.length > 0)
}

function stripLoneSurrogates(text: string): string {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�")
}

function normalizeLiteralPhrase(text: string): string {
  return stripLoneSurrogates(text.trim().replace(/\s+/g, " "))
}

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
 */
function buildSemanticSearchSubquery(queryEmbedding: readonly number[]): {
  subquery: string
  params: Record<string, unknown>
} {
  return {
    subquery: `SELECT
                trace_id,
                max(semantic_score) AS semantic_score
              FROM (
                SELECT
                  CAST(trace_id AS String) AS trace_id,
                  (1 - cosineDistance(embedding, {queryEmbedding:Array(Float32)})) AS semantic_score
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

/**
 * Plan returned by `buildSearchPlan`. Callers branch on `ranked`:
 *   - `ranked = true`  → ORDER BY relevance_score DESC (semantic / hybrid).
 *   - `ranked = false` → pure phrase filter, callers should keep the default
 *     sort so phrase matches surface in chronological order rather than by
 *     trace_id hash.
 *
 * @public
 */
export type SearchPlan = {
  readonly ranked: boolean
  readonly subquery: string
  readonly params: Record<string, unknown>
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
function buildSearchPlan(parsed: ParsedSearchQuery, queryEmbedding: readonly number[] | undefined): SearchPlan {
  const hasPhrases = parsed.literalPhrases.length > 0 || parsed.tokenPhrases.length > 0
  const hasSemantic = parsed.semanticPrompt.length > 0
  const hasEmbedding = !!queryEmbedding && queryEmbedding.length > 0

  if (hasPhrases && !hasSemantic) {
    const lex = buildLexicalSearchSubquery(parsed)
    return {
      ranked: false,
      subquery: `SELECT trace_id, 0.0 AS relevance_score FROM (${lex.subquery})`,
      params: lex.params,
    }
  }

  if (!hasPhrases && hasSemantic) {
    if (!hasEmbedding) {
      return {
        ranked: true,
        subquery: `SELECT CAST(trace_id AS String) AS trace_id, 0.0 AS relevance_score
                   FROM trace_search_documents
                   WHERE organization_id = {organizationId:String}
                     AND project_id = {projectId:String}
                     AND 0`,
        params: {},
      }
    }
    const sem = buildSemanticSearchSubquery(queryEmbedding)
    return {
      ranked: true,
      subquery: `SELECT trace_id, semantic_score AS relevance_score
                 FROM (${sem.subquery})
                 WHERE semantic_score >= {minRelevanceScore:Float64}`,
      params: { ...sem.params, minRelevanceScore: TRACE_SEARCH_MIN_RELEVANCE_SCORE },
    }
  }

  // hasPhrases && hasSemantic
  const lex = buildLexicalSearchSubquery(parsed)
  if (!hasEmbedding) {
    return {
      ranked: false,
      subquery: `SELECT trace_id, 0.0 AS relevance_score FROM (${lex.subquery})`,
      params: lex.params,
    }
  }
  const sem = buildSemanticSearchSubquery(queryEmbedding)
  // LEFT JOIN keeps phrase-matching traces without an embedding (semantic_score
  // defaults to 0.0 in CH for the missing side of an outer join). The lexical
  // filter is the precision gate, so no semantic floor here.
  return {
    ranked: true,
    subquery: `SELECT lex.trace_id AS trace_id,
                      max(sem.semantic_score) AS relevance_score
               FROM (${lex.subquery}) AS lex
               LEFT JOIN (${sem.subquery}) AS sem
                 ON lex.trace_id = sem.trace_id
               GROUP BY lex.trace_id`,
    params: { ...lex.params, ...sem.params },
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
const generateQueryEmbedding = (semanticPrompt: string): Effect.Effect<readonly number[] | undefined, never> =>
  Effect.gen(function* () {
    const aiOption = yield* Effect.serviceOption(AI)
    if (Option.isNone(aiOption)) return undefined

    const result = yield* aiOption.value
      .embed({
        text: semanticPrompt,
        model: TRACE_SEARCH_EMBEDDING_MODEL,
        dimensions: TRACE_SEARCH_EMBEDDING_DIMENSIONS,
        inputType: "query",
      })
      .pipe(
        Effect.tapError((error) =>
          Effect.logWarning("trace-search: query-side embedding failed; falling back to lexical-only", error),
        ),
        Effect.orElseSucceed(() => undefined),
      )

    return result?.embedding
  })

/**
 * Resolve a parsed search query into a `SearchPlan`. Skips the embedder
 * when the parsed query has no semantic prompt — phrase-only queries are
 * pure filters and don't need a Voyage round-trip.
 */
export const planSearch = (parsed: ParsedSearchQuery): Effect.Effect<SearchPlan, never> =>
  Effect.gen(function* () {
    const queryEmbedding =
      parsed.semanticPrompt.length > 0 ? yield* generateQueryEmbedding(parsed.semanticPrompt) : undefined
    return buildSearchPlan(parsed, queryEmbedding)
  })
