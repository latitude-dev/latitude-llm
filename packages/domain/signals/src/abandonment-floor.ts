import type { SignalPriority } from "./entities/signal.ts"

/**
 * Deterministic detectors whose match describes something a user can be failed
 * by, so a session abandoned afterwards is plausibly abandoned *because* of it.
 *
 * `low-cache-hit-rate` is deliberately absent. It is a cost observation, and the
 * correlation it shows with abandonment is almost certainly length: long
 * expensive sessions have poor cache hit rates and also get abandoned more, with
 * no causal path between the two.
 */
const FAILURE_MODE_DETECTORS: ReadonlySet<string> = new Set([
  "tool-call-errors",
  "output-schema-validation",
  "empty-response",
])

/**
 * Level a deterministic detector's signal is floored at once a user has been
 * seen abandoning a session after it fired.
 *
 * `medium` rather than `high`: it clears the "leave the rest low" bar without
 * claiming urgency, and volume can still take it higher from there. Nothing
 * calibrates this yet — no signal in this population has ever been human-rated —
 * so it is deliberately the least aggressive level that changes anything.
 */
const ABANDONMENT_FLOOR: SignalPriority = "medium"

export interface AbandonmentOccurrence {
  readonly sessionId: string
  /** `metadata.flaggerSlug`; absent for human annotations and evaluations. */
  readonly flaggerSlug: string | undefined
  /** `metadata.messageIndex` — where in the conversation the detector matched. */
  readonly messageIndex: number | undefined
}

export interface AbandonmentFloorInput {
  readonly occurrences: readonly AbandonmentOccurrence[]
  /** Session id → index of the earliest message the user was seen abandoning at. */
  readonly abandonmentIndexBySession: ReadonlyMap<string, number>
}

/**
 * The floor a deterministic detector's signal earns from users walking away
 * after it fired, or null when nothing does.
 *
 * These signals are the one population with no severity input at all: they are
 * created at `low`, never rated by a model, and only volume moves them. That is
 * correct — the check already established what happened, and asking a model
 * anyway agreed with human triage on none of the production signals it opened.
 * But it leaves them with nothing to distinguish a tool error the agent shrugged
 * off from one that made somebody give up, and the feedback text cannot tell them
 * apart: `Tool "x" returned error: ...` reads identically either way. Session
 * outcome is the only thing that separates them, and it is a measurement.
 *
 * Requires the abandonment to come at or after the matched message. Mere
 * co-occurrence would also count a user who gave up over something unrelated
 * before the tool ever failed. When the detector recorded no message index there
 * is no ordering to check, so no floor is applied — the evidence for this is thin
 * enough (26 signals, none human-rated) that the strict reading is the right
 * default.
 */
export const abandonmentFloor = (input: AbandonmentFloorInput): SignalPriority | null => {
  for (const occurrence of input.occurrences) {
    if (occurrence.flaggerSlug === undefined || !FAILURE_MODE_DETECTORS.has(occurrence.flaggerSlug)) continue
    if (occurrence.messageIndex === undefined) continue
    const abandonedAt = input.abandonmentIndexBySession.get(occurrence.sessionId)
    if (abandonedAt !== undefined && abandonedAt >= occurrence.messageIndex) return ABANDONMENT_FLOOR
  }
  return null
}
