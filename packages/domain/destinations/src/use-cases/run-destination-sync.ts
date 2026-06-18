import type {
  ChSqlClient,
  DestinationId,
  DestinationSyncRunId,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SqlClient,
} from "@domain/shared"
import { Effect } from "effect"
import { DESTINATION_QUARANTINE_FAILURE_THRESHOLD, DESTINATION_SAFETY_LAG_MS } from "../constants.ts"
import type { Destination, DestinationKind } from "../entities/destination.ts"
import type { DestinationSource } from "../entities/destination-source.ts"
import type { DestinationSourceState } from "../entities/destination-source-state.ts"
import { createDestinationSyncRun } from "../entities/destination-sync-run.ts"
import { type DeliveryError, isRetryableDeliveryError, type RetryableDeliveryError } from "../errors.ts"
import { type DeliveryWindow, DestinationDeliverers } from "../ports/destination-deliverer.ts"
import { DestinationMappers } from "../ports/destination-mapper.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { DestinationSourceReaders, type SourceCursor } from "../ports/destination-source-reader.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"
import { DestinationSyncRunRepository } from "../ports/destination-sync-run-repository.ts"

export interface RunDestinationSyncInput {
  readonly destinationId: DestinationId
  /** Which source of the destination this run syncs. */
  readonly source: DestinationSource
  readonly now: Date
  /** Window-end safety lag; defaults to {@link DESTINATION_SAFETY_LAG_MS}. Overridable only for local dev/QA. */
  readonly safetyLagMs?: number
}

export type RunDestinationSyncOutcome = "skipped" | "empty" | "delivered" | "failed" | "stale"

/**
 * Emitted only when this run flipped the destination to `quarantined` (the
 * exact transition, which happens at most once per quarantine episode). Carries
 * everything the notification producer needs without a re-fetch; the worker
 * publishes `request-destination-quarantined-notifications` from it.
 */
export interface DestinationQuarantineEvent {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly destinationId: DestinationId
  readonly destinationName: string
  readonly destinationKind: DestinationKind
  readonly failureMessage: string | null
  readonly quarantinedAt: Date
}

export interface RunDestinationSyncResult {
  readonly outcome: RunDestinationSyncOutcome
  readonly destinationId: DestinationId
  readonly source: DestinationSource
  readonly recordsRead: number
  readonly eventsSent: number
  readonly eventsDropped: number
  readonly cursorAdvanced: boolean
  readonly quarantined: boolean
  readonly syncRunId: DestinationSyncRunId | null
  /** Per-run lag = `now − resulting cursor watermark` (ms). The ops metric P3-3 alarms on. */
  readonly lagMs: number
  /** Set only on the run that quarantines the destination; null otherwise. */
  readonly quarantineEvent: DestinationQuarantineEvent | null
}

export type RunDestinationSyncError = RetryableDeliveryError | RepositoryError

type Requirements =
  | SqlClient
  | ChSqlClient
  | DestinationSourceReaders
  | DestinationRepository
  | DestinationSourceStateRepository
  | DestinationSyncRunRepository
  | DestinationDeliverers
  | DestinationMappers

const sanitizedFailureMessage = (error: DeliveryError): string =>
  error.upstreamStatus === undefined ? error.reason : `[${error.upstreamStatus}] ${error.reason}`

const isForward = (next: SourceCursor, current: SourceCursor): boolean =>
  next.watermark.getTime() > current.watermark.getTime() ||
  (next.watermark.getTime() === current.watermark.getTime() && next.id > current.id)

const result = (
  params: Partial<RunDestinationSyncResult> & {
    outcome: RunDestinationSyncOutcome
    destinationId: DestinationId
    source: DestinationSource
  },
): RunDestinationSyncResult => ({
  recordsRead: 0,
  eventsSent: 0,
  eventsDropped: 0,
  cursorAdvanced: false,
  quarantined: false,
  syncRunId: null,
  lagMs: 0,
  quarantineEvent: null,
  ...params,
})

/**
 * Loads + validates the `(destination, source)` pair and its mapper. Returns
 * `null` when the run should be a no-op `skipped` — the destination is gone /
 * not active, the source is missing / disabled, or there's no mapper for the
 * pair (a `(kind, source)` not wired yet).
 */
const loadRunContext = (destinationId: DestinationId, source: DestinationSource) =>
  Effect.gen(function* () {
    const destinations = yield* DestinationRepository
    const destination = yield* destinations
      .findById(destinationId)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    if (!destination || destination.status !== "active") return null
    yield* Effect.annotateCurrentSpan("destination.kind", destination.kind)

    const sourceStates = yield* DestinationSourceStateRepository
    const sourceState = yield* sourceStates.findByDestinationAndSource({
      destinationId,
      source,
    })
    if (!sourceState || sourceState.status !== "enabled") return null

    const mapper = (yield* DestinationMappers)[destination.kind][source]
    if (!mapper) return null

    return { destination, sourceState, mapper }
  })

