import type { ChSqlClient, DestinationId, OrganizationId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import { DESTINATION_SAFETY_LAG_MS } from "../constants.ts"
import type { DestinationSource } from "../entities/destination-source.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
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

    const windowEnd = new Date(input.now.getTime() - (input.safetyLagMs ?? DESTINATION_SAFETY_LAG_MS))
    const readers = yield* DestinationSourceReaders

    const sources = yield* Effect.forEach(enabled, (source) =>
      readers[source.source]
        .listWindow({
          organizationId: destination.organizationId,
          projectId: destination.projectId,
          cursor: { watermark: source.watermark, id: source.watermarkId },
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

    return { sources } satisfies DestinationFreshness
  }).pipe(Effect.withSpan("destinations.getDestinationFreshness")) as Effect.Effect<
    DestinationFreshness,
    NotFoundError | RepositoryError,
    SqlClient | DestinationRepository | DestinationSourceStateRepository | DestinationSourceReaders | ChSqlClient
  >
