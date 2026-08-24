import { OutboxEventWriter } from "@domain/events"
import { ScoreRepository } from "@domain/scores"
import { ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { PROMOTION_WINDOW_DAYS } from "../constants.ts"
import type { Signal } from "../entities/signal.ts"

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

interface QualifySignalForPromotionInput {
  /** Read under the per-signal row lock by the caller, inside the caller's transaction. */
  readonly signal: Signal
  /** Resolved outside the transaction — it reads Redis and ClickHouse. Null when the caller knows the signal is already promoted. */
  readonly threshold: number | null
  readonly at: Date
  /** Null when the evidence came from a consolidation merge rather than one score. */
  readonly triggerScoreId: string | null
}

/**
 * The promotion gate: count the signal's distinct sessions in the window,
 * compare against the volume-scaled threshold, and record that it passed.
 *
 * Runs **inside the caller's transaction and per-signal lock**, so the count
 * includes whatever that transaction just wrote — the score being claimed, or
 * the scores a merge just reassigned. Callers resolve the threshold before
 * opening the transaction; passing it in is what keeps Redis and ClickHouse out
 * of it.
 *
 * Qualifying does not stamp `promoted_at`. A signal has to be named from its
 * whole cluster before it exists for anyone, that is a model call, and a model
 * call cannot run in here — so the latch is stamped downstream by
 * `promoteSignalUseCase` and this only records that the gate passed. Until then
 * every further score re-qualifies and re-emits; the consumer's leading
 * throttle collapses those.
 *
 * The latch is re-checked here before anything is counted, because a promoted
 * signal can hold hundreds of thousands of scores and `scores_signal_lookup_idx`
 * does not cover `session_id`. An unpromoted signal holds at most the threshold,
 * so counting it is trivial.
 */
export const qualifySignalForPromotion = (input: QualifySignalForPromotionInput) =>
  Effect.gen(function* () {
    if (input.signal.promotedAt !== null || input.threshold === null) return false

    const scoreRepository = yield* ScoreRepository
    const sessions = yield* scoreRepository.countDistinctSessionsBySignalId({
      projectId: ProjectId(input.signal.projectId),
      signalId: input.signal.id,
      since: new Date(input.at.getTime() - PROMOTION_WINDOW_DAYS * MILLISECONDS_PER_DAY),
    })
    const qualified = sessions >= input.threshold

    yield* Effect.annotateCurrentSpan("promotion.sessions", sessions)
    yield* Effect.annotateCurrentSpan("promotion.threshold", input.threshold)
    yield* Effect.annotateCurrentSpan("promotion.qualified", qualified)

    if (!qualified) return false

    const outboxEventWriter = yield* OutboxEventWriter
    yield* outboxEventWriter.write({
      eventName: "SignalQualifiedForPromotion",
      aggregateType: "issue",
      aggregateId: input.signal.id,
      organizationId: input.signal.organizationId,
      payload: {
        organizationId: input.signal.organizationId,
        projectId: input.signal.projectId,
        signalId: input.signal.id,
        qualifiedAt: input.at.toISOString(),
        triggerScoreId: input.triggerScoreId,
      },
    })

    return true
  })
