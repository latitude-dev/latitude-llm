import type { SpanId } from "@domain/shared"
import type { Operation, Span } from "../entities/span.ts"

/**
 * True for spans that represent an LLM generation step (Vercel AI SDK / GenAI map to `chat`;
 * legacy GenAI paths may still emit `text_completion`).
 */
export function isLlmCompletionOperation(operation: Operation): boolean {
  return operation === "chat" || operation === "text_completion"
}

/**
 * Picks the **latest** LLM completion span in a trace (by `endTime`, then `startTime`, then `spanId`).
 * Used when annotations are submitted with only `traceId` and optional `sessionId` / `spanId`.
 */
export function resolveLastLlmCompletionSpanId(spans: readonly Span[]): SpanId | undefined {
  const candidates = spans.filter((s) => isLlmCompletionOperation(s.operation))
  if (candidates.length === 0) {
    return undefined
  }
  const sorted = [...candidates].sort((a, b) => {
    const byEnd = b.endTime.getTime() - a.endTime.getTime()
    if (byEnd !== 0) return byEnd
    const byStart = b.startTime.getTime() - a.startTime.getTime()
    if (byStart !== 0) return byStart
    return a.spanId.localeCompare(b.spanId)
  })
  return sorted[0]?.spanId
}
