import type { OpenClawLlmUsage } from "./types.ts"

export type AttrValue = string | number | boolean | unknown[] | Record<string, unknown> | undefined
export type AttrInput = Record<string, AttrValue>

/** Shape of `usage` on an OpenClaw transcript assistant message (pi-ai `Usage`). */
export interface TranscriptUsage {
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
  totalTokens?: number
  reasoningTokens?: number
  cost?: {
    input?: number
    output?: number
    cacheRead?: number
    cacheWrite?: number
    total?: number
    totalOrigin?: string
  }
}

export interface TranscriptAssistant {
  role: "assistant"
  content?: unknown[]
  provider?: string
  model?: string
  responseModel?: string
  responseId?: string
  usage?: TranscriptUsage
  stopReason?: string
  errorMessage?: string
  timestamp?: number
}

export function isTranscriptAssistant(raw: unknown): raw is TranscriptAssistant {
  return !!raw && typeof raw === "object" && (raw as { role?: unknown }).role === "assistant"
}

const FINISH_REASONS: Record<string, string> = {
  stop: "stop",
  length: "length",
  toolUse: "tool_calls",
  error: "error",
  aborted: "cancelled",
}

export function finishReason(stopReason: string | undefined): string | undefined {
  if (!stopReason) return undefined
  return FINISH_REASONS[stopReason] ?? stopReason
}

/**
 * `gen_ai.usage.*` from a transcript message. `output_tokens` stays inclusive
 * of reasoning: Latitude's resolver subtracts `reasoning_tokens` itself.
 */
export function usageAttrsFromTranscript(usage: TranscriptUsage | undefined): AttrInput {
  if (!usage) return {}
  const input = num(usage.input)
  const output = num(usage.output)
  const cacheRead = num(usage.cacheRead)
  const cacheWrite = num(usage.cacheWrite)
  const total = num(usage.totalTokens) ?? sumDefined(input, output, cacheRead, cacheWrite)
  return {
    "gen_ai.usage.input_tokens": input,
    "gen_ai.usage.output_tokens": output,
    "gen_ai.usage.cache_read.input_tokens": cacheRead,
    "gen_ai.usage.cache_creation.input_tokens": cacheWrite,
    "gen_ai.usage.reasoning_tokens": num(usage.reasoningTokens),
    "gen_ai.usage.total_tokens": total,
    ...costAttrs(usage.cost),
  }
}

/** Attempt-aggregate usage from `llm_output`, same keys. */
export function usageAttrsFromAggregate(usage: OpenClawLlmUsage | undefined): AttrInput {
  if (!usage) return {}
  const input = num(usage.input)
  const output = num(usage.output)
  const cacheRead = num(usage.cacheRead)
  const cacheWrite = num(usage.cacheWrite)
  return {
    "gen_ai.usage.input_tokens": input,
    "gen_ai.usage.output_tokens": output,
    "gen_ai.usage.cache_read.input_tokens": cacheRead,
    "gen_ai.usage.cache_creation.input_tokens": cacheWrite,
    "gen_ai.usage.total_tokens": num(usage.total) ?? sumDefined(input, output, cacheRead, cacheWrite),
  }
}

/**
 * OpenClaw prices every call from its own model catalog (or the provider's
 * bill when `totalOrigin` says so). A positive total is reported as the span's
 * cost so a model missing from Latitude's catalog still carries a price.
 */
function costAttrs(cost: TranscriptUsage["cost"]): AttrInput {
  if (!cost) return {}
  const total = num(cost.total)
  if (total === undefined || total <= 0) return {}
  const inputSide = sumDefined(num(cost.input), num(cost.cacheRead), num(cost.cacheWrite))
  return {
    "gen_ai.usage.cost": total,
    "gen_ai.usage.input_cost": inputSide,
    "gen_ai.usage.output_cost": num(cost.output),
    "openclaw.cost.origin": cost.totalOrigin === "provider-billed" ? "provider-billed" : "catalog",
  }
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function sumDefined(...values: Array<number | undefined>): number | undefined {
  const defined = values.filter((v): v is number => v !== undefined)
  if (defined.length === 0) return undefined
  return defined.reduce((a, b) => a + b, 0)
}
