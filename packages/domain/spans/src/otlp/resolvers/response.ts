import { fromString, fromStringArray } from "./utils.ts"

const VERCEL_FINISH_REASON: Record<string, string> = {
  "tool-calls": "tool_calls",
  "content-filter": "content_filter",
}

export const responseIdCandidates = [fromString("gen_ai.response.id"), fromString("ai.response.id")]

export const finishReasonsCandidates = [
  fromStringArray("gen_ai.response.finish_reasons"),
  fromString<string[]>("ai.response.finishReason", (v) => [VERCEL_FINISH_REASON[v] ?? v]),
]

export const sessionIdCandidates = [fromString("gen_ai.conversation.id"), fromString("session.id")]
