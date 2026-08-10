import { stringAttr } from "../attributes.ts"
import { attrsFromMetadata, first, fromString, fromStringArray } from "./utils.ts"

const VERCEL_FINISH_REASON: Record<string, string> = {
  "tool-calls": "tool_calls",
  "content-filter": "content_filter",
}

export const responseIdCandidates = [
  fromString("gen_ai.response.id"), // OTEL GenAI semconv
  fromString("ai.response.id"), // Vercel AI SDK
]

/**
 * The provider's own id for the response, from a source's metadata map.
 *
 * The candidates run first, so a span that reached the vendor over OTLP resolves by the same list a
 * live span does. `response_id` and `responseId` follow: neither is an OTEL attribute name, so
 * neither belongs in the list above — they are what a caller writes by hand into a metadata map.
 */
export function resolveResponseIdFromMetadata(metadata: Record<string, unknown> | null | undefined): string {
  const attrs = attrsFromMetadata(metadata)
  return first(responseIdCandidates, attrs) ?? stringAttr(attrs, "response_id") ?? stringAttr(attrs, "responseId") ?? ""
}

export const finishReasonsCandidates = [
  fromStringArray("gen_ai.response.finish_reasons"), // OTEL GenAI semconv
  fromString<string[]>("ai.response.finishReason", (v) => [VERCEL_FINISH_REASON[v] ?? v]), // Vercel AI SDK
  fromString<string[]>("llm.finish_reason", (v) => [v]), // OpenInference / Arize Phoenix (already snake_case)
]
