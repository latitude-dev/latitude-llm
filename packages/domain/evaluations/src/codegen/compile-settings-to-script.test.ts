import { EVALUATION_CONVERSATION_PLACEHOLDER } from "@domain/evaluations"
import { detectScriptCapabilities } from "@domain/sandbox"
import type { EvaluationRuleCondition, EvaluationSettings } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { compileSettingsToScript } from "./compile-settings-to-script.ts"

describe("compileSettingsToScript", () => {
  it("compiles a judge to an llm-capability script on the present-verdict convention", () => {
    const criteria = "the assistant refuses a valid request"
    const script = compileSettingsToScript({ kind: "judge", criteria })

    expect(script).toContain("await llm(")
    expect(script).toContain(criteria)
    expect(script).toContain("set passed to true")
    expect(detectScriptCapabilities(script)).toContain("llm")
  })

  it("uses the single-sourced judge wrapper (one llm() call, present-verdict return, only the conversation placeholder)", () => {
    const script = compileSettingsToScript({ kind: "judge", criteria: "the response is unhelpful" })

    expect(script).toContain("await llm(")
    expect(script).toContain("return Passed(")
    expect(script).toContain("return Failed(")
    expect(script).toContain(EVALUATION_CONVERSATION_PLACEHOLDER)
    // The only `${...}` interpolation in the generated script is the conversation placeholder.
    const interpolations = script.match(/\$\{[^}]+\}/g) ?? []
    expect(interpolations).toEqual([EVALUATION_CONVERSATION_PLACEHOLDER])
  })

  it("interpolates session.conversation, not the legacy bare conversation global", () => {
    expect(EVALUATION_CONVERSATION_PLACEHOLDER).toBe("${session.conversation}")
    const script = compileSettingsToScript({ kind: "judge", criteria: "x" })
    expect(script).toContain("${session.conversation}")
    expect(script).not.toContain("${conversation}")
  })
})

// The generated rule script is plain ES (RegExp/JSON/String/Array over `session` + Passed/Failed) — it
// runs identically in Node and QuickJS for these pure ops, so we execute it in a Node harness to
// validate the codegen's logic and per-condition feedback. (Real QuickJS binding is covered in PR4a.)
const runRule = (settings: EvaluationSettings, session: unknown): { passed: boolean; feedback: string } => {
  const script = compileSettingsToScript(settings)
  const Passed = (_value?: number, feedback?: string) => ({ passed: true, feedback })
  const Failed = (_value?: number, feedback?: string) => ({ passed: false, feedback })
  const fn = new Function("session", "Passed", "Failed", script)
  return fn(session, Passed, Failed)
}

const makeTrace = (overrides: Record<string, unknown> = {}) => ({
  id: "t1",
  name: "root",
  status: "ok",
  errorCount: 0,
  spanCount: 2,
  duration: 1000,
  timeToFirstToken: 0,
  cost: { input: 1, output: 2, total: 3 },
  tokens: { input: 10, output: 20, total: 30, cacheRead: 0, cacheCreate: 0, reasoning: 0 },
  models: ["gpt-4o"],
  providers: ["openai"],
  finishReasons: ["stop"],
  tools: [{ name: "search", input: "{}", output: "[]", error: false, duration: 5 }],
  ...overrides,
})

const makeSession = (overrides: Record<string, unknown> = {}) => ({
  id: "s",
  traceCount: 1,
  spanCount: 2,
  errorCount: 0,
  duration: 1000,
  timeToFirstToken: 0,
  cost: { input: 1, output: 2, total: 3 },
  tokens: { input: 10, output: 20, total: 30, cacheRead: 0, cacheCreate: 0, reasoning: 0 },
  startTime: "",
  endTime: "",
  userId: "",
  tags: [],
  metadata: {},
  conversation: [
    { role: "user", content: "please refund my order" },
    { role: "assistant", content: "Sure, processing your refund now." },
  ],
  traces: [makeTrace()],
  ...overrides,
})

const rule = (match: "all" | "any", conditions: EvaluationRuleCondition[]): EvaluationSettings => ({
  kind: "rule",
  match,
  conditions,
})

