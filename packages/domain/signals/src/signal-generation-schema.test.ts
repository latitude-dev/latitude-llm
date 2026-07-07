import { describe, expect, it } from "vitest"
import { type GeneratedSignalDraft, mapGeneratedSignalDraft } from "./signal-generation-schema.ts"

type GeneratedRuleCondition = GeneratedSignalDraft["ruleConditions"][number]

const condition = (partial: Partial<GeneratedRuleCondition> & Pick<GeneratedRuleCondition, "type">) =>
  ({
    scope: null,
    textOperator: null,
    text: null,
    caseSensitive: null,
    unit: null,
    comparison: null,
    numberValue: null,
    expectation: null,
    metricField: null,
    aggregation: null,
    toolName: null,
    threshold: null,
    ...partial,
  }) as GeneratedRuleCondition

const emptyFilters: GeneratedSignalDraft["filters"] = {
  tags: [],
  serviceNames: [],
  models: [],
  providers: [],
  metadata: [],
}

const baseDraft: GeneratedSignalDraft = {
  reasoning: "matches the observed cancel_ticket tool",
  confirm: false,
  name: "Cancellation tool failures",
  description: "Sessions where the cancel_ticket tool fails",
  evaluationKind: "rule",
  ruleMatch: "all",
  ruleConditions: [condition({ type: "tool_failed", toolName: "cancel_ticket" })],
  judgeCriteria: "",
  script: "",
  filters: emptyFilters,
  sampling: 100,
}

describe("mapGeneratedSignalDraft", () => {
  it("maps a rule draft with no filters", () => {
    const result = mapGeneratedSignalDraft(baseDraft)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.draft.filters).toBeUndefined()
    expect(result.draft.sampling).toBe(100)
    expect(result.draft.evaluation).toMatchObject({ settings: { kind: "rule", match: "all" } })
  })

  it("maps a judge draft and translates filters onto the builder shape", () => {
    const result = mapGeneratedSignalDraft({
      ...baseDraft,
      name: "Frustrated users",
      evaluationKind: "judge",
      ruleConditions: [],
      judgeCriteria: "A session matches when the user expresses frustration",
      filters: { ...emptyFilters, tags: ["urgent"], metadata: [{ key: "env", value: "prod" }] },
      sampling: 25,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.draft.evaluation).toEqual({
      settings: { kind: "judge", criteria: "A session matches when the user expresses frustration" },
    })
    expect(result.draft.filters).toEqual({
      tags: [{ op: "in", value: ["urgent"] }],
      "metadata.env": [{ op: "eq", value: "prod" }],
    })
    expect(result.draft.sampling).toBe(25)
  })

  it("maps a raw-script draft and clamps out-of-range sampling", () => {
    const result = mapGeneratedSignalDraft({
      ...baseDraft,
      evaluationKind: "script",
      ruleConditions: [],
      script: "return Passed(1, 'ok')",
      sampling: 250,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.draft.evaluation).toEqual({ script: "return Passed(1, 'ok')" })
    expect(result.draft.sampling).toBe(100)
  })

  it("returns issues (never throws) when a rule kind has no conditions", () => {
    const result = mapGeneratedSignalDraft({ ...baseDraft, ruleConditions: [] })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues).toContain("ruleConditions")
  })
})
