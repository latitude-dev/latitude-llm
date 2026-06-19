import type { QueuePublishError } from "@domain/queue"
import type { ChSqlClient, DestinationId, DestinationSyncRunId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { DESTINATION_BACKFILL_STALE_MS, DESTINATION_MAX_RECORDS_PER_BACKFILL } from "../constants.ts"
import type { DestinationSource } from "../entities/destination-source.ts"
import { createDestinationSyncRun } from "../entities/destination-sync-run.ts"
import { type DeliveryError, isRetryableDeliveryError, sanitizedDeliveryFailureMessage } from "../errors.ts"
import { type DeliveryWindow, DestinationDeliverers } from "../ports/destination-deliverer.ts"
import { DestinationMappers } from "../ports/destination-mapper.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { DestinationRetentionPolicy } from "../ports/destination-retention-policy.ts"
import { DestinationSourceReaders, type SourceCursor } from "../ports/destination-source-reader.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"
import { DestinationSyncRunRepository } from "../ports/destination-sync-run-repository.ts"

/**
 * A contiguous time slice of a backfill. With a historical boundary the slices
 * never cross it, so every delivered window lands cleanly on one side and the
 * adapter flags `historical_migration` correctly per window.
 */
export interface BackfillSegment {
  readonly start: Date
  readonly end: Date
}

/**
 * One bounded backfill window to process next: the cursor to resume from, the
 * `windowEnd` of the current segment, and the segments still queued behind it.
 * The worker re-enqueues this verbatim, so a backfill is a self-advancing chain
 * of single-window jobs — paced, resumable, and idempotent.
 */
export interface BackfillWindowJob {
  readonly cursor: SourceCursor
  readonly segmentEnd: Date
  readonly remainingSegments: readonly BackfillSegment[]
  /** The whole chain's lower bound; coverage extends to it only once the last window drains (no gap on partial failure). */
  readonly coverageFloor: Date
}

export interface BackfillDestinationInput {
  readonly destinationId: DestinationId
  /** Which source of the destination to backfill. */
  readonly source: DestinationSource
  /** Earliest instant to export from; `null` = from the org's retention floor. Either way the reach is clamped to `now − retention`. */
  readonly start: Date | null
  /** Upper bound of the export — where existing coverage begins. `null`/absent = decline to backfill (never defaults to `now`, which would overlap live). */
  readonly end?: Date | null
  readonly now: Date
  /** Enqueues the first window job; the worker re-enqueues subsequent windows. */
  readonly publish: (job: BackfillWindowJob) => Effect.Effect<void, QueuePublishError>
}

export type BackfillDestinationOutcome = "enqueued" | "empty" | "skipped" | "in_progress"

export interface BackfillDestinationResult {
  readonly outcome: BackfillDestinationOutcome
  readonly destinationId: DestinationId
  readonly source: DestinationSource
  /** The clamped lower bound actually used (start may have been older than the cap). */
  readonly clampedStart: Date
  readonly segmentsPlanned: number
}

export type BackfillDestinationError = RepositoryError | QueuePublishError

type InitiatorRequirements =
  | SqlClient
  | ChSqlClient
  | DestinationRepository
  | DestinationSourceStateRepository
  | DestinationSourceReaders
  | DestinationDeliverers
  | DestinationRetentionPolicy

/**
 * Splits `[clampedStart, end]` into windows-eligible segments. With a historical
 * boundary, the range that straddles `now − boundaryMs` is cut at that instant
 * so no single read window spans it: the older slice ends one ms before the
 * boundary (the adapter classifies it historical), the younger slice starts at
 * it (live). Boundary-less destinations get one segment — chunking is by size
 * only. Cursor lower bounds are exclusive, so each segment starts at its `start`.
 */
export const backfillSegments = (params: {
  readonly clampedStart: Date
  readonly end: Date
  readonly boundaryMs: number | undefined
  readonly now: Date
}): readonly BackfillSegment[] => {
  const { clampedStart, end, boundaryMs, now } = params
  if (clampedStart.getTime() > end.getTime()) return []
  if (boundaryMs === undefined) return [{ start: clampedStart, end }]

  const boundaryInstant = now.getTime() - boundaryMs
  // Whole range on one side of the boundary → no split needed.
  if (boundaryInstant <= clampedStart.getTime() || boundaryInstant > end.getTime()) {
    return [{ start: clampedStart, end }]
  }
  return [
    { start: clampedStart, end: new Date(boundaryInstant - 1) },
    { start: new Date(boundaryInstant), end },
  ]
}

const firstWindowJob = (segments: readonly BackfillSegment[], coverageFloor: Date): BackfillWindowJob | null => {
  const [head, ...rest] = segments
  if (!head) return null
  return { cursor: { watermark: head.start, id: "" }, segmentEnd: head.end, remainingSegments: rest, coverageFloor }
}

/**
 * Initiates a user-initiated historical export for one `(destination, source)`
 * pair: clamps the requested start to the org's subscription retention window
 * (resolved via `DestinationRetentionPolicy`), computes the
 * windows-eligible segments (split at the adapter's historical boundary so no
 * delivered window straddles it), and enqueues the first window. The worker
 * drives the rest by re-enqueuing {@link runBackfillWindowUseCase}'s `next`. The
 * pass never touches the live cursor. The caller-supplied `end` stops the export
 * where existing coverage begins, so it doesn't re-send what live already covers;
 * the deterministic event UUID still dedupes any unavoidable boundary overlap.
 */
export const backfillDestinationUseCase = (input: BackfillDestinationInput) =>
  Effect.gen(function* () {
    const { destinationId, source, start, end, now, publish } = input
    yield* Effect.annotateCurrentSpan("destination.id", destinationId)
    yield* Effect.annotateCurrentSpan("destination.source", source)

    // No upper bound → decline. A backfill must stop where coverage begins; running
    // unbounded to `now` would re-export everything and overlap live.
    if (end == null) {
      return { outcome: "skipped" as const, destinationId, source, clampedStart: start ?? now, segmentsPlanned: 0 }
    }

    const destinations = yield* DestinationRepository
    const sourceStates = yield* DestinationSourceStateRepository

    const destination = yield* destinations
      .findById(destinationId)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    if (!destination || destination.status !== "active") {
      return { outcome: "skipped" as const, destinationId, source, clampedStart: start ?? end, segmentsPlanned: 0 }
    }
    yield* Effect.annotateCurrentSpan("destination.kind", destination.kind)

    const sourceState = yield* sourceStates.findByDestinationAndSource({ destinationId, source })
    if (!sourceState || sourceState.status !== "enabled") {
      return { outcome: "skipped" as const, destinationId, source, clampedStart: start ?? end, segmentsPlanned: 0 }
    }

    // Retention is resolved here, in the service — never trusted from the caller/UI.
    // `start === null` means "as far back as retained", so the floor is the reach.
    const maxAgeMs = yield* (yield* DestinationRetentionPolicy).maxAgeMs(destination.organizationId)
    const floorMs = now.getTime() - maxAgeMs
    const retentionClampedStart = new Date(start === null ? floorMs : Math.max(start.getTime(), floorMs))

    // Record cap: import only the most recent DESTINATION_MAX_RECORDS_PER_BACKFILL records.
    // The reader gives the lower bound that holds at most the cap (newest first), or null when
    // the whole range already fits; raise the start to it so we never run an unbounded import.
    const reader = (yield* DestinationSourceReaders)[source]
    const capFloor = yield* reader.recentLimitFloor({
      organizationId: destination.organizationId,
      projectId: destination.projectId,
      end,
      limit: DESTINATION_MAX_RECORDS_PER_BACKFILL,
    })
    const clampedStart =
      capFloor && capFloor.getTime() > retentionClampedStart.getTime() ? capFloor : retentionClampedStart

    // Nothing before existing coverage → no work (e.g. a re-import of an already-covered range).
    if (clampedStart.getTime() >= end.getTime()) {
      return { outcome: "empty" as const, destinationId: destination.id, source, clampedStart, segmentsPlanned: 0 }
    }

    const deliverer = (yield* DestinationDeliverers)[destination.kind]
    const segments = backfillSegments({ clampedStart, end, boundaryMs: deliverer.historicalBoundaryMs, now })
    const job = firstWindowJob(segments, clampedStart)
    if (!job) {
      return { outcome: "empty" as const, destinationId: destination.id, source, clampedStart, segmentsPlanned: 0 }
    }

    // Hard one-chain-per-source guard: atomically claim the in-flight marker, but only
    // if no fresh chain is already running. A racing second trigger (two tabs, an API
    // retry) loses the CAS and declines here instead of double-running the chain.
    const acquired = yield* sourceStates.acquireBackfill({
      destinationId,
      source,
      at: now,
      staleBefore: new Date(now.getTime() - DESTINATION_BACKFILL_STALE_MS),
    })
    if (!acquired) {
      return {
        outcome: "in_progress" as const,
        destinationId: destination.id,
        source,
        clampedStart,
        segmentsPlanned: 0,
      }
    }

    // Release the marker if enqueue fails, so the BullMQ retry of this initiator can
    // re-acquire cleanly instead of being shut out by its own half-applied claim.
    yield* publish(job).pipe(
      Effect.tapError(() => sourceStates.setBackfillStartedAt({ destinationId, source, at: null })),
    )
    return {
      outcome: "enqueued" as const,
      destinationId: destination.id,
      source,
      clampedStart,
      segmentsPlanned: segments.length,
    }
  }).pipe(Effect.withSpan("destinations.backfillDestination")) as Effect.Effect<
    BackfillDestinationResult,
    BackfillDestinationError,
    InitiatorRequirements
  >

export interface RunBackfillWindowInput {
  readonly destinationId: DestinationId
  readonly source: DestinationSource
  readonly cursor: SourceCursor
  readonly segmentEnd: Date
  readonly remainingSegments: readonly BackfillSegment[]
  /** The whole chain's lower bound; on drain, coverage extends to it. Carried verbatim through the chain. */
  readonly coverageFloor: Date
  readonly now: Date
}

export type RunBackfillWindowOutcome = "delivered" | "drained" | "skipped" | "failed"

export interface RunBackfillWindowResult {
  readonly outcome: RunBackfillWindowOutcome
  readonly destinationId: DestinationId
  readonly source: DestinationSource
  readonly recordsRead: number
  readonly eventsSent: number
  readonly eventsDropped: number
  readonly syncRunId: DestinationSyncRunId | null
  /** The next window to process, or `null` when the whole range is exhausted. */
  readonly next: BackfillWindowJob | null
}

export type RunBackfillWindowError = DeliveryError | RepositoryError

type WindowRequirements =
  | SqlClient
  | ChSqlClient
  | DestinationSourceReaders
  | DestinationRepository
  | DestinationSourceStateRepository
  | DestinationSyncRunRepository
  | DestinationDeliverers
  | DestinationMappers

const advanceToNextSegment = (
  remainingSegments: readonly BackfillSegment[],
  coverageFloor: Date,
): BackfillWindowJob | null => firstWindowJob(remainingSegments, coverageFloor)

/**
 * Processes exactly one backfill window through the same read→map→deliver path
 * as the live sync, then reports the `next` window to run. Within a segment it
 * resumes by record cap (compound cursor); when the segment drains it advances
 * to the next queued segment, returning `null` once the range is exhausted.
 * Writes a `backfill`-tagged sync-run row per delivered window. Never touches
 * the live cursor; idempotent via deterministic event UUIDs. On the final window
 * (no `next`), it extends `coverageStartAt` to the chain's `coverageFloor` — only
 * then is `[coverageFloor, …]` fully delivered, so a partial-failure leaves no gap.
 */
export const runBackfillWindowUseCase = (input: RunBackfillWindowInput) =>
  Effect.gen(function* () {
    const { destinationId, source, cursor, segmentEnd, remainingSegments, coverageFloor, now } = input
    yield* Effect.annotateCurrentSpan("destination.id", destinationId)
    yield* Effect.annotateCurrentSpan("destination.source", source)

    const destinations = yield* DestinationRepository
    const sourceStates = yield* DestinationSourceStateRepository

    const skipped = (): RunBackfillWindowResult => ({
      outcome: "skipped",
      destinationId,
      source,
      recordsRead: 0,
      eventsSent: 0,
      eventsDropped: 0,
      syncRunId: null,
      next: null,
    })

    const destination = yield* destinations
      .findById(destinationId)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    if (!destination || destination.status !== "active") return skipped()

    const sourceState = yield* sourceStates.findByDestinationAndSource({ destinationId, source })
    if (!sourceState || sourceState.status !== "enabled") return skipped()
    // Cancelled: the in-flight marker was cleared while the chain was running → stop. Don't
    // process this window or re-enqueue the next; coverage stays un-advanced (the range is unfinished).
    if (sourceState.backfillStartedAt === null) return skipped()

    const mappers = yield* DestinationMappers
    const mapper = mappers[destination.kind][source]
    if (!mapper) return skipped()

    const reader = (yield* DestinationSourceReaders)[source]
    const deliverer = (yield* DestinationDeliverers)[destination.kind]
    const syncRuns = yield* DestinationSyncRunRepository

    const limit = sourceState.config.maxRecordsPerRun
    const window = yield* reader.listWindow({
      organizationId: destination.organizationId,
      projectId: destination.projectId,
      cursor,
      windowEnd: segmentEnd,
      limit,
    })

    if (window.records.length === 0) {
      const drainedNext = advanceToNextSegment(remainingSegments, coverageFloor)
      if (drainedNext === null) {
        yield* sourceStates.extendCoverageStart({ destinationId, source, to: coverageFloor })
        yield* sourceStates.setBackfillStartedAt({ destinationId, source, at: null })
      } else {
        yield* sourceStates.setBackfillProgress({ destinationId, source, at: segmentEnd })
      }
      return {
        outcome: "drained" as const,
        destinationId: destination.id,
        source,
        recordsRead: 0,
        eventsSent: 0,
        eventsDropped: 0,
        syncRunId: null,
        next: drainedNext,
      }
    }

    const next = window.nextCursor
    const deliveryWindow: DeliveryWindow = { start: cursor.watermark, end: next ? next.watermark : segmentEnd }

    const mapped = yield* mapper.toEvents(window.records, destination.id, sourceState.config)
    const delivery = yield* deliverer
      .deliver(mapped.events, destination.config, destination.credentials, { window: deliveryWindow })
      .pipe(Effect.result)

    if (delivery._tag === "Failure") {
      const error = delivery.failure
      // Retryable → propagate so BullMQ retries this window; exhausting retries records the
      // failure and clears the marker via the worker's onFinalFailure hook.
      if (isRetryableDeliveryError(error)) return yield* Effect.fail(error)

      // Non-retryable (bad key/config) can never succeed — record a `failed` run and clear the
      // in-flight marker now instead of burning DESTINATION_SYNC_MAX_ATTEMPTS retries. Mirrors the
      // live path (runDestinationSyncUseCase). Coverage is left un-advanced; the chain stops.
      const message = sanitizedDeliveryFailureMessage(error)
      const failedRun = createDestinationSyncRun({
        organizationId: destination.organizationId,
        destinationId: destination.id,
        source,
        trigger: "backfill",
        windowStart: deliveryWindow.start,
        windowEnd: deliveryWindow.end,
        status: "failed",
        recordsRead: window.records.length,
        eventsSent: 0,
        eventsDropped: mapped.dropped,
        error: message,
        startedAt: now,
        finishedAt: now,
      })
      yield* syncRuns.insert(failedRun)
      yield* sourceStates.setBackfillStartedAt({ destinationId, source, at: null })
      return {
        outcome: "failed" as const,
        destinationId: destination.id,
        source,
        recordsRead: window.records.length,
        eventsSent: 0,
        eventsDropped: mapped.dropped,
        syncRunId: failedRun.id,
        next: null,
      }
    }

    const eventsDropped = mapped.dropped + delivery.success.dropped
    const run = createDestinationSyncRun({
      organizationId: destination.organizationId,
      destinationId: destination.id,
      source,
      trigger: "backfill",
      windowStart: deliveryWindow.start,
      windowEnd: deliveryWindow.end,
      status: "succeeded",
      recordsRead: window.records.length,
      eventsSent: delivery.success.delivered,
      eventsDropped,
      error: null,
      startedAt: now,
      finishedAt: now,
    })
    yield* syncRuns.insert(run)

    // More to read in this segment when the cap truncated it; otherwise the segment is drained.
    const continues = next !== null && window.records.length >= limit
    const nextJob = continues
      ? { cursor: next, segmentEnd, remainingSegments, coverageFloor }
      : advanceToNextSegment(remainingSegments, coverageFloor)
    if (nextJob === null) {
      yield* sourceStates.extendCoverageStart({ destinationId, source, to: coverageFloor })
      yield* sourceStates.setBackfillStartedAt({ destinationId, source, at: null })
    } else {
      yield* sourceStates.setBackfillProgress({
        destinationId,
        source,
        at: continues && next ? next.watermark : segmentEnd,
      })
    }

    return {
      outcome: "delivered" as const,
      destinationId: destination.id,
      source,
      recordsRead: window.records.length,
      eventsSent: delivery.success.delivered,
      eventsDropped,
      syncRunId: run.id,
      next: nextJob,
    }
  }).pipe(Effect.withSpan("destinations.runBackfillWindow")) as Effect.Effect<
    RunBackfillWindowResult,
    RunBackfillWindowError,
    WindowRequirements
  >
