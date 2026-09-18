import type { FinishReasonClassification } from "../entities/span-endpoint.ts"

const NORMAL_FINISH_REASONS = new Set(["stop", "end_turn", "stop_sequence", "complete", "completed", "success"])
const CALLER_STOP_FINISH_REASONS = new Set([
  "abort",
  "aborted",
  "cancelled",
  "canceled",
  "user_cancel",
  "user_cancelled",
  "user_canceled",
])
const TOOL_CONTINUATION_FINISH_REASONS = new Set([
  "function_call",
  "function_calls",
  "pause_turn",
  "tool_call",
  "tool_calls",
  "tool_use",
])
const LENGTH_FINISH_REASONS = new Set([
  "length",
  "max_output_tokens",
  "max_token",
  "max_tokens",
  "model_context_window_exceeded",
  "model_length",
])
const CONTENT_FILTER_FINISH_REASONS = new Set([
  "blocklist",
  "content_filter",
  "image_prohibited_content",
  "image_recitation",
  "image_safety",
  "prohibited_content",
  "recitation",
  "safety",
  "spii",
])
const GUARDRAIL_FINISH_REASONS = new Set(["guardrail", "guardrail_intervention", "guardrail_intervened", "model_armor"])
const MALFORMED_FUNCTION_FINISH_REASONS = new Set([
  "malformed_function_call",
  "too_many_tool_calls",
  "unexpected_tool_call",
])
const GENERATION_ERROR_FINISH_REASONS = new Set([
  "error",
  "error_limit",
  "error_toxic",
  "image_other",
  "language",
  "no_image",
])

export const normalizeFinishReason = (rawValue: string): string => {
  const normalized = rawValue
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
  return normalized.startsWith("finish_reason_") ? normalized.slice("finish_reason_".length) : normalized
}

export const classifyFinishReason = (rawValue: string): FinishReasonClassification => {
  const normalizedValue = normalizeFinishReason(rawValue)
  const base = { rawValue, normalizedValue }

  if (NORMAL_FINISH_REASONS.has(normalizedValue)) {
    return { ...base, classification: "clean", kind: "normal" }
  }
  if (CALLER_STOP_FINISH_REASONS.has(normalizedValue)) {
    return { ...base, classification: "clean", kind: "callerStop" }
  }
  if (TOOL_CONTINUATION_FINISH_REASONS.has(normalizedValue)) {
    return { ...base, classification: "clean", kind: "toolContinuation" }
  }
  if (normalizedValue === "refusal") {
    return { ...base, classification: "clean", kind: "refusal" }
  }
  if (LENGTH_FINISH_REASONS.has(normalizedValue)) {
    return { ...base, classification: "unreliable", kind: "length", requiresOutputDamage: true }
  }
  if (CONTENT_FILTER_FINISH_REASONS.has(normalizedValue)) {
    return { ...base, classification: "unreliable", kind: "contentFilter", requiresOutputDamage: false }
  }
  if (GUARDRAIL_FINISH_REASONS.has(normalizedValue)) {
    return { ...base, classification: "unreliable", kind: "guardrail", requiresOutputDamage: false }
  }
  if (MALFORMED_FUNCTION_FINISH_REASONS.has(normalizedValue)) {
    return { ...base, classification: "unreliable", kind: "malformedFunctionCall", requiresOutputDamage: false }
  }
  if (GENERATION_ERROR_FINISH_REASONS.has(normalizedValue)) {
    return { ...base, classification: "unreliable", kind: "generationError", requiresOutputDamage: false }
  }

  return { ...base, classification: "unmapped" }
}
