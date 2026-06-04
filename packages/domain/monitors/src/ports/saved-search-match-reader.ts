import type { ChSqlClient, FilterSet, OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"

/** What a saved-search alert counts traces against — its `query` and/or `filterSet` (both empty = every trace). */
export interface SavedSearchMatchTarget {
  readonly query: string | null
  readonly filterSet: FilterSet
}

export interface SavedSearchMatchWindowInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly target: SavedSearchMatchTarget
  /** Inclusive lower bound on trace `start_time`. */
  readonly from: Date
  /** Exclusive upper bound — the evaluation `now`. */
  readonly to: Date
}

/** Windowed match count + first-match for the evaluator. A dedicated port (not a `TraceRepository` widening) keeps the firing concern off the broadly-stubbed trace port. */
export interface SavedSearchMatchReaderShape {
  /** Traces matching `target` whose `start_time` falls in `[from, to)`. */
  countMatches(input: SavedSearchMatchWindowInput): Effect.Effect<number, RepositoryError, ChSqlClient>
  /** Earliest matching trace `start_time` in `[from, to)`, or `null` when none match. */
  firstMatchAt(input: SavedSearchMatchWindowInput): Effect.Effect<Date | null, RepositoryError, ChSqlClient>
}

export class SavedSearchMatchReader extends Context.Service<SavedSearchMatchReader, SavedSearchMatchReaderShape>()(
  "@domain/monitors/SavedSearchMatchReader",
) {}