/**
 * Empty window: advance the per-source cursor to window-end (so an idle source
 * doesn't re-scan the same gap) and grow idle backoff. No delivery, no
 * sync-run row. A lost CAS race means another run already advanced — report
 * `stale`.
 */
const handleEmptyWindow = (params: {
  readonly destination: Destination
  readonly source: DestinationSource
  readonly sourceState: DestinationSourceState
  readonly startCursor: SourceCursor
  readonly windowEnd: Date
  readonly now: Date
}) =>
  Effect.gen(function* () {
    const { destination, source, sourceState, startCursor, windowEnd, now } = params
    const sourceStates = yield* DestinationSourceStateRepository

    const emptyTarget: SourceCursor = { watermark: windowEnd, id: "" }
    const advances = isForward(emptyTarget, startCursor)
    if (advances) {
      const claimed = yield* sourceStates.advanceCursor({
        destinationId: destination.id,
        source,
        expected: startCursor,
        next: emptyTarget,
      })
      if (!claimed) {
        return result({
          outcome: "stale",
          destinationId: destination.id,
          source,
          lagMs: now.getTime() - startCursor.watermark.getTime(),
        })
      }
    }

    yield* sourceStates.updateRunState({
      destinationId: destination.id,
      source,
      consecutiveEmptyRuns: sourceState.consecutiveEmptyRuns + 1,
      lastRunAt: now,
    })

    const emptyWatermark = advances ? emptyTarget.watermark : startCursor.watermark
    return result({
      outcome: "empty",
      destinationId: destination.id,
      source,
      cursorAdvanced: advances,
      lagMs: now.getTime() - emptyWatermark.getTime(),
    })
  })

/**
 * Non-retryable delivery failure: increment `consecutive_failures`, quarantine
 * at the threshold, bump `last_run_at` (not the cursor — the window wasn't
 * delivered), and write a `failed` sync-run. Emits the {@link
 * DestinationQuarantineEvent} only on the exact run that flips to quarantined.
 */
const handleDeliveryFailure = (params: {
  readonly destination: Destination
  readonly source: DestinationSource
  readonly sourceState: DestinationSourceState
  readonly error: DeliveryError
  readonly deliveryWindow: DeliveryWindow
  readonly recordsRead: number
  readonly eventsDropped: number
  readonly startedAt: Date
  readonly now: Date
}) =>
  Effect.gen(function* () {
    const { destination, source, sourceState, error, deliveryWindow, recordsRead, eventsDropped, startedAt, now } =
      params
    const destinations = yield* DestinationRepository
    const sourceStates = yield* DestinationSourceStateRepository
    const syncRuns = yield* DestinationSyncRunRepository

    const consecutiveFailures = destination.consecutiveFailures + 1
    const quarantined = consecutiveFailures >= DESTINATION_QUARANTINE_FAILURE_THRESHOLD
    const message = sanitizedFailureMessage(error)

    yield* destinations.updateQuarantineState({
      id: destination.id,
      status: quarantined ? "quarantined" : "active",
      consecutiveFailures,
      lastFailureMessage: message,
    })
    yield* sourceStates.updateRunState({
      destinationId: destination.id,
      source,
      consecutiveEmptyRuns: sourceState.consecutiveEmptyRuns,
      lastRunAt: now,
    })

    const run = createDestinationSyncRun({
      organizationId: destination.organizationId,
      destinationId: destination.id,
      source,
      windowStart: deliveryWindow.start,
      windowEnd: deliveryWindow.end,
      status: "failed",
      recordsRead,
      eventsSent: 0,
      eventsDropped,
      error: message,
      startedAt,
      finishedAt: now,
    })
    yield* syncRuns.insert(run)

    return result({
      outcome: "failed",
      destinationId: destination.id,
      source,
      recordsRead,
      eventsDropped,
      quarantined,
      syncRunId: run.id,
      // Cursor untouched on failure — lag is measured from where it still sits.
      lagMs: now.getTime() - sourceState.watermark.getTime(),
      quarantineEvent: quarantined
        ? {
            organizationId: destination.organizationId,
            projectId: destination.projectId,
            destinationId: destination.id,
            destinationName: destination.name,
            destinationKind: destination.kind,
            failureMessage: message,
            quarantinedAt: now,
          }
        : null,
    })
  })

/**
 * Successful delivery: CAS-advance the cursor past the delivered window (a lost
 * race → `stale`, nothing else mutated), clear quarantine state, reset idle
 * backoff, and write a `succeeded` sync-run.
 */
