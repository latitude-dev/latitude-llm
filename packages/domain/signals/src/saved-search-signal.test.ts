import { EVALUATION_RULE_MAX_CONDITIONS } from "@domain/shared"
import { TRACE_SEARCH_MIN_RELEVANCE_SCORE } from "@domain/spans"
import { describe, expect, it } from "vitest"
import { SIGNAL_NAME_MAX_LENGTH } from "./constants.ts"
import { savedSearchSignalDraft } from "./saved-search-signal.ts"

const ruleConditions = (draft: ReturnType<typeof savedSearchSignalDraft>) => {
  if (draft.settings.kind !== "rule") throw new Error("expected a rule")
  return draft.settings
}

describe("savedSearchSignalDraft", () => {
  it("matches every session in scope when the search has no query", () => {
    const draft = savedSearchSignalDraft({
      name: "Failed payments",
      query: null,
      filterSet: { tags: [{ op: "in", value: ["checkout"] }] },
    })

    expect(ruleConditions(draft)).toEqual({ kind: "rule", match: "all", conditions: [{ type: "always" }] })
    expect(draft.filters).toEqual({ tags: [{ op: "in", value: ["checkout"] }] })
    expect(draft.name).toBe("Failed payments")
    expect(draft.description).toBe("Sessions matching the saved search “Failed payments”.")
  })

  // Search admits a semantic-only match at `TRACE_SEARCH_MIN_RELEVANCE_SCORE`; a higher floor here
  // would leave sessions the saved search lists untracked.
  it("maps free text to a semantic-similarity condition at search's own relevance floor", () => {
    const draft = savedSearchSignalDraft({ name: "Angry users", query: "customer is frustrated", filterSet: {} })

    expect(ruleConditions(draft).conditions).toEqual([
      {
        type: "semantic_similarity",
        query: "customer is frustrated",
        operator: "gte",
        threshold: TRACE_SEARCH_MIN_RELEVANCE_SCORE,
      },
    ])
    expect(draft.filters).toBeNull()
  })

  it("maps quoted phrases case-sensitively and backtick phrases case-insensitively", () => {
    const draft = savedSearchSignalDraft({
      name: "Auth errors",
      query: '"401 Unauthorized" `Refund payment failed`',
      filterSet: {},
    })

    expect(ruleConditions(draft).conditions).toEqual([
      {
        type: "text_match",
        scope: "conversation",
        operator: "contains",
        value: "401 Unauthorized",
        caseSensitive: true,
      },
      {
        type: "text_match",
        scope: "conversation",
        operator: "contains",
        value: "Refund payment failed",
        caseSensitive: false,
      },
    ])
  })

  // In a mixed query the phrases are search's precision gate and similarity only ranks the hits
  // (`search-plan.ts` applies no semantic floor), so the rule is the phrases under match:all.
  it("keeps only the phrase clauses when a query mixes them with free text", () => {
    const draft = savedSearchSignalDraft({
      name: "Mixed",
      query: 'refund loop "401" `payment failed`',
      filterSet: {},
    })
    const settings = ruleConditions(draft)

    expect(settings.match).toBe("all")
    expect(settings.conditions).toEqual([
      { type: "text_match", scope: "conversation", operator: "contains", value: "401", caseSensitive: true },
      {
        type: "text_match",
        scope: "conversation",
        operator: "contains",
        value: "payment failed",
        caseSensitive: false,
      },
    ])
  })

  it("caps the conditions a query with more phrases than a rule holds expands to", () => {
    const query = Array.from({ length: EVALUATION_RULE_MAX_CONDITIONS + 3 }, (_, i) => `"phrase ${i}"`).join(" ")
    const draft = savedSearchSignalDraft({ name: "Many phrases", query, filterSet: {} })

    expect(ruleConditions(draft).conditions).toHaveLength(EVALUATION_RULE_MAX_CONDITIONS)
  })

  it("drops the search's time window from the signal scope", () => {
    const draft = savedSearchSignalDraft({
      name: "Last week",
      query: null,
      filterSet: {
        startTime: [{ op: "gte", value: "2026-01-01T00:00:00.000Z" }],
        endTime: [{ op: "lte", value: "2026-01-08T00:00:00.000Z" }],
        models: [{ op: "in", value: ["gpt-4o"] }],
      },
    })

    expect(draft.filters).toEqual({ models: [{ op: "in", value: ["gpt-4o"] }] })
  })

  it("drops keys the detector could not gate on: session-only and score-derived", () => {
    const draft = savedSearchSignalDraft({
      name: "Frustrated checkout",
      query: null,
      filterSet: {
        moments: [{ op: "in", value: ["user_frustration"] }],
        topics: [{ op: "in", value: ["t1"] }],
        hasLlmActivity: [{ op: "eq", value: false }],
        "score.passed": [{ op: "eq", value: false }],
        "score.annotatorId": [{ op: "neq", value: "" }],
        tags: [{ op: "in", value: ["checkout"] }],
      },
    })

    expect(draft.filters).toEqual({ tags: [{ op: "in", value: ["checkout"] }] })
  })

  it("leaves the scope unset when the search only carries a time window", () => {
    const draft = savedSearchSignalDraft({
      name: "Yesterday",
      query: "timeouts",
      filterSet: { startTime: [{ op: "gte", value: "2026-01-01T00:00:00.000Z" }] },
    })

    expect(draft.filters).toBeNull()
  })

  it("truncates the name to the signal limit", () => {
    const draft = savedSearchSignalDraft({ name: "n".repeat(SIGNAL_NAME_MAX_LENGTH + 20), query: null, filterSet: {} })

    expect(draft.name).toHaveLength(SIGNAL_NAME_MAX_LENGTH)
  })
})
