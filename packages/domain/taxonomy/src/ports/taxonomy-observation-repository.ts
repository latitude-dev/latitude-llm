import type {
  ChSqlClient,
  ExternalUserId,
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

export interface TaxonomyObservationCounts {
  readonly total: number
  readonly assigned: number
  readonly noise: number
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
  readonly listByCluster: (
    input: ListTaxonomyObservationClusterInput,
  ) => Effect.Effect<readonly TaxonomyMomentObservation[], RepositoryError, ChSqlClient>
  readonly listAllByCluster: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly clusterId: TaxonomyClusterId
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
}

export class TaxonomyObservationRepository extends Context.Service<
  TaxonomyObservationRepository,
  TaxonomyObservationRepositoryShape
>()("@domain/taxonomy/TaxonomyObservationRepository") {}
