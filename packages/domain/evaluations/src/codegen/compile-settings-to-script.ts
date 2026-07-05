import type { EvaluationRuleCondition, EvaluationSettings, MessageScope, MetricField } from "@domain/shared"
import { generateJudgePromptText } from "../alignment/baseline-prompt.ts"
import { wrapPromptAsEvaluationScript } from "./judge-script-template.ts"

/**
 * Deterministically compiles a declarative `EvaluationSettings` into the sandbox `script` that
 * actually executes. The `judge` form reuses the single-sourced baseline judge wrapper; the `rule`
 * form emits a readable, pure (no `llm()`) per-condition script over the `session` object. All scripts
 * run on the shared QuickJS runtime; `validateEvaluationScriptCompiles` guards the result at save time.
 */
export const compileSettingsToScript = (settings: EvaluationSettings): string => {
  switch (settings.kind) {
    case "judge":
      return wrapPromptAsEvaluationScript(generateJudgePromptText(settings.criteria))
    case "rule":
      return compileRuleToScript(settings)
  }
}

// ---------------------------------------------------------------------------
// Rule codegen
// ---------------------------------------------------------------------------

type RuleSettings = Extract<EvaluationSettings, { kind: "rule" }>
type HelperName = "scopeText" | "tools" | "isValidJson" | "wordCount" | "isEmptyOutput"

const OP: Record<"gt" | "gte" | "lt" | "lte", string> = { gt: ">", gte: ">=", lt: "<", lte: "<=" }
const OP_PHRASE: Record<"gt" | "gte" | "lt" | "lte", string> = {
  gt: "greater than",
  gte: "at least",
  lt: "less than",
  lte: "at most",
}
const SCOPE_LABEL: Record<MessageScope, string> = {
  last_assistant: "Last assistant message",
  any_assistant: "Any assistant message",
  any_user: "Any user message",
  any_tool: "Any tool message",
  conversation: "The conversation",
}
const METRIC: Record<MetricField, { session: string; trace: string | null; label: string }> = {
  duration: { session: "session.duration", trace: "t.duration", label: "duration" },
  cost: { session: "session.cost.total", trace: "t.cost.total", label: "cost" },
  tokensTotal: { session: "session.tokens.total", trace: "t.tokens.total", label: "total tokens" },
  tokensInput: { session: "session.tokens.input", trace: "t.tokens.input", label: "input tokens" },
  tokensOutput: { session: "session.tokens.output", trace: "t.tokens.output", label: "output tokens" },
  errorCount: { session: "session.errorCount", trace: "t.errorCount", label: "error count" },
  traceCount: { session: "session.traceCount", trace: null, label: "trace count" },
  spanCount: { session: "session.spanCount", trace: "t.spanCount", label: "span count" },
}

// Helpers are emitted into the generated script verbatim; only the ones a rule references are included.
const RULE_HELPERS: Record<HelperName, string> = {
  scopeText: [
    "const scopeText = (scope) => {",
    "  const messages = session.conversation",
    '  if (scope === "conversation") return messages.map((m) => m.content).join("\\n")',
    '  if (scope === "last_assistant") {',
    '    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "assistant") return messages[i].content',
    '    return ""',
    "  }",
    '  const role = scope === "any_assistant" ? "assistant" : scope === "any_user" ? "user" : "tool"',
    '  return messages.filter((m) => m.role === role).map((m) => m.content).join("\\n")',
    "}",
  ].join("\n"),
  tools: "const tools = session.traces.flatMap((t) => t.tools)",
  isValidJson: "const isValidJson = (text) => {\n  try { JSON.parse(text); return true } catch { return false }\n}",
  wordCount:
    'const wordCount = (text) => {\n  const t = text.trim()\n  return t === "" ? 0 : t.split(/\\s+/).length\n}',
  isEmptyOutput:
    'const isEmptyOutput = (text) => {\n  const t = text.trim()\n  return t === "" || /^(.)\\1*$/.test(t)\n}',
}
const HELPER_ORDER: readonly HelperName[] = ["tools", "scopeText", "isValidJson", "wordCount", "isEmptyOutput"]

