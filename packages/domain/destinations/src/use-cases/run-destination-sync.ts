import {
  type ChSqlClient,
  type DestinationId,
  type DestinationSyncRunId,
  type RepositoryError,
  SpanId,
  type SqlClient,
} from "@domain/shared"
import { SpanRepository } from "@domain/spans"
import { Effect } from "effect"
import { DESTINATION_QUARANTINE_FAILURE_THRESHOLD, DESTINATION_SAFETY_LAG_MS } from "../constants.ts"
import type { Destination } from "../entities/destination.ts"
import { createDestinationSyncRun, type DestinationSyncRun } from "../entities/destination-sync-run.ts"
import { type DeliveryError, isRetryableDeliveryError, type RetryableDeliveryError } from "../errors.ts"
import { type DeliveryWindow, DestinationDeliverers } from "../ports/destination-deliverer.ts"
import { DestinationMappers } from "../ports/destination-mapper.ts"
import { type DestinationCursor, DestinationRepository } from "../ports/destination-repository.ts"
import { DestinationSyncRunRepository } from "../ports/destination-sync-run-repository.ts"

export interface RunDestinationSyncInput {
  readonly destination: Destination
  /** Injected for determinism; the worker passes wall-clock time. */
  readonly now: Date
}

export type RunDestinationSyncOutcome = "skipped" | "empty" | "delivered" | "failed" | "stale"

export interface RunDestinationSyncResult {
  readonly outcome: RunDestinationSyncOutcome
  readonly destinationId: DestinationId
  readonly spansRead: number
  readonly eventsSent: number
  readonly eventsDropped: number
  readonly cursorAdvanced: boolean
  readonly quarantined: boolean
  readonly syncRunId: DestinationSyncRunId | null
}

/**
 * Retryable delivery failures propagate so the worker throws and BullMQ retries
 * with the cursor untouched; exhausted-retry accounting lives in the worker's
 * final-failure hook. Everything else is handled in-band.
 */
export type RunDestinationSyncError = RetryableDeliveryError | RepositoryError

type Requirements =
  | SqlClient
  | ChSqlClient
  | SpanRepository
  | DestinationRepository
  | DestinationSyncRunRepository
  | DestinationDeliverers
  | DestinationMappers

const sanitizedFailureMessage = (error: DeliveryError): string =>
  error.upstreamStatus === undefined ? error.reason : `[${error.upstreamStatus}] ${error.reason}`

const isForward = (next: DestinationCursor, current: DestinationCursor): boolean =>
  next.ingestedAt.getTime() > current.ingestedAt.getTime() ||
  (next.ingestedAt.getTime() === current.ingestedAt.getTime() && next.spanId > current.spanId)

const result = (
  params: Partial<RunDestinationSyncResult> & { outcome: RunDestinationSyncOutcome; destinationId: DestinationId },
): RunDestinationSyncResult => ({
  spansRead: 0,
  eventsSent: 0,
  eventsDropped: 0,
  cursorAdvanced: false,
  quarantined: false,
  syncRunId: null,
  ...params,
})

/**
 * Destination-agnostic sync engine: reads the spans window
 * `(cursor, now − SAFETY_LAG]`, maps and delivers it, then advances the
 * compound cursor only after the whole delivered window lands. The cursor
 * always points at the end of fully delivered data — a retention backlog is
 * caught up across capped runs, never silently skipped. Quarantine, idle
 * backoff, and the sync-run audit row are all decided here; no vendor or
 * backfill logic leaks into the engine.
 */
