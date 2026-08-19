import { useEffect, useRef } from "react"
import { useScoresBySession } from "../../../../../../domains/scores/scores.collection.ts"
import type { ScoreRecord } from "../../../../../../domains/scores/scores.functions.ts"

/**
 * The signal's newest score in this session that pinpoints a message. Only
 * annotations carry anchors, so a signal detected purely by an evaluation
 * resolves to null.
 */
export function findAnchoredSignalScore({
  scores,
  signalId,
}: {
  readonly scores: readonly ScoreRecord[]
  readonly signalId: string
}): ScoreRecord | null {
  return (
    scores
      .filter(
        (score) =>
          score.source === "annotation" &&
          score.signalId === signalId &&
          score.traceId !== null &&
          score.metadata.messageIndex !== undefined,
      )
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null
  )
}

/**
 * Focuses the anchored score a signal recorded in the session, once. Used when
 * the session panel is opened from a signal so it lands where the signal
 * actually occurred instead of at the top of the conversation.
 *
 * `canFocus` is read when the scores land rather than at mount, so a panel that
 * has meanwhile slid into a trace or signal slot is left where the user put it.
 */
export function useFocusSignalScore({
  projectId,
  signalId,
  traceIds,
  canFocus,
  onFocus,
}: {
  readonly projectId: string
  readonly signalId: string | undefined
  readonly traceIds: readonly string[]
  readonly canFocus: boolean
  readonly onFocus: (score: ScoreRecord) => void
}): void {
  // Callers resolve a signal slug to an id and pass "" until it lands, so an empty
  // id means "no signal yet" rather than "every signal".
  const activeSignalId = signalId !== undefined && signalId.length > 0 ? signalId : undefined
  // Scoped to the signal: a session can hold more scores than one page returns,
  // and the anchored one is often not among the newest.
  const { data } = useScoresBySession({
    projectId,
    traceIds,
    ...(activeSignalId !== undefined ? { signalId: activeSignalId } : {}),
    enabled: activeSignalId !== undefined,
  })
  const onFocusRef = useRef(onFocus)
  onFocusRef.current = onFocus
  const focusedSignalIdRef = useRef<string | null>(null)

  // TODO(frontend-use-effect-policy): the session's scores arrive asynchronously,
  // long after the drawer mounted, and there is no event at the arrival site.
  useEffect(() => {
    if (!activeSignalId || focusedSignalIdRef.current === activeSignalId || !data) return
    focusedSignalIdRef.current = activeSignalId
    if (!canFocus) return
    const score = findAnchoredSignalScore({ scores: data.items, signalId: activeSignalId })
    if (score) onFocusRef.current(score)
  }, [canFocus, data, activeSignalId])
}