const lit = (value: string | number): string => JSON.stringify(value)

interface CompiledCondition {
  readonly expr: string
  readonly positive: string
  readonly negative: string
}

// Builds the boolean expression + a positive/negative description for one condition, recording which
// shared helpers it needs. User strings/numbers cross into the script only via `lit` (JSON literals);
// operators/scopes/fields come from the validated enums, never raw user text in a code position.
const compileCondition = (c: EvaluationRuleCondition, helpers: Set<HelperName>): CompiledCondition => {
  switch (c.type) {
    case "text_match": {
      helpers.add("scopeText")
      const scope = `scopeText(${lit(c.scope)})`
      const label = SCOPE_LABEL[c.scope]
      if (c.operator === "contains" || c.operator === "not_contains") {
        const expr = c.caseSensitive
          ? `${scope}.includes(${lit(c.value)})`
          : `${scope}.toLowerCase().includes(${lit(c.value.toLowerCase())})`
        const yes = `${label} contains ${lit(c.value)}`
        const no = `${label} does not contain ${lit(c.value)}`
        return c.operator === "contains"
          ? { expr, positive: yes, negative: no }
          : { expr: `!(${expr})`, positive: no, negative: yes }
      }
      const expr = `new RegExp(${lit(c.value)}, ${lit(c.caseSensitive ? "" : "i")}).test(${scope})`
      const yes = `${label} matches ${lit(c.value)}`
      const no = `${label} does not match ${lit(c.value)}`
      return c.operator === "matches_regex"
        ? { expr, positive: yes, negative: no }
        : { expr: `!(${expr})`, positive: no, negative: yes }
    }
    case "empty_output": {
      helpers.add("scopeText")
      helpers.add("isEmptyOutput")
      return {
        expr: `isEmptyOutput(scopeText("last_assistant"))`,
        positive: "Output is empty",
        negative: "Output is not empty",
      }
    }
    case "output_length": {
      helpers.add("scopeText")
      let measure: string
      if (c.unit === "words") {
        helpers.add("wordCount")
        measure = `wordCount(scopeText("last_assistant"))`
      } else {
        measure = `scopeText("last_assistant").length`
      }
      return {
        expr: `${measure} ${OP[c.operator]} ${lit(c.value)}`,
        positive: `Output length (${c.unit}) ${OP_PHRASE[c.operator]} ${c.value}`,
        negative: `Output length (${c.unit}) not ${OP_PHRASE[c.operator]} ${c.value}`,
      }
    }
    case "json_output": {
      helpers.add("scopeText")
      helpers.add("isValidJson")
      const valid = `isValidJson(scopeText("last_assistant"))`
      return c.expectation === "valid"
        ? { expr: valid, positive: "Output is valid JSON", negative: "Output is not valid JSON" }
        : { expr: `!(${valid})`, positive: "Output is not valid JSON", negative: "Output is valid JSON" }
    }
    case "metric": {
      const field = METRIC[c.field]
      const aggLabel =
        c.aggregation === "session" ? "Session" : c.aggregation === "anyTrace" ? "Any trace" : "All traces"
      let expr: string
      if (c.aggregation === "session" || field.trace === null) {
        expr = `${field.session} ${OP[c.operator]} ${lit(c.value)}`
      } else if (c.aggregation === "anyTrace") {
        expr = `session.traces.some((t) => ${field.trace} ${OP[c.operator]} ${lit(c.value)})`
      } else {
        // `[].every(...)` is vacuously true; require at least one trace so an empty session is not a pass.
        expr = `session.traces.length > 0 && session.traces.every((t) => ${field.trace} ${OP[c.operator]} ${lit(c.value)})`
      }
      return {
        expr,
        positive: `${aggLabel} ${field.label} ${OP_PHRASE[c.operator]} ${c.value}`,
        negative: `${aggLabel} ${field.label} not ${OP_PHRASE[c.operator]} ${c.value}`,
      }
    }
    case "tool_used": {
      helpers.add("tools")
      return {
        expr: `tools.some((t) => t.name === ${lit(c.toolName)})`,
        positive: `Tool ${lit(c.toolName)} is used`,
        negative: `Tool ${lit(c.toolName)} is not used`,
      }
    }
    case "tool_failed": {
      helpers.add("tools")
      if (c.toolName !== undefined) {
        return {
          expr: `tools.some((t) => t.error && t.name === ${lit(c.toolName)})`,
          positive: `Tool ${lit(c.toolName)} failed`,
          negative: `Tool ${lit(c.toolName)} did not fail`,
        }
      }
      return {
        expr: `tools.some((t) => t.error)`,
        positive: "A tool call failed",
        negative: "No tool call failed",
      }
    }
    case "tool_call_count": {
      helpers.add("tools")
      return {
        expr: `tools.length ${OP[c.operator]} ${lit(c.value)}`,
        positive: `Tool-call count ${OP_PHRASE[c.operator]} ${c.value}`,
        negative: `Tool-call count not ${OP_PHRASE[c.operator]} ${c.value}`,
      }
    }
    case "error":
      return {
        expr: `session.errorCount > 0`,
        positive: "The session has errors",
        negative: "The session has no errors",
      }
    case "finish_reason":
      return {
        expr: `session.traces.some((t) => t.finishReasons.includes(${lit(c.value)}))`,
        positive: `A response finished with ${lit(c.value)}`,
        negative: `No response finished with ${lit(c.value)}`,
      }
    // The only condition that emits `await`: it makes an otherwise-pure rule an `embedding`-capability
    // script (detected via the `semanticSimilarity(` pattern), routing it through the host verb + lane.
    case "semantic_similarity":
      return {
        expr: `(await semanticSimilarity(${lit(c.query)})) ${OP[c.operator]} ${lit(c.threshold)}`,
        positive: `Semantically similar to ${lit(c.query)} (${OP_PHRASE[c.operator]} ${c.threshold})`,
        negative: `Not semantically similar to ${lit(c.query)} (${OP_PHRASE[c.operator]} ${c.threshold})`,
      }
  }
}

