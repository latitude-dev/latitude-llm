import type { QueuePublishError } from "@domain/queue"
import type {
  ConflictError,
  DestinationId,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SqlClient,
} from "@domain/shared"
import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import type { Destination } from "../entities/destination.ts"
import type { DestinationSource } from "../entities/destination-source.ts"
import { DestinationDeliverers } from "../ports/destination-deliverer.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { DestinationRetentionPolicy } from "../ports/destination-retention-policy.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"

export interface ResumeDestinationInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly destinationId: DestinationId
  /** Resume instant; the gap `[watermark, now]` past the historical boundary is what gets backfilled. */
  readonly now: Date
  /** Enqueues the gap backfill for a source whose paused window reached past the historical boundary; `since` is the old watermark clamped to retention, `until` is the resume instant (the gap's upper edge). */
  readonly publish: (job: {
    readonly source: DestinationSource
    readonly since: Date
    readonly until: Date
  }) => Effect.Effect<void, QueuePublishError>
}

export interface ResumeDestinationResult {
  readonly destination: Destination
  /** Sources whose missed window was enqueued as a gap backfill. */
  readonly backfillsStarted: number
  /** Sources whose gap backfill failed to enqueue — their cursor was left so live catch-up still covers the gap. */
  readonly backfillsFailed: number
}

export type ResumeDestinationError = NotFoundError | ConflictError | RepositoryError

type Requirements =
  | SqlClient
  | DestinationRepository
  | DestinationSourceStateRepository
  | DestinationDeliverers
  | DestinationRetentionPolicy

/**
 * Resumes a paused destination back to `active`. For a destination with a
 * historical boundary, any source whose cursor froze past `now − boundary` has
 * its missed window enqueued as a gap backfill (old records get historical
 * ingestion rather than wrong live semantics) and its live cursor advanced to
 * `now` so live resumes clean and forward. Enqueue is the committing step: the
 * cursor only jumps once the backfill is queued, so a publish failure leaves the
 * cursor and live catch-up still covers the gap — no window is silently dropped.
 * A boundary-less destination (or a within-boundary gap) just forward-catches-up:
 * cursor untouched, nothing enqueued. Quarantine is not cleared here; that path
 * is editing credentials or host via {@link updateDestinationUseCase}.
 */
export const resumeDestinationUseCase = (input: ResumeDestinationInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("destinationId", input.destinationId)

    const destinations = yield* DestinationRepository
    const current = yield* destinations.findById(input.destinationId)
    if (current.projectId !== input.projectId) {
      return yield* Effect.fail(new NotFoundError({ entity: "Destination", id: input.destinationId }))
    }
    if (current.status === "active") return { destination: current, backfillsStarted: 0, backfillsFailed: 0 }

    const updated: Destination = { ...current, status: "active", updatedAt: new Date() }
    yield* destinations.save(updated)

    const boundaryMs = (yield* DestinationDeliverers)[current.kind].historicalBoundaryMs
    if (boundaryMs === undefined) return { destination: updated, backfillsStarted: 0, backfillsFailed: 0 }

    const sourceStates = yield* DestinationSourceStateRepository
    const states = yield* sourceStates.listByDestinationId(current.id)
    const maxAgeMs = yield* (yield* DestinationRetentionPolicy).maxAgeMs(current.organizationId)
    const boundaryInstant = input.now.getTime() - boundaryMs
    const floor = input.now.getTime() - maxAgeMs

    let backfillsStarted = 0
    let backfillsFailed = 0
    for (const state of states) {
      if (state.status !== "enabled") continue
      const gapStart = state.watermark.getTime()
      if (gapStart >= boundaryInstant) continue // gap is within the boundary → live catch-up is correct

      const since = new Date(Math.max(gapStart, floor))
      // Enqueue first, then jump the cursor — so a publish failure leaves the gap to live catch-up.
      const enqueued = yield* input.publish({ source: state.source, since, until: input.now }).pipe(
        Effect.as(true),
        Effect.catch(() => Effect.succeed(false)),
      )
      if (!enqueued) {
        backfillsFailed += 1
        continue
      }
      yield* sourceStates.setWatermark({
        destinationId: current.id,
        source: state.source,
        watermark: { watermark: input.now, id: "" },
      })
      backfillsStarted += 1
    }

    return { destination: updated, backfillsStarted, backfillsFailed }
  }).pipe(Effect.withSpan("destinations.resumeDestination")) as Effect.Effect<
    ResumeDestinationResult,
    ResumeDestinationError,
    Requirements
  >
