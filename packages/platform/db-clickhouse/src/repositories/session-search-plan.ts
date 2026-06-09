import { AI } from "@domain/ai"
import {
  CONVERSATION_INTELLIGENCE_EMBEDDING_DIMENSIONS,
  CONVERSATION_INTELLIGENCE_EMBEDDING_MODEL,
} from "@domain/conversation-intelligence"
import {
  normalizeLiteralPhrase,
  type ParsedSearchQuery,
  TRACE_SEARCH_MIN_RELEVANCE_SCORE,
  tokenizePhrase,
} from "@domain/spans"
import { Effect, Option } from "effect"

/**
 * Session semantic search scans conversation-intelligence moments instead of
 * trace-search chunks. The cap bounds the cosine scan before the read path
 * fetches matching sessions.
 */
const SESSION_SEMANTIC_MOMENT_SCAN_LIMIT = 30_000

function escapeLikePattern(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

function buildSessionLexicalSubquery(parsed: ParsedSearchQuery): {
  subquery: string
  params: Record<string, unknown>
} {
  const literalPhrases = parsed.literalPhrases.map(normalizeLiteralPhrase)
  const tokenized = parsed.tokenPhrases.map(tokenizePhrase)
  const matchNothing =
    literalPhrases.some((phrase) => phrase.length === 0) || tokenized.some((tokens) => tokens.length === 0)

  if (matchNothing) {
    return {
      subquery: `SELECT
                   session_id,
                   0.0 AS relevance_score,
                   CAST(NULL AS Nullable(UInt32)) AS matched_first_message_index,
                   CAST(NULL AS Nullable(UInt32)) AS matched_last_message_index
                 FROM session_search_documents
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
    subquery: `SELECT
                 session_id,
                 0.0 AS relevance_score,
                 CAST(NULL AS Nullable(UInt32)) AS matched_first_message_index,
                 CAST(NULL AS Nullable(UInt32)) AS matched_last_message_index
               FROM session_search_documents
               WHERE organization_id = {organizationId:String}
                 AND project_id = {projectId:String}
                 ${phraseClause}`,
    params,
  }
}

function buildSessionSemanticSubquery(queryEmbedding: readonly number[]): {
  subquery: string
  params: Record<string, unknown>
} {
  return {
    subquery: `SELECT
                session_id,
                max(score) AS relevance_score,
                argMax(first_message_index, score) AS matched_first_message_index,
                argMax(last_message_index, score) AS matched_last_message_index
              FROM (
                SELECT
                  session_id,
                  (1 - cosineDistance(embedding, {queryEmbedding:Array(Float32)})) AS score,
                  first_message_index,
                  last_message_index
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
                ORDER BY score DESC
                LIMIT {semanticMomentScanLimit:UInt32}
              )
              GROUP BY session_id`,
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
    const lex = buildSessionLexicalSubquery(parsed)
    return {
      ranked: false,
      subquery: lex.subquery,
      params: lex.params,
    }
  }

  if (!hasPhrases && hasSemantic) {
    if (!hasEmbedding) {
      return {
        ranked: true,
        subquery: `SELECT
                     session_id,
                     0.0 AS relevance_score,
                     CAST(NULL AS Nullable(UInt32)) AS matched_first_message_index,
                     CAST(NULL AS Nullable(UInt32)) AS matched_last_message_index
                   FROM session_search_documents
                   WHERE organization_id = {organizationId:String}
                     AND project_id = {projectId:String}
                     AND 0`,
        params: {},
      }
    }
    const sem = buildSessionSemanticSubquery(queryEmbedding)
    return {
      ranked: true,
      subquery: `SELECT
                   session_id,
                   relevance_score,
                   matched_first_message_index,
                   matched_last_message_index
                 FROM (${sem.subquery})
                 WHERE relevance_score >= {minRelevanceScore:Float64}`,
      params: {
        ...sem.params,
        minRelevanceScore: TRACE_SEARCH_MIN_RELEVANCE_SCORE,
      },
    }
  }

  const lex = buildSessionLexicalSubquery(parsed)
  if (!hasEmbedding) {
    return {
      ranked: false,
      subquery: lex.subquery,
      params: lex.params,
    }
  }

  const sem = buildSessionSemanticSubquery(queryEmbedding)
  return {
    ranked: true,
    subquery: `SELECT lex.session_id AS session_id,
                      max(coalesce(sem.relevance_score, 0.0)) AS relevance_score,
                      argMax(sem.matched_first_message_index, coalesce(sem.relevance_score, 0.0)) AS matched_first_message_index,
                      argMax(sem.matched_last_message_index, coalesce(sem.relevance_score, 0.0)) AS matched_last_message_index
               FROM (${lex.subquery}) AS lex
               LEFT JOIN (${sem.subquery}) AS sem
                 ON lex.session_id = sem.session_id
               GROUP BY lex.session_id`,
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