const commentSafe = (description: string): string => description.replace(/[\r\n]+/g, " ")

/**
 * Compiles a `rule` settings object into a readable, pure script. Each condition becomes a commented
 * `if`: for `any`, the first satisfied condition returns `Passed` (with that condition's reason); for
 * `all`, the first unmet condition returns `Failed` (with its negated reason). The verdict's feedback
 * therefore names exactly which condition decided it.
 */
const compileRuleToScript = (settings: RuleSettings): string => {
  const helpers = new Set<HelperName>()
  const compiled = settings.conditions.map((condition) => compileCondition(condition, helpers))

  const lines: string[] = [`// Deterministic rule (match: ${settings.match})`]

  const helperBlock = HELPER_ORDER.filter((name) => helpers.has(name)).map((name) => RULE_HELPERS[name])
  if (helperBlock.length > 0) lines.push("", helperBlock.join("\n\n"))

  compiled.forEach(({ expr, positive, negative }, index) => {
    lines.push("", `// condition ${index + 1}: ${commentSafe(positive)}`)
    if (settings.match === "any") {
      lines.push(`if (${expr}) {`, `  return Passed(1, ${lit(positive)})`, "}")
    } else {
      lines.push(`if (!(${expr})) {`, `  return Failed(0, ${lit(negative)})`, "}")
    }
  })

  lines.push(
    "",
    settings.match === "any"
      ? `return Failed(0, "No condition matched")`
      : `return Passed(1, "All conditions matched")`,
  )
  return lines.join("\n")
}
