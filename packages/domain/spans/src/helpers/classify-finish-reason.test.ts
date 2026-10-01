import { describe, expect, it } from "vitest"
import { classifyFinishReason, normalizeFinishReason } from "./classify-finish-reason.ts"

describe("classifyFinishReason", () => {
  it.each([
    ["stop", "normal"],
    ["end_turn", "normal"],
    ["stop_sequence", "normal"],
    ["tool_calls", "toolContinuation"],
    ["tool-calls", "toolContinuation"],
    ["tool_use", "toolContinuation"],
    ["pause_turn", "toolContinuation"],
    ["refusal", "refusal"],
    ["cancelled", "callerStop"],
  ] as const)("maps clean finish reason %s to %s", (rawValue, kind) => {
    expect(classifyFinishReason(rawValue)).toMatchObject({ classification: "clean", kind })
  })

  it.each([
    ["content_filter", "contentFilter"],
    ["SAFETY", "contentFilter"],
    ["MODEL_ARMOR", "guardrail"],
    ["MALFORMED_FUNCTION_CALL", "malformedFunctionCall"],
    ["error", "generationError"],
  ] as const)("maps unreliable finish reason %s to %s without a damage prerequisite", (rawValue, kind) => {
    expect(classifyFinishReason(rawValue)).toMatchObject({
      classification: "unreliable",
      kind,
      requiresOutputDamage: false,
    })
  })

  it.each([
    "length",
    "max_tokens",
    "MAX_TOKENS",
    "FINISH_REASON_MAX_TOKENS",
    "model_length",
  ])("requires output damage before treating length reason %s as a failure", (rawValue) => {
    expect(classifyFinishReason(rawValue)).toMatchObject({
      classification: "unreliable",
      kind: "length",
      requiresOutputDamage: true,
    })
  })

  it("preserves unknown raw values as unmapped", () => {
    expect(classifyFinishReason("Future.Provider_Value")).toEqual({
      rawValue: "Future.Provider_Value",
      normalizedValue: "future.provider_value",
      classification: "unmapped",
    })
  })

  it("normalizes case, separators, and the Google enum prefix", () => {
    expect(normalizeFinishReason("  FINISH-REASON-MAX TOKENS ")).toBe("max_tokens")
  })
})
