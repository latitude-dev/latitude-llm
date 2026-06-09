import { AI } from "@domain/ai"
import {
  CONVERSATION_INTELLIGENCE_EMBEDDING_DIMENSIONS,
  CONVERSATION_INTELLIGENCE_EMBEDDING_MODEL,
} from "@domain/conversation-intelligence"
import { type ParsedSearchQuery, TRACE_SEARCH_MIN_RELEVANCE_SCORE } from "@domain/spans"
import { Effect, Option } from "effect"
import { buildLexicalSearchSubquery } from "./search-plan.ts"

/**
 * Session semantic search scans conversation-intelligence moments instead of
 * trace-search chunks. The cap bounds the cosine scan before the read path
 * rolls matching moment traces up to sessions.
 */
const SESSION_SEMANTIC_MOMENT_SCAN_LIMIT = 30_000

function buildSessionSemanticSubquery(queryEmbedding: readonly number[]): {
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
                FROM session_semantic_moments FINAL
                WHERE organization_id = {organizationId:String}
                  AND project_id = {projectId:String}
                  AND (session_id, analysis_hash) IN (
                    SELECT session_id, argMax(analysis_hash, indexed_at)
                    FROM session_analyses
                    WHERE organization_id = {organizationId:String}
                      AND project_id = {projectId:String}
                    GROUP BY session_id
                  )
                ORDER BY semantic_score DESC
                LIMIT {semanticMomentScanLimit:UInt32}
              )
              GROUP BY trace_id`,
    params: {
      queryEmbedding: [...queryEmbedding],
      semanticMomentScanLimit: SESSION_SEMANTIC_MOMENT_SCAN_LIMIT,
    },
  }
}

export type SessionSearchPlan = {
  readonly ranked: boolean
  readonly subquery: string
  readonly params: Record<string, unknown>
}

function buildSessionSearchPlan(
  parsed: ParsedSearchQuery,
  queryEmbedding: readonly number[] | undefined,
): SessionSearchPlan {
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
    const sem = buildSessionSemanticSubquery(queryEmbedding)
    return {
      ranked: true,
      subquery: `SELECT trace_id, semantic_score AS relevance_score
                 FROM (${sem.subquery})
                 WHERE semantic_score >= {minRelevanceScore:Float64}`,
      params: {
        ...sem.params,
        minRelevanceScore: TRACE_SEARCH_MIN_RELEVANCE_SCORE,
      },
    }
  }

  const lex = buildLexicalSearchSubquery(parsed)
  if (!hasEmbedding) {
    return {
      ranked: false,
      subquery: `SELECT trace_id, 0.0 AS relevance_score FROM (${lex.subquery})`,
      params: lex.params,
    }
  }

  const sem = buildSessionSemanticSubquery(queryEmbedding)
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

const generateSessionQueryEmbedding = (semanticPrompt: string): Effect.Effect<readonly number[] | undefined, never> =>
  Effect.gen(function* () {
    const aiOption = yield* Effect.serviceOption(AI)
    if (Option.isNone(aiOption)) return undefined

    const result = yield* aiOption.value
      .embed({
        text: semanticPrompt,
        model: CONVERSATION_INTELLIGENCE_EMBEDDING_MODEL,
        dimensions: CONVERSATION_INTELLIGENCE_EMBEDDING_DIMENSIONS,
        inputType: "query",
      })
      .pipe(
        Effect.tapError((error) =>
          Effect.logWarning("session-search: query-side embedding failed; falling back to lexical-only", error),
        ),
        Effect.orElseSucceed(() => undefined),
      )

    return result?.embedding
  })

export const planSessionSearch = (parsed: ParsedSearchQuery): Effect.Effect<SessionSearchPlan, never> =>
  Effect.gen(function* () {
    const queryEmbedding =
      parsed.semanticPrompt.length > 0 ? yield* generateSessionQueryEmbedding(parsed.semanticPrompt) : undefined
    return buildSessionSearchPlan(parsed, queryEmbedding)
  })
