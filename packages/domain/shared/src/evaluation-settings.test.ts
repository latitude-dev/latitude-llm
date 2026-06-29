import { describe, expect, it } from "vitest"
import { type EvaluationRuleCondition, evaluationSettingsSchema } from "./evaluation-settings.ts"

describe("evaluationSettingsSchema", () => {
  it("parses a judge", () => {
    expect(evaluationSettingsSchema.parse({ kind: "judge", criteria: "x" })).toEqual({ kind: "judge", criteria: "x" })
  })

  it("parses a rule and applies condition + match defaults", () => {
    const parsed = evaluationSettingsSchema.parse({
      kind: "rule",
      conditions: [{ type: "text_match", operator: "contains", value: "hi" }],
    })
    if (parsed.kind !== "rule") throw new Error("expected rule")
    expect(parsed.match).toBe("all")
    const condition = parsed.conditions[0]
    if (condition?.type !== "text_match") throw new Error("expected text_match")
    expect(condition.scope).toBe("last_assistant")
    expect(condition.caseSensitive).toBe(false)
  })

  it("applies metric + output_length defaults", () => {
    const parsed = evaluationSettingsSchema.parse({
      kind: "rule",
      match: "any",
      conditions: [
        { type: "metric", field: "cost", operator: "gt", value: 1 },
        { type: "output_length", operator: "lt", value: 10 },
      ],
    })
    if (parsed.kind !== "rule") throw new Error("expected rule")
    const [metric, length] = parsed.conditions
    expect(metric?.type === "metric" && metric.aggregation).toBe("session")
    expect(length?.type === "output_length" && length.unit).toBe("chars")
  })

  it("accepts every condition type", () => {
    const conditions: EvaluationRuleCondition[] = [
      { type: "text_match", scope: "conversation", operator: "matches_regex", value: "a", caseSensitive: true },
      { type: "empty_output" },
      { type: "output_length", unit: "words", operator: "gte", value: 1 },
      { type: "json_output", expectation: "valid" },
      { type: "metric", field: "duration", aggregation: "anyTrace", operator: "lte", value: 1 },
      { type: "tool_used", toolName: "t" },
      { type: "tool_failed" },
      { type: "tool_call_count", operator: "gt", value: 0 },
      { type: "error" },
      { type: "finish_reason", value: "stop" },
    ]
    expect(evaluationSettingsSchema.safeParse({ kind: "rule", match: "any", conditions }).success).toBe(true)
  })

  it("rejects invalid rules", () => {
    expect(evaluationSettingsSchema.safeParse({ kind: "rule", conditions: [] }).success).toBe(false)
    expect(
      evaluationSettingsSchema.safeParse({ kind: "rule", conditions: Array(11).fill({ type: "error" }) }).success,
    ).toBe(false)
    expect(
      evaluationSettingsSchema.safeParse({
        kind: "rule",
        conditions: [{ type: "text_match", operator: "contains", value: "" }],
      }).success,
    ).toBe(false)
    expect(evaluationSettingsSchema.safeParse({ kind: "rule", conditions: [{ type: "nope" }] }).success).toBe(false)
  })

  it("rejects an invalid regex at parse time but accepts a valid one", () => {
    const bad = evaluationSettingsSchema.safeParse({
      kind: "rule",
      conditions: [{ type: "text_match", operator: "matches_regex", value: "(" }],
    })
    expect(bad.success).toBe(false)
    expect(
      evaluationSettingsSchema.safeParse({
        kind: "rule",
        conditions: [{ type: "text_match", operator: "not_matches_regex", value: "ab.*c" }],
      }).success,
    ).toBe(true)
    // A bad pattern is fine when the operator is a plain substring match — it is never compiled to a RegExp.
    expect(
      evaluationSettingsSchema.safeParse({
        kind: "rule",
        conditions: [{ type: "text_match", operator: "contains", value: "(" }],
      }).success,
    ).toBe(true)
  })

  it("restricts traceCount to the session aggregation", () => {
    expect(
      evaluationSettingsSchema.safeParse({
        kind: "rule",
        conditions: [{ type: "metric", field: "traceCount", aggregation: "anyTrace", operator: "gt", value: 1 }],
      }).success,
    ).toBe(false)
    expect(
      evaluationSettingsSchema.safeParse({
        kind: "rule",
        conditions: [{ type: "metric", field: "traceCount", aggregation: "session", operator: "gt", value: 1 }],
      }).success,
    ).toBe(true)
  })
})
