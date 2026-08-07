import { type ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import {
  ALERT_SEVERITIES,
  type ChSqlClient,
  type OrganizationId,
  ProjectId,
  type RepositoryError,
  type SignalId,
  type SqlClient,
} from "@domain/shared"
import type { SessionRepository, TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import { abandonmentFloor } from "../abandonment-floor.ts"
import { ABANDONMENT_OCCURRENCE_SAMPLE_LIMIT } from "../constants.ts"
import type { SignalPriority } from "../entities/signal.ts"
import { SessionAbandonmentRepository } from "../ports/session-abandonment-repository.ts"
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
 * `priorityFloor` is what volume cannot undercut: the discovery rubric's read of
 * the prose, a detector floor, or a level somebody chose by hand. Coming down
 * stops there. Raising is always allowed, so a signal a person filed as `low`
 * still reaches them when it explodes on Friday — which is why this needs no
 * provenance flag to be safe in either direction (see LAT-844).
 */
/**
 * Floor a deterministic detector's signal earns from users walking away after it
 * fired, or null. Best-effort: this is extra evidence for a level that already
 * has a volume-derived answer, so a ClickHouse or Postgres failure must not stop
 * the recompute — it degrades to the volume band alone.
 */
const abandonmentFloorFor = (input: RecomputeSignalLevelInput) =>
  Effect.gen(function* () {
    const scores = yield* ScoreRepository
    const page = yield* scores.listBySignalId({
      projectId: ProjectId(input.projectId),
      signalId: input.signalId,
      source: "annotation",
      options: { limit: ABANDONMENT_OCCURRENCE_SAMPLE_LIMIT },
    })
    const occurrences = page.items.flatMap((score) => {
      if (score.sessionId === null) return []
      const metadata = score.metadata as { flaggerSlug?: unknown; messageIndex?: unknown } | null
      return [
        {
          sessionId: String(score.sessionId),
          flaggerSlug: typeof metadata?.flaggerSlug === "string" ? metadata.flaggerSlug : undefined,
          messageIndex: typeof metadata?.messageIndex === "number" ? metadata.messageIndex : undefined,
        },
      ]
    })
    if (occurrences.length === 0) return null

    const abandonment = yield* SessionAbandonmentRepository
    const abandonmentIndexBySession = yield* abandonment.listAbandonmentIndexBySession({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sessionIds: [...new Set(occurrences.map((occurrence) => occurrence.sessionId))],
    })

    return abandonmentFloor({ occurrences, abandonmentIndexBySession })
  }).pipe(Effect.catchCause(() => Effect.succeed(null)))

/** Floors only ever raise, so the effective one is whichever sits higher. */
const highestFloor = (stored: SignalPriority | null, earned: SignalPriority | null): SignalPriority | null => {
  if (stored === null) return earned
  if (earned === null) return stored
  return ALERT_SEVERITIES.indexOf(earned) > ALERT_SEVERITIES.indexOf(stored) ? earned : stored
}

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

    const walkedAway = yield* abandonmentFloorFor(input)

    const impact = yield* getSignalImpactUseCase({
      organizationId: input.organizationId,
      projectId: input.projectId,
      signalId: input.signalId,
    })

    const floor = highestFloor(signal.priorityFloor ?? null, walkedAway)
    const level = levelForImpact({
      affectedSessionsPercent: impact.affectedSessionsPercent,
      escalating: input.escalating,
      floor,
    })
    yield* Effect.annotateCurrentSpan("level", level)

    if (signal.priority === level && (signal.priorityFloor ?? null) === floor) {
      return { status: "unchanged", level } as const
    }

    yield* signals.save({ ...signal, priority: level, priorityFloor: floor, updatedAt: new Date() })
    return { status: "updated", from: signal.priority, level } as const
  }).pipe(Effect.withSpan("issues.recomputeSignalLevel")) as Effect.Effect<
    RecomputeSignalLevelResult,
    RecomputeSignalLevelError,
    | SqlClient
    | ChSqlClient
    | SignalRepository
    | ScoreRepository
    | ScoreAnalyticsRepository
    | SessionAbandonmentRepository
    | TraceRepository
    | SessionRepository
  >
