import type { SpanId, TraceId } from "@domain/shared"

/** One generation's stored content payload, as a candidate for a budgeted content read. */
export interface GenerationContentCandidate {
  readonly sessionKey: string
  readonly traceId: TraceId
  readonly spanId: SpanId
  readonly startTime: Date
  readonly bytes: number
}

export interface GenerationContentBudget {
  readonly perSessionBytes: number
  readonly totalBytes: number
}

const compareCandidates = (left: GenerationContentCandidate, right: GenerationContentCandidate): number =>
  left.sessionKey.localeCompare(right.sessionKey) ||
  left.startTime.getTime() - right.startTime.getTime() ||
  (left.traceId as string).localeCompare(right.traceId as string) ||
  (left.spanId as string).localeCompare(right.spanId as string)

/**
 * The content payloads a batch read may load without going resident on the whole window.
 *
 * First fit in session-then-chronological order: a payload too large for the remaining per-session
 * or total budget is skipped rather than ending its session, so one outsized prompt cannot hide
 * every later generation. Skipped payloads stay observable as truncated content, never as absent.
 */
export const selectGenerationContentWithinBudget = ({
  candidates,
  budget,
}: {
  readonly candidates: readonly GenerationContentCandidate[]
  readonly budget: GenerationContentBudget
}): GenerationContentCandidate[] => {
  const selected: GenerationContentCandidate[] = []
  const spentBySession = new Map<string, number>()
  let spentTotal = 0

  for (const candidate of [...candidates].sort(compareCandidates)) {
    if (candidate.bytes <= 0) continue
    const spentSession = spentBySession.get(candidate.sessionKey) ?? 0
    if (spentSession + candidate.bytes > budget.perSessionBytes) continue
    if (spentTotal + candidate.bytes > budget.totalBytes) continue
    spentBySession.set(candidate.sessionKey, spentSession + candidate.bytes)
    spentTotal += candidate.bytes
    selected.push(candidate)
  }

  return selected
}