describe("compileSettingsToScript — rule", () => {
  it("compiles a rule to a pure (no-llm) present-verdict script", () => {
    const script = compileSettingsToScript(rule("any", [{ type: "error" }]))
    expect(detectScriptCapabilities(script)).toEqual([])
    expect(script).toContain("return Passed(")
    expect(script).toContain("return Failed(")
    expect(script).not.toContain("llm(")
  })

  it("match:any returns the first satisfied condition's feedback", () => {
    const result = runRule(
      rule("any", [
        { type: "text_match", scope: "last_assistant", operator: "contains", value: "nope", caseSensitive: false },
        { type: "tool_used", toolName: "search" },
      ]),
      makeSession(),
    )
    expect(result.passed).toBe(true)
    expect(result.feedback).toBe('Tool "search" is used')
  })

  it("match:all fails on the first unmet condition with its negated feedback", () => {
    const result = runRule(
      rule("all", [
        { type: "tool_used", toolName: "search" },
        { type: "tool_used", toolName: "delete" },
      ]),
      makeSession(),
    )
    expect(result.passed).toBe(false)
    expect(result.feedback).toBe('Tool "delete" is not used')
  })

  it("match:all passes only when every condition is met", () => {
    const result = runRule(
      rule("all", [
        { type: "tool_used", toolName: "search" },
        { type: "text_match", scope: "last_assistant", operator: "contains", value: "refund", caseSensitive: false },
      ]),
      makeSession(),
    )
    expect(result).toEqual({ passed: true, feedback: "All conditions matched" })
  })

  const cases: ReadonlyArray<{ name: string; condition: EvaluationRuleCondition; session?: unknown; passed: boolean }> =
    [
      {
        name: "text_match regex over conversation",
        condition: {
          type: "text_match",
          scope: "conversation",
          operator: "matches_regex",
          value: "ref.nd",
          caseSensitive: false,
        },
        passed: true,
      },
      {
        name: "text_match case-insensitive contains",
        condition: {
          type: "text_match",
          scope: "last_assistant",
          operator: "contains",
          value: "REFUND",
          caseSensitive: false,
        },
        passed: true,
      },
      {
        name: "empty_output true",
        condition: { type: "empty_output" },
        session: makeSession({ conversation: [{ role: "assistant", content: "   " }] }),
        passed: true,
      },
      { name: "empty_output false", condition: { type: "empty_output" }, passed: false },
      {
        name: "json_output valid",
        condition: { type: "json_output", expectation: "valid" },
        session: makeSession({ conversation: [{ role: "assistant", content: '{"ok":true}' }] }),
        passed: true,
      },
      {
        name: "json_output invalid on prose",
        condition: { type: "json_output", expectation: "invalid" },
        passed: true,
      },
      {
        name: "output_length chars gt",
        condition: { type: "output_length", unit: "chars", operator: "gt", value: 5 },
        passed: true,
      },
      {
        name: "output_length words lt",
        condition: { type: "output_length", unit: "words", operator: "lt", value: 2 },
        session: makeSession({ conversation: [{ role: "assistant", content: "ok" }] }),
        passed: true,
      },
      {
        name: "metric session cost gt",
        condition: { type: "metric", field: "cost", aggregation: "session", operator: "gt", value: 2 },
        passed: true,
      },
      {
        name: "metric anyTrace tokensTotal gte",
        condition: { type: "metric", field: "tokensTotal", aggregation: "anyTrace", operator: "gte", value: 30 },
        passed: true,
      },
      {
        name: "metric allTraces errorCount lte",
        condition: { type: "metric", field: "errorCount", aggregation: "allTraces", operator: "lte", value: 0 },
        passed: true,
      },
      { name: "tool_used miss", condition: { type: "tool_used", toolName: "delete" }, passed: false },
      { name: "tool_failed none", condition: { type: "tool_failed" }, passed: false },
      {
        name: "tool_failed present",
        condition: { type: "tool_failed" },
        session: makeSession({
          traces: [makeTrace({ tools: [{ name: "x", input: "", output: "boom", error: true, duration: 1 }] })],
        }),
        passed: true,
      },
      { name: "tool_call_count gte", condition: { type: "tool_call_count", operator: "gte", value: 1 }, passed: true },
      { name: "error false", condition: { type: "error" }, passed: false },
      { name: "error true", condition: { type: "error" }, session: makeSession({ errorCount: 2 }), passed: true },
      { name: "finish_reason stop", condition: { type: "finish_reason", value: "stop" }, passed: true },
      { name: "finish_reason miss", condition: { type: "finish_reason", value: "content_filter" }, passed: false },
    ]

  it.each(cases)("evaluates $name", ({ condition, session, passed }) => {
    const result = runRule(rule("any", [condition]), session ?? makeSession())
    expect(result.passed).toBe(passed)
  })
})
