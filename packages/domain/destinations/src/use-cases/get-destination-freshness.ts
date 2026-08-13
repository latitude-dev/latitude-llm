import type { ChSqlClient, DestinationId, OrganizationId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import { DESTINATION_BACKFILL_STALE_MS, DESTINATION_SAFETY_LAG_MS } from "../constants.ts"
import type { DestinationSource } from "../entities/destination-source.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { DestinationRetentionPolicy } from "../ports/destination-retention-policy.ts"
import { DestinationSourceReaders } from "../ports/destination-source-reader.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"

interface GetDestinationFreshnessInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly destinationId: DestinationId
  /** Injected for determinism; the boundary passes wall-clock time. */
  readonly now: Date
  /** Dev override for the window-end safety lag; defaults to {@link DESTINATION_SAFETY_LAG_MS}. */
  readonly safetyLagMs?: number
}

/** Per-source freshness: `now − ingested_at of the source's oldest undelivered eligible record`; `null` = caught up. */
export interface SourceFreshness {
  readonly source: DestinationSource
  /**
   * Deliberately **not** `now − watermark`: an idle source's watermark trails real
   * time only because idle-backoff spaces out the empty runs that advance it,
   * which would read as "behind" while there is nothing to deliver. `null` =
   * caught up → render as "Up to date", never "0 behind".
   */
  readonly lagMs: number | null
}

export interface DestinationFreshness {
  /**
   * One entry per *enabled* source. The card derives its headline by taking the
   * worst (largest) lag across these (null only if every source is caught up); a
   * detail view can render the per-source breakdown.
   */
  readonly sources: readonly SourceFreshness[]
  /**
   * True when any enabled source still has history to import — its
   * `coverage_start_at` sits above the org's retention floor (`now − retention`).
   * Once coverage reaches the floor it's `false`: every further backfill would be
   * an empty no-op, so the UI hides/disables the action.
   */
  readonly backfillAvailable: boolean
  /**
   * True while a backfill chain is in flight on any enabled source — staleness-aware
   * (a chain whose heartbeat went stale is treated as wedged, not running). Drives
   * the card's "Backfilling…"/Cancel state and its live polling.
   */
  readonly backfillInProgress: boolean
  /**
   * Fraction (0–1) of the in-flight backfill's range covered so far, or `null`
   * when none is running. Derived from `backfill_progress_at` against the range
   * `[retention floor, coverage_start_at]`; the min across in-flight sources.
   */
  readonly backfillProgress: number | null
}

/**
 * Customer-facing freshness for the destination card. Per enabled source, asks
 * the source's own reader for the oldest record still pending in its settled
 * window (`listWindow(limit: 1)` → `nextCursor` is that record's position, or
 * `null` when the source is caught up). Source-agnostic: it rides the
 * `SourceCursor` abstraction, so a future non-spans source answers from its own
 * store with no special-casing here.
 */
export const getDestinationFreshnessUseCase = (input: GetDestinationFreshnessInput) =>
  Effect.gen(function* () {
    const destinations = yield* DestinationRepository
    const destination = yield* destinations.findById(input.destinationId)
    if (destination.projectId !== input.projectId) {
      return yield* Effect.fail(new NotFoundError({ entity: "Destination", id: input.destinationId }))
    }

    const sourceStates = yield* DestinationSourceStateRepository
    const enabled = (yield* sourceStates.listByDestinationId(destination.id)).filter((s) => s.status === "enabled")

    // Retention floor — backfill can still import history while any enabled source's coverage starts above it.
    const maxAgeMs = yield* (yield* DestinationRetentionPolicy).maxAgeMs(destination.organizationId)
    const floor = input.now.getTime() - maxAgeMs
    const backfillAvailable = enabled.some((s) => s.coverageStartAt.getTime() > floor)

    // In-flight backfill progress: fraction of [floor, coverage_start_at] the cursor has reached.
    // (rangeStart approximated as the floor — exact for the common "import all" backfill.)
    // Staleness-aware: a chain whose heartbeat (`updated_at`) went stale is wedged, not running.
    const inFlight = enabled.filter(
      (s) =>
        s.backfillStartedAt !== null && input.now.getTime() - s.updatedAt.getTime() < DESTINATION_BACKFILL_STALE_MS,
    )
    const backfillInProgress = inFlight.length > 0
    const backfillProgress =
      inFlight.length === 0
        ? null
        : Math.min(
            ...inFlight.map((s) => {
              const rangeEnd = s.coverageStartAt.getTime()
              if (rangeEnd <= floor) return 1
              const at = (s.backfillProgressAt ?? new Date(floor)).getTime()
              return Math.max(0, Math.min(1, (at - floor) / (rangeEnd - floor)))
            }),
          )

    const windowEnd = new Date(input.now.getTime() - (input.safetyLagMs ?? DESTINATION_SAFETY_LAG_MS))
    const readers = yield* DestinationSourceReaders

    const sources = yield* Effect.forEach(enabled, (source) =>
      readers[source.source]
        .listWindow({
          organizationId: destination.organizationId,
          projectId: destination.projectId,
          cursor: { watermark: source.watermark, id: source.watermarkId, traceId: source.watermarkTraceId },
          windowEnd,
          limit: 1,
        })
        .pipe(
          Effect.map(
            (window): SourceFreshness => ({
              source: source.source,
              lagMs: window.nextCursor ? input.now.getTime() - window.nextCursor.watermark.getTime() : null,
            }),
          ),
        ),
    )

    return { sources, backfillAvailable, backfillInProgress, backfillProgress } satisfies DestinationFreshness
  }).pipe(Effect.withSpan("destinations.getDestinationFreshness")) as Effect.Effect<
    DestinationFreshness,
    NotFoundError | RepositoryError,
    | SqlClient
    | DestinationRepository
    | DestinationSourceStateRepository
    | DestinationSourceReaders
    | DestinationRetentionPolicy
    | ChSqlClient
  >
