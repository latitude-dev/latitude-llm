export interface TraceTimeRef {
  readonly traceId: string
  readonly startTime: string
}

const MIN_TRACES = 8
const TRACE_BUFFER = 4

/**
 * Oldest-first subset of session traces whose message-bearing spans are worth
 * fetching to attribute the currently loaded conversation prefix.
 *
 * Conversation chunks load from the start; early messages almost always come
 * from early traces. Scale the fetch with loaded/total and keep a buffer so
 * short multi-trace openings are covered without pulling the whole session.
 */
export function selectTracesForLoadedConversation({
  traces,
  loadedMessageCount,
  totalMessages,
}: {
  readonly traces: readonly TraceTimeRef[]
  readonly loadedMessageCount: number
  readonly totalMessages: number
}): readonly TraceTimeRef[] {
  if (loadedMessageCount <= 0 || traces.length === 0) return []

  const oldestFirst = [...traces].sort(
    (a, b) => a.startTime.localeCompare(b.startTime) || a.traceId.localeCompare(b.traceId),
  )

  if (totalMessages > 0 && loadedMessageCount >= totalMessages) return oldestFirst

  const fraction = totalMessages > 0 ? Math.min(1, loadedMessageCount / totalMessages) : 1
  const count = Math.min(
    oldestFirst.length,
    Math.max(MIN_TRACES, Math.ceil(fraction * oldestFirst.length) + TRACE_BUFFER),
  )
  return oldestFirst.slice(0, count)
}
