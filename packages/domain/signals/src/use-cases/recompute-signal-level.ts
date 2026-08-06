import type { ScoreAnalyticsRepository } from "@domain/scores"
import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError, SignalId, SqlClient } from "@domain/shared"
import type { SessionRepository, TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import type { SignalPriority } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { levelForImpact } from "../severity-bands.ts"
import { getSignalImpactUseCase } from "./get-signal-impact.ts"

export interface RecomputeSignalLevelInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly signalId: SignalId
  /** The signal is inside an open escalation. Raises the measured level one tier. */
  readonly escalating: boolean
}

export type RecomputeSignalLevelResult =
  | { readonly status: "skipped"; readonly reason: "signal-not-found" }
  | { readonly status: "unchanged"; readonly level: SignalPriority }
  | { readonly status: "updated"; readonly from: SignalPriority | null; readonly level: SignalPriority }

export type RecomputeSignalLevelError = RepositoryError

/**
 * Re-derives a signal's level from what it is currently doing: the share of the
 * project's sessions it touches, raised a tier while it is escalating.
 *
 * Runs in both directions on purpose. A spike that passes should stop being
 * `high`, or the level ratchets up over a project's lifetime until every signal
 * claims to be urgent and the threshold sorts nothing. Being a pure function of
 * present measurements is what makes coming down safe.
 *
 * There is no provenance check yet, so this can overwrite a level a person set
 * (see LAT-844). That is the deliberate trade: refusing to raise a signal
 * somebody once called `low` would silence the alert exactly when it explodes.
 */
export const recomputeSignalLevelUseCase = (input: RecomputeSignalLevelInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("signalId", String(input.signalId))

    const signals = yield* SignalRepository
    const signal = yield* signals
      .findById(input.signalId)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    if (signal === null || signal.projectId !== input.projectId) {
      return { status: "skipped", reason: "signal-not-found" } as const
    }

    const impact = yield* getSignalImpactUseCase({
      organizationId: input.organizationId,
      projectId: input.projectId,
      signalId: input.signalId,
    })

    const level = levelForImpact({
      affectedSessionsPercent: impact.affectedSessionsPercent,
      escalating: input.escalating,
    })
    yield* Effect.annotateCurrentSpan("level", level)

    if (signal.priority === level) return { status: "unchanged", level } as const

    yield* signals.save({ ...signal, priority: level, updatedAt: new Date() })
    return { status: "updated", from: signal.priority, level } as const
  }).pipe(Effect.withSpan("issues.recomputeSignalLevel")) as Effect.Effect<
    RecomputeSignalLevelResult,
    RecomputeSignalLevelError,
    SqlClient | ChSqlClient | SignalRepository | ScoreAnalyticsRepository | TraceRepository | SessionRepository
  >
