import type {
  ChSqlClient,
  ExternalUserId,
  FilterSet,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SessionId,
  TaxonomyClusterId,
  TaxonomyRunId,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import type { TaxonomyMomentObservation } from "../entities/observation.ts"

export interface ListTaxonomyNoiseInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly since: Date
  readonly limit?: number
}

export interface ListTaxonomyObservationClusterInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly clusterId: TaxonomyClusterId
  readonly limit: number
  readonly beforeStartTime?: Date
  readonly beforeObservationId?: string
}

export interface ReassignTaxonomyObservationInput {
  readonly observation: TaxonomyMomentObservation
  readonly assignedClusterId: TaxonomyClusterId
  readonly assignmentMethod: TaxonomyMomentObservation["assignmentMethod"]
  readonly assignmentConfidence: number
  readonly reassignmentRunId: TaxonomyRunId
  readonly indexedAt: Date
}

export interface ReassignTaxonomyObservationByIdInput {
  readonly observationId: string
  readonly assignedClusterId: TaxonomyClusterId
  readonly assignmentMethod: TaxonomyMomentObservation["assignmentMethod"]
  readonly assignmentConfidence: number
  readonly reassignmentRunId: TaxonomyRunId
  readonly indexedAt: Date
}

export interface TaxonomyClusteringObservation {
  readonly observationId: string
  readonly embedding: readonly number[]
  readonly startTime: Date
}

/**
 * A slim live-window row for full-window reassignment: carries the current
 * `assignedClusterId` so the invariant-confirm and catch-up passes can tell
 * which observations still point at a soon-to-deprecate cluster.
 */
export interface TaxonomyReassignmentWindowObservation {
  readonly observationId: string
  readonly sessionId: SessionId
  readonly embedding: readonly number[]
  readonly startTime: Date
  readonly assignedClusterId: string | null
}

/**
 * A clustering-sample observation carrying its `sessionId`, so scoped custom
 * behavior assignments (which live in the `taxonomy_view_assignments` slice,
 * keyed by session) can be written without a second lookup.
 */
export interface TaxonomyScopedClusteringObservation extends TaxonomyClusteringObservation {
  readonly sessionId: SessionId
}

/**
 * One sampled session for facet extraction: the ids + start time the caller
 * needs to build a `FacetExtractionSample`, plus the stored transcript summary
 * (`projection_metadata.summary`) the extractor reads instead of refetching
 * spans. `sessionObservationId` is the session's `taxonomy_observations`
 * observation id — the facet-projection cache key.
 */
export interface TaxonomyFacetSample {
  readonly sessionObservationId: string
  readonly sessionId: SessionId
  readonly startTime: Date
  readonly transcript: string
}

export interface TaxonomyObservationCounts {
  readonly total: number
  readonly assigned: number
  readonly noise: number
}

/** Eligible session + observation totals for a custom behavior's FilterSet over the lookback window. */
export interface CustomBehaviorSampleCounts {
  readonly sessionCount: number
  readonly observationCount: number
}

export interface TaxonomyObservationClusterOccurrence {
  readonly clusterId: TaxonomyClusterId
  readonly count: number
}

export interface TaxonomyObservationClusterTrendCounts {
  readonly clusterId: TaxonomyClusterId
  readonly currentCount: number
  readonly baselineCount: number
  readonly baselineDays: number
}

export interface TaxonomyObservationClusterAssignmentCount {
  readonly clusterId: TaxonomyClusterId
  readonly count: number
  readonly firstObservedAt: Date
  readonly lastObservedAt: Date
}

/** Clusterable observations per UTC day, for the lens coverage scan. */
export interface TaxonomyObservationDayCount {
  readonly day: Date
  readonly count: number
}

