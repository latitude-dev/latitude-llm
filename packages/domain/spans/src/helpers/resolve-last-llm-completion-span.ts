import type { SpanId } from "@domain/shared"
import type { Operation, Span } from "../entities/span.ts"

/**
 * True for spans that represent an LLM generation step (Vercel AI SDK / GenAI map to `chat`;
 * legacy GenAI paths may still emit `text_completion`; native GenAI emitters such as
 * Google ADK emit `generate_content`).
 */
export function isLlmCompletionOperation(operation: Operation): boolean {
  return operation === "chat" || operation === "text_completion" || operation === "generate_content"
}

function compareLlmCompletionSpans(a: Span, b: Span): number {
  const byEnd = b.endTime.getTime() - a.endTime.getTime()
  if (byEnd !== 0) return byEnd
  const byStart = b.startTime.getTime() - a.startTime.getTime()
  if (byStart !== 0) return byStart
  return a.spanId.localeCompare(b.spanId)
}

/**
 * Picks the **latest user-facing** LLM completion span in a trace (by `endTime`,
 * then `startTime`, then `spanId`).
 *
 * When the trace mixes models (agent reply on the primary model, then a sidecar
 * extractor on another), prefer spans that share the earliest non-empty model so
 * post-turn memory/fact extractors do not steal score/annotation pinning.
 */
export function resolveLastLlmCompletionSpanId(spans: readonly Span[]): SpanId | undefined {
  const candidates = spans.filter((s) => isLlmCompletionOperation(s.operation))
  if (candidates.length === 0) {
    return undefined
  }

  const primaryModel = [...candidates]
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    .find((s) => s.model !== "")?.model

  const preferred =
    primaryModel === undefined ? candidates : candidates.filter((s) => s.model === primaryModel || s.model === "")
  const pool = preferred.length > 0 ? preferred : candidates

  const sorted = [...pool].sort(compareLlmCompletionSpans)
  return sorted[0]?.spanId
}
