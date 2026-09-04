import {
  EVALUATION_RULE_MAX_CONDITIONS,
  type EvaluationRuleCondition,
  type EvaluationSettings,
  type FilterCondition,
  type FilterSet,
  isTraceFilterFieldName,
  SCORE_FILTER_FIELDS,
  TRACE_TIME_FILTER_FIELDS,
} from "@domain/shared"
import { parseSearchQuery, TRACE_SEARCH_MIN_RELEVANCE_SCORE } from "@domain/spans"
import { SIGNAL_NAME_MAX_LENGTH } from "./constants.ts"

export interface SavedSearchSignalDraft {
  readonly name: string
  readonly description: string
  readonly filters: FilterSet | null
  readonly settings: EvaluationSettings
}

/**
 * Maps a saved search onto the signal that tracks it: every clause of the query becomes a condition,
 * `"literal"` and `` `phrase` `` a `text_match`, free text a `semantic_similarity` one, an empty
 * query `always`. The similarity threshold is search's own relevance floor, the cosine a
 * semantic-only search admits a match at, so the signal does not silently sit stricter than the
 * search it came from. (Search itself applies no floor once a phrase is present — it ranks by
 * similarity instead — but a detector has no ranking, so its choice is predicate or discard.)
 *
 * The scope keeps only keys the live pre-gate can act on: the date picker's absolute window would
 * freeze a detector that keeps running, session-only keys never reach the trace query it matches on,
 * and `score.*` would gate on scores this signal's own evaluation has yet to write.
 */
export const savedSearchSignalDraft = (input: {
  readonly name: string
  readonly query: string | null
  readonly filterSet: FilterSet
}): SavedSearchSignalDraft => {
  const name = input.name.trim()
  const { literalPhrases, tokenPhrases, semanticPrompt } = parseSearchQuery(input.query ?? "")

  const textMatch = (value: string, caseSensitive: boolean): EvaluationRuleCondition => ({
    type: "text_match",
    scope: "conversation",
    operator: "contains",
    value,
    caseSensitive,
  })
  const phraseConditions: EvaluationRuleCondition[] = [
    ...literalPhrases.map((phrase) => textMatch(phrase, true)),
    ...tokenPhrases.map((phrase) => textMatch(phrase, false)),
  ]
  const semanticCondition: EvaluationRuleCondition = {
    type: "semantic_similarity",
    query: semanticPrompt,
    operator: "gte",
    threshold: TRACE_SEARCH_MIN_RELEVANCE_SCORE,
  }
  const hasSemantic = semanticPrompt.length > 0
  // More phrases than a rule holds keeps the first ones (broader than the search, but the signal
  // still gets created); the free-text clause keeps its slot rather than losing it to phrase order.
  const phraseLimit = EVALUATION_RULE_MAX_CONDITIONS - (hasSemantic ? 1 : 0)
  const conditions: readonly EvaluationRuleCondition[] = [
    ...phraseConditions.slice(0, phraseLimit),
    ...(hasSemantic ? [semanticCondition] : []),
  ]

  const scoped: Record<string, readonly FilterCondition[]> = {}
  for (const [field, filterConditions] of Object.entries(input.filterSet)) {
    if (!isTraceFilterFieldName(field)) continue
    if (TRACE_TIME_FILTER_FIELDS.includes(field as never)) continue
    if (SCORE_FILTER_FIELDS.includes(field as never)) continue
    scoped[field] = filterConditions
  }

  return {
    name: name.slice(0, SIGNAL_NAME_MAX_LENGTH),
    description: `Sessions matching the saved search “${name}”.`,
    filters: Object.keys(scoped).length > 0 ? scoped : null,
    settings: {
      kind: "rule",
      match: "all",
      conditions: conditions.length > 0 ? [...conditions] : [{ type: "always" }],
    },
  }
}
