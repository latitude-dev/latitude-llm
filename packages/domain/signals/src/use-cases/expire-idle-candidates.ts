import type { RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { CANDIDATE_EXPIRY_IDLE_DAYS, CANDIDATE_EXPIRY_SWEEP_LIMIT } from "../constants.ts"
import { SignalRepository } from "../ports/signal-repository.ts"

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

export interface ExpireIdleCandidatesResult {
  readonly expired: number
}

/**
 * Sweep side of candidate expiry: soft-delete the candidates that stopped
 * accumulating, so the corpus discovery scans exactly — every `signals` row
 * carries a 2048-dim centroid and there is no ANN index by design — stops
 * growing on clusters nobody will ever see.
 *
 * Idle is measured from `clustered_at`, the anchor the centroid itself decays
 * from, rather than `updated_at`, which a throttled refresh also bumps. The
 * window sits comfortably past `PROMOTION_WINDOW_DAYS` because promotion is only
 * ever evaluated on score assignment: a candidate idle for a full window is
 * provably dead, and the grace beyond it keeps a late score clustering into the
 * existing candidate instead of starting a fresh one.
 *
 * Much simpler than the escalation sweep it is modelled on — a stamp with no
 * event, no cascade and no per-signal fan-out, because an unpromoted signal has
 * no consequences to unwind.
 */
export const expireIdleCandidatesUseCase = () =>
  Effect.gen(function* () {
    const signalRepository = yield* SignalRepository
    const now = new Date()
    const idleBefore = new Date(now.getTime() - CANDIDATE_EXPIRY_IDLE_DAYS * MILLISECONDS_PER_DAY)

    const expired = yield* signalRepository.expireIdleCandidates({
      idleBefore,
      now,
      limit: CANDIDATE_EXPIRY_SWEEP_LIMIT,
    })

    yield* Effect.annotateCurrentSpan("expiry.expired", expired)
    yield* Effect.annotateCurrentSpan("expiry.capped", expired === CANDIDATE_EXPIRY_SWEEP_LIMIT)

    return { expired } satisfies ExpireIdleCandidatesResult
  }).pipe(Effect.withSpan("issues.expireIdleCandidates")) as Effect.Effect<
    ExpireIdleCandidatesResult,
    RepositoryError,
    SignalRepository | SqlClient
  >
