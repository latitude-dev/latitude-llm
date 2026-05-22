import { AI } from "@domain/ai"
import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError, TraceId } from "@domain/shared"
import { Effect, Option } from "effect"
import {
  TRACE_SEARCH_EMBEDDING_DIMENSIONS,
  TRACE_SEARCH_EMBEDDING_MODEL,
  TRACE_SEARCH_MIN_RELEVANCE_SCORE,
} from "../constants.ts"
import { TraceRepository } from "../ports/trace-repository.ts"
import { TraceSearchRepository, type TraceSemanticHighlightMatch } from "../ports/trace-search-repository.ts"
import { computeTraceSearchHighlights, type TraceSearchHighlightsResult } from "./compute-trace-search-highlights.ts"
import { parseSearchQuery } from "./parse-search-query.ts"

const EMPTY_RESULT: TraceSearchHighlightsResult = { highlights: [], firstMatchIndex: -1 }

/**
 * Server-side entry point for the LAT-601 search-highlights flow. Pure
 * orchestration over domain ports — no HTTP / TanStack-specific concerns — so
 * the same use-case can serve the web server function today and a future
 * REST/MCP endpoint without duplication.
 *
 * Behaviour:
 *   1. `parseSearchQuery` the raw input. An empty parsed query (no literals,
 *      no token phrases, no semantic prompt) short-circuits to the empty
 *      result before touching ClickHouse.
 *   2. Fetch the trace detail and (when the parsed query has a semantic
 *      prompt) the per-trace winning-chunk metadata in parallel.
 *      `findByTraceId` not found → empty result.
 *   3. The semantic branch embeds the prompt via Voyage and runs the focused
 *      per-trace `argMax` query. AI unavailable or embed failure → semantic
 *      match drops to `null` and the renderer falls back to literal/token
 *      highlights only (same shape as a pre-migration `trace_search_embeddings`
 *      row with NULL range columns).
 *   4. Delegate to the pure `computeTraceSearchHighlights` use-case for the
 *      actual highlight emission.
 */
export const getTraceSearchHighlightsUseCase = (args: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly traceId: TraceId
  readonly searchQuery: string
}): Effect.Effect<
  TraceSearchHighlightsResult,
  RepositoryError,
  ChSqlClient | TraceRepository | TraceSearchRepository
> =>
  Effect.gen(function* () {
    const parsed = parseSearchQuery(args.searchQuery)
    const hasPhrases = parsed.literalPhrases.length > 0 || parsed.tokenPhrases.length > 0
    const hasSemantic = parsed.semanticPrompt.length > 0
    if (!hasPhrases && !hasSemantic) return EMPTY_RESULT

    const traceRepo = yield* TraceRepository
    const detailEffect = traceRepo
      .findByTraceId({
        organizationId: args.organizationId,
        projectId: args.projectId,
        traceId: args.traceId,
      })
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    const semanticEffect = hasSemantic
      ? findSemanticMatch({ ...args, semanticPrompt: parsed.semanticPrompt })
      : Effect.succeed(null)

    const [detail, semanticMatch] = yield* Effect.all([detailEffect, semanticEffect], { concurrency: 2 })
    if (!detail) return EMPTY_RESULT

    // Semantic-only parity with `buildSearchPlan`: the listing path filters
    // out traces below `TRACE_SEARCH_MIN_RELEVANCE_SCORE` when there are no
    // phrases, so the drawer must drop the semantic-region highlight at the
    // same floor — otherwise a trace that wouldn't appear in search results
    // could still get a tint. The hybrid path drops the floor on purpose
    // (phrase precision is the gate), so we only enforce it when there are
    // no phrases.
    const effectiveSemanticMatch =
      semanticMatch && !hasPhrases && semanticMatch.relevanceScore < TRACE_SEARCH_MIN_RELEVANCE_SCORE
        ? null
        : semanticMatch

    return computeTraceSearchHighlights({
      messages: detail.allMessages,
      parsedQuery: parsed,
      semanticMatch: effectiveSemanticMatch,
    })
  })

/**
 * Embed the semantic prompt and look up the winning-chunk metadata for the
 * given trace. AI may be absent in dev/CI — treated identically to a chunk
 * indexed before migration 00017 (no semantic-region highlight; literal /
 * token still flow). Repository errors are also swallowed to `null` because
 * the highlight layer is decorative — a backend hiccup on the semantic side
 * shouldn't block literal/token highlights from rendering.
 */
const findSemanticMatch = (args: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly traceId: TraceId
  readonly semanticPrompt: string
}): Effect.Effect<TraceSemanticHighlightMatch | null, never, ChSqlClient | TraceSearchRepository> =>
  Effect.gen(function* () {
    const aiOption = yield* Effect.serviceOption(AI)
    if (Option.isNone(aiOption)) return null

    const embedResult = yield* aiOption.value
      .embed({
        text: args.semanticPrompt,
        model: TRACE_SEARCH_EMBEDDING_MODEL,
        dimensions: TRACE_SEARCH_EMBEDDING_DIMENSIONS,
        inputType: "query",
      })
      .pipe(Effect.orElseSucceed(() => undefined))
    if (!embedResult || embedResult.embedding.length === 0) return null

    const searchRepo = yield* TraceSearchRepository
    return yield* searchRepo
      .findSemanticHighlightForTrace({
        organizationId: args.organizationId,
        projectId: args.projectId,
        traceId: args.traceId,
        queryEmbedding: embedResult.embedding,
      })
      .pipe(Effect.orElseSucceed(() => null))
  })