export interface TaxonomyObservationRepositoryShape {
  readonly upsert: (observation: TaxonomyMomentObservation) => Effect.Effect<void, RepositoryError, ChSqlClient>
  readonly upsertMany: (
    observations: readonly TaxonomyMomentObservation[],
  ) => Effect.Effect<void, RepositoryError, ChSqlClient>
  readonly reassignMany: (
    inputs: readonly ReassignTaxonomyObservationInput[],
  ) => Effect.Effect<void, RepositoryError, ChSqlClient>
  readonly reassignManyById: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly assignments: readonly ReassignTaxonomyObservationByIdInput[]
  }) => Effect.Effect<void, RepositoryError, ChSqlClient>
  /**
   * Which of the given observation ids already exist (any version). Lets the
   * analyzer make centroid increments idempotent across activity retries:
   * an observation row written before the increment marks it as applied.
   */
  readonly filterExistingIds: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly observationIds: readonly string[]
  }) => Effect.Effect<readonly string[], RepositoryError, ChSqlClient>
  readonly listNoise: (
    input: ListTaxonomyNoiseInput,
  ) => Effect.Effect<readonly TaxonomyMomentObservation[], RepositoryError, ChSqlClient>
  /**
   * Full observation rows in the live gardening window, regardless of current
   * assignment. Prefer `listForClusteringSample` for taxonomy builds so large
   * metadata columns do not round-trip through workflow activities.
   */
  readonly listForClustering: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly since: Date
    readonly limit: number
  }) => Effect.Effect<readonly TaxonomyMomentObservation[], RepositoryError, ChSqlClient>
  readonly listForClusteringSample: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly since: Date
    readonly limit: number
  }) => Effect.Effect<readonly TaxonomyClusteringObservation[], RepositoryError, ChSqlClient>
  /**
   * Scoped clustering sample for a custom behavior: the day-stratified sample
   * of `listForClusteringSample`, additionally restricted to observations whose
   * session matches `filterSet` (compiled via the shared session filter). Reads
   * global `taxonomy_observations` but never mutates it. `since` is the lookback
   * lower bound the caller derives from `TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS`
   * — the same gardening window global uses, so the two can't drift.
   */
  readonly listForCustomBehaviorSample: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly since: Date
    readonly limit: number
    readonly filterSet: FilterSet
  }) => Effect.Effect<readonly TaxonomyScopedClusteringObservation[], RepositoryError, ChSqlClient>
  /**
   * Facet-extraction sample over the same day-stratified `(since, limit)` window
   * `listForCustomBehaviorSample` uses, returning each session's ids, start time,
   * and stored transcript summary so the caller can build `FacetExtractionSample`
   * records. An optional `filterSet` scopes it to a cohort's sessions; omit it for
   * a whole-project facet. Reads global `taxonomy_observations`, never mutates it.
   */
  readonly listForFacetSample: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly since: Date
    readonly limit: number
    readonly filterSet?: FilterSet
  }) => Effect.Effect<readonly TaxonomyFacetSample[], RepositoryError, ChSqlClient>
  /**
   * The complete bounded live window (newest ≤ `limit`, no day-stratified
   * sampling) as slim rows carrying the current assignment — the read the
   * adaptive full-window reassignment and catch-up passes operate over. Optional
   * `filterSet` scopes it to a custom behavior's sessions (the scoped write
   * target); omit it for the global window. `excludeAssignedClusterIds` narrows
   * the read to rows NOT already pointing at one of those clusters — the catch-up
   * pass passes the current leaf ids so it only pays to pull embeddings for the
   * stragglers indexed during reassignment, not the whole window.
   */
  readonly listWindowForReassignment: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly limit: number
    readonly filterSet?: FilterSet
    readonly excludeAssignedClusterIds?: readonly TaxonomyClusterId[]
  }) => Effect.Effect<readonly TaxonomyReassignmentWindowObservation[], RepositoryError, ChSqlClient>
  /**
   * Server-side invariant-confirm counter: over the same bounded live window,
   * how many rows still point at one of `clusterIds` (the soon-to-deprecate
   * tree) and the window `total`. Aggregates in ClickHouse so the confirm never
   * ships embeddings back to the activity.
   */
  readonly countWindowAssignedToClusters: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly limit: number
    readonly clusterIds: readonly TaxonomyClusterId[]
    readonly filterSet?: FilterSet
  }) => Effect.Effect<{ readonly total: number; readonly matching: number }, RepositoryError, ChSqlClient>
  /**
   * True eligible totals for a custom behavior preview: the unsampled analogue
   * of `listForCustomBehaviorSample` (same `filterSet`/window scoping) counting
   * every matching observation and its distinct sessions. `observationCount` is
   * what the <15 not-ready gate compares against; `since` is the same gardening
   * sample window (`TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS`) the run itself uses.
   */
  readonly countForCustomBehaviorSample: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly since: Date
    readonly filterSet: FilterSet
  }) => Effect.Effect<CustomBehaviorSampleCounts, RepositoryError, ChSqlClient>
  readonly listByCluster: (
    input: ListTaxonomyObservationClusterInput,
  ) => Effect.Effect<readonly TaxonomyMomentObservation[], RepositoryError, ChSqlClient>
  readonly listAllByCluster: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly clusterId: TaxonomyClusterId
    readonly limit: number
  }) => Effect.Effect<readonly TaxonomyMomentObservation[], RepositoryError, ChSqlClient>
  /**
   * Members by explicit observation id, for naming a cluster whose membership is
   * not in `assigned_cluster_id` yet: a `staging` tree is named BEFORE the
   * reassignment repoints ClickHouse at it, so its samples come from the staged
   * plan's own member ids.
   */
  readonly listAllByObservationIds: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly observationIds: readonly string[]
    readonly limit: number
  }) => Effect.Effect<readonly TaxonomyMomentObservation[], RepositoryError, ChSqlClient>
  readonly listBySession: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly sessionId: SessionId
    readonly analysisHash?: string
  }) => Effect.Effect<readonly TaxonomyMomentObservation[], RepositoryError, ChSqlClient>
  readonly getCounts: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly since: Date
  }) => Effect.Effect<TaxonomyObservationCounts, RepositoryError, ChSqlClient>
  readonly getTopClustersByOccurrence: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly since: Date
    readonly limit: number
  }) => Effect.Effect<readonly TaxonomyObservationClusterOccurrence[], RepositoryError, ChSqlClient>
  readonly getClusterAssignmentCounts: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly clusterIds: readonly TaxonomyClusterId[]
    readonly startTimeFrom?: Date
    readonly startTimeTo?: Date
  }) => Effect.Effect<readonly TaxonomyObservationClusterAssignmentCount[], RepositoryError, ChSqlClient>
  /**
   * Per-cluster observation counts over one end-user's sessions, resolved by
   * finalizing the `sessions` MV's `user_id` state (observations carry no user
   * column). Ordered by count desc.
   */
  readonly getClusterCountsByUser: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly userId: ExternalUserId
  }) => Effect.Effect<readonly TaxonomyObservationClusterAssignmentCount[], RepositoryError, ChSqlClient>
  readonly getClusterTrendCounts: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly clusterIds: readonly TaxonomyClusterId[]
    readonly currentSince: Date
    readonly baselineSince: Date
    readonly baselineDays: number
  }) => Effect.Effect<readonly TaxonomyObservationClusterTrendCounts[], RepositoryError, ChSqlClient>
  /**
   * Observations a gardening pass could have clustered on each UTC day (same
   * eligibility as the sampling reads: a valid id and a non-empty embedding) —
   * the denominator of the lens coverage scan. Unscoped by design: coverage is
   * judged against the lens's own rate, so a view's filter cancels out of the
   * comparison and stays out of this query.
   */
  readonly getClusterableCountsByDay: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly since: Date
  }) => Effect.Effect<readonly TaxonomyObservationDayCount[], RepositoryError, ChSqlClient>
}

export class TaxonomyObservationRepository extends Context.Service<
  TaxonomyObservationRepository,
  TaxonomyObservationRepositoryShape
>()("@domain/taxonomy/TaxonomyObservationRepository") {}