const handleDeliverySuccess = (params: {
  readonly destination: Destination
  readonly source: DestinationSource
  readonly startCursor: SourceCursor
  readonly next: SourceCursor | null
  readonly windowEnd: Date
  readonly deliveryWindow: DeliveryWindow
  readonly recordsRead: number
  readonly eventsSent: number
  readonly eventsDropped: number
  readonly startedAt: Date
  readonly now: Date
}) =>
  Effect.gen(function* () {
    const { destination, source, startCursor, next, windowEnd, deliveryWindow } = params
    const { recordsRead, eventsSent, eventsDropped, startedAt, now } = params
    const destinations = yield* DestinationRepository
    const sourceStates = yield* DestinationSourceStateRepository
    const syncRuns = yield* DestinationSyncRunRepository

    const claimed = yield* sourceStates.advanceCursor({
      destinationId: destination.id,
      source,
      expected: startCursor,
      next: next ? { watermark: next.watermark, id: next.id } : { watermark: windowEnd, id: "" },
    })
    if (!claimed) {
      return result({
        outcome: "stale",
        destinationId: destination.id,
        source,
        recordsRead,
        lagMs: now.getTime() - startCursor.watermark.getTime(),
      })
    }

    yield* destinations.updateQuarantineState({
      id: destination.id,
      status: "active",
      consecutiveFailures: 0,
      lastFailureMessage: null,
    })
    yield* sourceStates.updateRunState({
      destinationId: destination.id,
      source,
      consecutiveEmptyRuns: 0,
      lastRunAt: now,
    })

    const deliveredWatermark = next ? next.watermark : windowEnd
    const run = createDestinationSyncRun({
      organizationId: destination.organizationId,
      destinationId: destination.id,
      source,
      windowStart: deliveryWindow.start,
      windowEnd: deliveryWindow.end,
      status: "succeeded",
      recordsRead,
      eventsSent,
      eventsDropped,
      error: null,
      startedAt,
      finishedAt: now,
    })
    yield* syncRuns.insert(run)

    return result({
      outcome: "delivered",
      destinationId: destination.id,
      source,
      recordsRead,
      eventsSent,
      eventsDropped,
      cursorAdvanced: true,
      syncRunId: run.id,
      lagMs: now.getTime() - deliveredWatermark.getTime(),
    })
  })

/**
 * Source-agnostic sync engine for one `(destination, source)` pair: reads the
 * source window `(cursor, now − SAFETY_LAG]`, maps and delivers it, then
 * advances the per-source compound cursor only after the whole delivered window
 * lands. The cursor always points at the end of fully delivered data — a
 * retention backlog is caught up across capped runs, never silently skipped.
 * Idle backoff and the sync-run audit row are per-source; quarantine is
 * destination-level (credentials/host are shared). No vendor or backfill logic
 * leaks into the engine. The window's three terminal shapes — empty, failed
 * delivery, successful delivery — are handled by the `handle*` helpers above.
 */
export const runDestinationSyncUseCase = (input: RunDestinationSyncInput) =>
  Effect.gen(function* () {
    const { destinationId, source, now, safetyLagMs } = input
    yield* Effect.annotateCurrentSpan("destination.id", destinationId)
    yield* Effect.annotateCurrentSpan("destination.source", source)

    const ctx = yield* loadRunContext(destinationId, source)
    if (!ctx) return result({ outcome: "skipped", destinationId, source })
    const { destination, sourceState, mapper } = ctx

    const startedAt = now
    const windowEnd = new Date(now.getTime() - (safetyLagMs ?? DESTINATION_SAFETY_LAG_MS))
    const startCursor: SourceCursor = {
      watermark: sourceState.watermark,
      id: sourceState.watermarkId,
    }

    const readers = yield* DestinationSourceReaders
    const window = yield* readers[source].listWindow({
      organizationId: destination.organizationId,
      projectId: destination.projectId,
      cursor: startCursor,
      windowEnd,
      limit: sourceState.config.maxRecordsPerRun,
    })

    if (window.records.length === 0) {
      return yield* handleEmptyWindow({
        destination,
        source,
        sourceState,
        startCursor,
        windowEnd,
        now,
      })
    }

    // Non-empty: the read is strictly after the cursor, so `nextCursor` is always present and forward.
    const next = window.nextCursor
    const deliveryWindow: DeliveryWindow = {
      start: startCursor.watermark,
      end: next ? next.watermark : windowEnd,
    }

    const mapped = yield* mapper.toEvents(window.records, destination.id, sourceState.config)

    const deliverers = yield* DestinationDeliverers
    const delivery = yield* deliverers[destination.kind]
      .deliver(mapped.events, destination.config, destination.credentials, {
        window: deliveryWindow,
      })
      .pipe(Effect.result)

    if (delivery._tag === "Failure") {
      const error = delivery.failure
      // Retryable → re-fail so BullMQ retries; the terminal-failure accounting lives in the exhausted-retry hook.
      if (isRetryableDeliveryError(error)) return yield* Effect.fail(error)

      return yield* handleDeliveryFailure({
        destination,
        source,
        sourceState,
        error,
        deliveryWindow,
        recordsRead: window.records.length,
        eventsDropped: mapped.dropped,
        startedAt,
        now,
      })
    }

    return yield* handleDeliverySuccess({
      destination,
      source,
      startCursor,
      next,
      windowEnd,
      deliveryWindow,
      recordsRead: window.records.length,
      eventsSent: delivery.success.delivered,
      eventsDropped: mapped.dropped + delivery.success.dropped,
      startedAt,
      now,
    })
  }).pipe(Effect.withSpan("destinations.runDestinationSync")) as Effect.Effect<
    RunDestinationSyncResult,
    RunDestinationSyncError,
    Requirements
  >
