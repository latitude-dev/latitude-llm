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
 * Maps a saved search onto the signal that tracks it. Each query shape becomes the rule that matches
 * what search itself matches (`search-plan.ts`): phrase clauses are search's precision gate, so a
 * query holding any becomes those `text_match` conditions alone; free text on its own becomes a
 * `semantic_similarity` condition at search's relevance floor; an empty query becomes `always`.
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
  // More phrases than a rule holds keeps the first ones: broader than the search, but the signal
  // still gets created.
  const conditions: readonly EvaluationRuleCondition[] =
    phraseConditions.length > 0
      ? phraseConditions.slice(0, EVALUATION_RULE_MAX_CONDITIONS)
      : semanticPrompt.length > 0
        ? [semanticCondition]
        : [{ type: "always" }]

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
    settings: { kind: "rule", match: "all", conditions: [...conditions] },
  }
}
