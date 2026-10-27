import type { OrganizationId, ProjectId, RepositoryError, TraceId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { TracePurgeScope } from "./trace-purge-repository.ts"

export interface TombstoneCandidate {
  readonly projectId: ProjectId
  readonly traceId: TraceId
}

/**
 * Remembers purged traces for a grace window so spans that arrive after a deletion are dropped at
 * ingest instead of recreating the trace.
 */
export interface TraceTombstoneRepositoryShape {
  /** Marks the traces as deleted. Recording a trace twice is harmless. */
  record(input: TracePurgeScope & { readonly traceIds: readonly TraceId[] }): Effect.Effect<void, RepositoryError>

  /** The `projectId:traceId` keys among the candidates that were deleted within the grace window. */
  listTombstoned(input: {
    readonly organizationId: OrganizationId
    readonly candidates: readonly TombstoneCandidate[]
  }): Effect.Effect<ReadonlySet<string>, RepositoryError>
}

export class TraceTombstoneRepository extends Context.Service<
  TraceTombstoneRepository,
  TraceTombstoneRepositoryShape
>()("@domain/spans/TraceTombstoneRepository") {}

export const tombstoneKey = (candidate: TombstoneCandidate): string => `${candidate.projectId}:${candidate.traceId}`
