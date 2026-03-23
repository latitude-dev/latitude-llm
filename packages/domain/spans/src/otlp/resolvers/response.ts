import { fromString, fromStringArray } from "./utils.ts"

const VERCEL_FINISH_REASON: Record<string, string> = {
  "tool-calls": "tool_calls",
  "content-filter": "content_filter",
}

export const responseIdCandidates = [
  fromString("gen_ai.response.id"), // OTEL GenAI semconv
  fromString("ai.response.id"), // Vercel AI SDK
]

export const finishReasonsCandidates = [
  fromStringArray("gen_ai.response.finish_reasons"), // OTEL GenAI semconv
  fromString<string[]>("ai.response.finishReason", (v) => [VERCEL_FINISH_REASON[v] ?? v]), // Vercel AI SDK
]
