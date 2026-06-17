import type { ChSqlClient, DestinationId, DestinationSyncRunId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { DESTINATION_QUARANTINE_FAILURE_THRESHOLD, DESTINATION_SAFETY_LAG_MS } from "../constants.ts"
import type { DestinationSource } from "../entities/destination-source.ts"
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
  ...params,
})

/**
 * Source-agnostic sync engine for one `(destination, source)` pair: reads the
 * source window `(cursor, now − SAFETY_LAG]`, maps and delivers it, then
 * advances the per-source compound cursor only after the whole delivered window
 * lands. The cursor always points at the end of fully delivered data — a
 * retention backlog is caught up across capped runs, never silently skipped.
 * Idle backoff and the sync-run audit row are per-source; quarantine is
 * destination-level (credentials/host are shared). No vendor or backfill logic
 * leaks into the engine.
 */
export const runDestinationSyncUseCase = (input: RunDestinationSyncInput) =>
  Effect.gen(function* () {
    const { destinationId, source, now, safetyLagMs } = input
    yield* Effect.annotateCurrentSpan("destination.id", destinationId)
    yield* Effect.annotateCurrentSpan("destination.source", source)

    const destinations = yield* DestinationRepository
    const sourceStates = yield* DestinationSourceStateRepository
    const syncRuns = yield* DestinationSyncRunRepository

    const destination = yield* destinations
      .findById(destinationId)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    if (!destination || destination.status !== "active") {
      return result({ outcome: "skipped", destinationId, source })
    }
    yield* Effect.annotateCurrentSpan("destination.kind", destination.kind)

    const sourceState = yield* sourceStates.findByDestinationAndSource({ destinationId, source })
    if (!sourceState || sourceState.status !== "enabled") {
      return result({ outcome: "skipped", destinationId, source })
    }

    const mappers = yield* DestinationMappers
    const mapper = mappers[destination.kind][source]
    if (!mapper) {
      return result({ outcome: "skipped", destinationId, source })
    }

    const startedAt = now
    const windowEnd = new Date(now.getTime() - (safetyLagMs ?? DESTINATION_SAFETY_LAG_MS))
    const startCursor: SourceCursor = { watermark: sourceState.watermark, id: sourceState.watermarkId }

    const readers = yield* DestinationSourceReaders
    const window = yield* readers[source].listWindow({
      organizationId: destination.organizationId,
      projectId: destination.projectId,
      cursor: startCursor,
      windowEnd,
      limit: sourceState.config.maxRecordsPerRun,
    })

    if (window.records.length === 0) {
      const emptyTarget: SourceCursor = { watermark: windowEnd, id: "" }
      const advances = isForward(emptyTarget, startCursor)
      if (advances) {
        const claimed = yield* sourceStates.advanceCursor({
          destinationId: destination.id,
          source,
          expected: startCursor,
          next: emptyTarget,
        })
        if (!claimed) return result({ outcome: "stale", destinationId: destination.id, source })
      }

      yield* sourceStates.updateRunState({
        destinationId: destination.id,
        source,
        consecutiveEmptyRuns: sourceState.consecutiveEmptyRuns + 1,
        lastRunAt: now,
      })

      return result({
        outcome: "empty",
        destinationId: destination.id,
        source,
        cursorAdvanced: advances,
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
      if (isRetryableDeliveryError(error)) {
        return yield* Effect.fail(error)
      }

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
        recordsRead: window.records.length,
        eventsSent: 0,
        eventsDropped: mapped.dropped,
        error: message,
        startedAt,
        finishedAt: now,
      })
      yield* syncRuns.insert(run)

      return result({
        outcome: "failed",
        destinationId: destination.id,
        source,
        recordsRead: window.records.length,
        eventsDropped: mapped.dropped,
        quarantined,
        syncRunId: run.id,
      })
    }

    const claimed = yield* sourceStates.advanceCursor({
      destinationId: destination.id,
      source,
      expected: startCursor,
      next: next ? { watermark: next.watermark, id: next.id } : { watermark: windowEnd, id: "" },
    })
    if (!claimed)
      return result({
        outcome: "stale",
        destinationId: destination.id,
        source,
        recordsRead: window.records.length,
      })

    yield* destinations.updateQuarantineState({
      id: destination.id,
      status: "active",
      consecutiveFailures: 0,
      lastFailureMessage: destination.lastFailureMessage,
    })
    yield* sourceStates.updateRunState({
      destinationId: destination.id,
      source,
      consecutiveEmptyRuns: 0,
      lastRunAt: now,
    })

    const eventsDropped = mapped.dropped + delivery.success.dropped
    const run = createDestinationSyncRun({
      organizationId: destination.organizationId,
      destinationId: destination.id,
      source,
      windowStart: deliveryWindow.start,
      windowEnd: deliveryWindow.end,
      status: "succeeded",
      recordsRead: window.records.length,
      eventsSent: delivery.success.delivered,
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
      recordsRead: window.records.length,
      eventsSent: delivery.success.delivered,
      eventsDropped,
      cursorAdvanced: true,
      syncRunId: run.id,
    })
  }).pipe(Effect.withSpan("destinations.runDestinationSync")) as Effect.Effect<
    RunDestinationSyncResult,
    RunDestinationSyncError,
    Requirements
  >
