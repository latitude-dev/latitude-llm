import { z } from "zod"

const messageScopeSchema = z.enum(["last_assistant", "any_assistant", "any_user", "any_tool", "conversation"])
export type MessageScope = z.infer<typeof messageScopeSchema>

const comparisonOperatorSchema = z.enum(["gt", "gte", "lt", "lte"])

const metricFieldSchema = z.enum([
  "duration",
  "cost",
  "tokensTotal",
  "tokensInput",
  "tokensOutput",
  "errorCount",
  "traceCount",
  "spanCount",
])

/**
 * A single deterministic check over the evaluation `session` object. Each condition compiles to a
 * readable, pure (no `llm()`) line in the generated rule script (see `compileSettingsToScript`).
 * `metric.value` is in base units — `duration` ns, `cost` microcents, everything else raw counts —
 * matching what the `session` object exposes (the builder converts friendly units on save).
 */
export const evaluationRuleConditionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text_match"),
    scope: messageScopeSchema.default("last_assistant"),
    operator: z.enum(["contains", "not_contains", "matches_regex", "not_matches_regex"]),
    value: z.string().min(1),
    caseSensitive: z.boolean().default(false),
  }),
  z.object({ type: z.literal("empty_output") }),
  z.object({
    type: z.literal("output_length"),
    unit: z.enum(["chars", "words"]).default("chars"),
    operator: comparisonOperatorSchema,
    value: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal("json_output"), expectation: z.enum(["valid", "invalid"]) }),
  z.object({
    type: z.literal("metric"),
    field: metricFieldSchema,
    aggregation: z.enum(["session", "anyTrace", "allTraces"]).default("session"),
    operator: comparisonOperatorSchema,
    value: z.number().nonnegative(),
  }),
  z.object({ type: z.literal("tool_used"), toolName: z.string().min(1) }),
  z.object({ type: z.literal("tool_failed"), toolName: z.string().min(1).optional() }),
  z.object({
    type: z.literal("tool_call_count"),
    operator: comparisonOperatorSchema,
    value: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal("error") }),
  // Finish reasons are provider-specific raw strings (e.g. "stop", "tool_calls", "length", "end_turn"),
  // so this is a free string rather than a fixed enum.
  z.object({ type: z.literal("finish_reason"), value: z.string().min(1) }),
])
export type EvaluationRuleCondition = z.infer<typeof evaluationRuleConditionSchema>

/**
 * Optional declarative config a user edits in the builder; compiles deterministically to the
 * evaluation's `script`. NULL when the script is hand-written (raw) or GEPA-generated.
 *   - judge — a script that calls `llm(`${session.conversation}` …)`, generated + aligned via optimize-evaluation.
 *   - rule  — deterministic conditions combined with `all`/`any`, compiled to a pure script over `session`.
 */
export const evaluationSettingsSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("judge"), criteria: z.string().min(1) }),
  z.object({
    kind: z.literal("rule"),
    match: z.enum(["all", "any"]).default("all"),
    conditions: z.array(evaluationRuleConditionSchema).min(1).max(10),
  }),
])
export type EvaluationSettings = z.infer<typeof evaluationSettingsSchema>