export const runDestinationSyncUseCase = (input: RunDestinationSyncInput) =>
  Effect.gen(function* () {
    const { destination, now } = input
    yield* Effect.annotateCurrentSpan("destination.id", destination.id)
    yield* Effect.annotateCurrentSpan("destination.kind", destination.kind)

    if (destination.status !== "active") {
      return result({ outcome: "skipped", destinationId: destination.id })
    }

    const startedAt = now
    const windowEnd = new Date(now.getTime() - DESTINATION_SAFETY_LAG_MS)
    const startCursor: DestinationCursor = {
      ingestedAt: destination.cursorIngestedAt,
      spanId: destination.cursorSpanId,
    }

    const destinations = yield* DestinationRepository
    const syncRuns = yield* DestinationSyncRunRepository

    const insertRun = (run: DestinationSyncRun) => syncRuns.insert(run)

    const spans = yield* SpanRepository
    const window = yield* spans.listByIngestedAtWindow({
      organizationId: destination.organizationId,
      projectId: destination.projectId,
      cursor: { ingestedAt: startCursor.ingestedAt, spanId: SpanId(startCursor.spanId) },
      windowEnd,
      limit: destination.config.maxSpansPerRun,
    })

    if (window.spans.length === 0) {
      const emptyTarget: DestinationCursor = { ingestedAt: windowEnd, spanId: "" }
      const advances = isForward(emptyTarget, startCursor)
      if (advances) {
        const claimed = yield* destinations.advanceCursor({
          id: destination.id,
          expected: startCursor,
          next: emptyTarget,
        })
        if (!claimed) return result({ outcome: "stale", destinationId: destination.id })
      }

      yield* destinations.updateRunState({
        id: destination.id,
        status: "active",
        consecutiveFailures: 0,
        consecutiveEmptyRuns: destination.consecutiveEmptyRuns + 1,
        lastFailureMessage: destination.lastFailureMessage,
        lastRunAt: now,
      })

      const run = createDestinationSyncRun({
        organizationId: destination.organizationId,
        destinationId: destination.id,
        windowStart: startCursor.ingestedAt,
        windowEnd: advances ? windowEnd : startCursor.ingestedAt,
        status: "succeeded",
        spansRead: 0,
        eventsSent: 0,
        eventsDropped: 0,
        error: null,
        startedAt,
        finishedAt: now,
      })
      yield* insertRun(run)

      return result({ outcome: "empty", destinationId: destination.id, cursorAdvanced: advances, syncRunId: run.id })
    }

    // Non-empty: the read is strictly after the cursor, so `nextCursor` is always present and forward.
    const next = window.nextCursor
    const deliveryWindow: DeliveryWindow = {
      start: startCursor.ingestedAt,
      end: next ? next.ingestedAt : windowEnd,
    }

    const mappers = yield* DestinationMappers
    const mapped = yield* mappers[destination.kind].toEvents(window.spans, destination)

    const deliverers = yield* DestinationDeliverers
    const delivery = yield* deliverers[destination.kind]
      .deliver(mapped.events, destination.config, destination.credentials, { window: deliveryWindow })
      .pipe(Effect.result)

    if (delivery._tag === "Failure") {
      const error = delivery.failure
      if (isRetryableDeliveryError(error)) {
        return yield* Effect.fail(error)
      }

      const consecutiveFailures = destination.consecutiveFailures + 1
      const quarantined = consecutiveFailures >= DESTINATION_QUARANTINE_FAILURE_THRESHOLD
      const message = sanitizedFailureMessage(error)
      yield* destinations.updateRunState({
        id: destination.id,
        status: quarantined ? "quarantined" : "active",
        consecutiveFailures,
        consecutiveEmptyRuns: destination.consecutiveEmptyRuns,
        lastFailureMessage: message,
        lastRunAt: now,
      })

      const run = createDestinationSyncRun({
        organizationId: destination.organizationId,
        destinationId: destination.id,
        windowStart: deliveryWindow.start,
        windowEnd: deliveryWindow.end,
        status: "failed",
        spansRead: window.spans.length,
        eventsSent: 0,
        eventsDropped: mapped.dropped,
        error: message,
        startedAt,
        finishedAt: now,
      })
      yield* insertRun(run)

      return result({
        outcome: "failed",
        destinationId: destination.id,
        spansRead: window.spans.length,
        eventsDropped: mapped.dropped,
        quarantined,
        syncRunId: run.id,
      })
    }

    const claimed = yield* destinations.advanceCursor({
      id: destination.id,
      expected: startCursor,
      next: next ? { ingestedAt: next.ingestedAt, spanId: next.spanId } : { ingestedAt: windowEnd, spanId: "" },
    })
    if (!claimed) return result({ outcome: "stale", destinationId: destination.id, spansRead: window.spans.length })

    yield* destinations.updateRunState({
      id: destination.id,
      status: "active",
      consecutiveFailures: 0,
      consecutiveEmptyRuns: 0,
      lastFailureMessage: destination.lastFailureMessage,
      lastRunAt: now,
    })

    const eventsDropped = mapped.dropped + delivery.success.dropped
    const run = createDestinationSyncRun({
      organizationId: destination.organizationId,
      destinationId: destination.id,
      windowStart: deliveryWindow.start,
      windowEnd: deliveryWindow.end,
      status: "succeeded",
      spansRead: window.spans.length,
      eventsSent: delivery.success.delivered,
      eventsDropped,
      error: null,
      startedAt,
      finishedAt: now,
    })
    yield* insertRun(run)

    return result({
      outcome: "delivered",
      destinationId: destination.id,
      spansRead: window.spans.length,
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
