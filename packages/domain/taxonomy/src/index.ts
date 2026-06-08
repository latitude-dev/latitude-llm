export {
  TAXONOMY_ABSORPTION_THRESHOLD,
  TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
  TAXONOMY_ASSIGN_RELATIVE_MARGIN,
  TAXONOMY_ASSIGN_TEMPERATURE,
  TAXONOMY_ASSIGN_TOPK,
  TAXONOMY_BIRTH_LINK_THRESHOLD,
  TAXONOMY_BIRTH_MAX_DIAMETER,
  TAXONOMY_CENTROID_HALF_LIFE_SECONDS,
  TAXONOMY_CLUSTER_DESCRIPTION_MAX_LENGTH,
  TAXONOMY_CLUSTER_LOCK_MAX_RETRIES,
  TAXONOMY_CLUSTER_LOCK_RETRY_BASE_DELAY_MS,
  TAXONOMY_CLUSTER_LOCK_RETRY_MAX_DELAY_MS,
  TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
  TAXONOMY_CLUSTER_NAME_MAX_LENGTH,
  TAXONOMY_CLUSTER_STATES,
  TAXONOMY_DEAD_CLUSTER_INACTIVITY_DAYS,
  TAXONOMY_DEAD_CLUSTER_MASS_FLOOR,
  TAXONOMY_DIMENSIONS,
  TAXONOMY_EMBEDDING_DIMENSIONS,
  TAXONOMY_EMBEDDING_MODEL,
  TAXONOMY_FPS_SAMPLE_BUDGET_MAX,
  TAXONOMY_FPS_SAMPLE_BUDGET_MIN,
  TAXONOMY_GARDEN_LOCK_TTL_SECONDS,
  TAXONOMY_GARDENING_CRON_KEY,
  TAXONOMY_GARDENING_CRON_PATTERN,
  TAXONOMY_GARDENING_MAX_RUNTIME_MS,
  TAXONOMY_GARDENING_MIN_OBSERVATIONS,
  TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX,
  TAXONOMY_GARDENING_STALE_GRACE_MS,
  TAXONOMY_GARDENING_SWEEP_BATCH,
  TAXONOMY_GARDENING_THROTTLE_MS,
  TAXONOMY_LINEAGE_TRANSITION_TYPES,
  TAXONOMY_LIST_ALL_BY_CLUSTER_MAX,
  TAXONOMY_MERGE_CANDIDATES_PER_PARENT,
  TAXONOMY_MERGE_NEAREST_NEIGHBORS,
  TAXONOMY_MERGE_THRESHOLD,
  TAXONOMY_NAMING_MODEL,
  TAXONOMY_NAMING_REFRESH_OBSERVATIONS,
  TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_FLOOR,
  TAXONOMY_NOISE_BIRTH_MIN_OBSERVATIONS,
  TAXONOMY_NOISE_LOOKBACK_DAYS,
  TAXONOMY_OBSERVATION_ASSIGNMENT_METHODS,
  TAXONOMY_OBSERVATION_DEBOUNCE_MS,
  TAXONOMY_OBSERVATION_RETENTION_DAYS,
  TAXONOMY_OBSERVATION_WEIGHT_SCHEME,
  TAXONOMY_PENDING_DISPLAY_NAME,
  TAXONOMY_PROJECTION_METHODS,
  TAXONOMY_RUN_STATUSES,
  TAXONOMY_RUN_TRIGGERS,
  TAXONOMY_SEARCH_MIN_SCORE,
  TAXONOMY_SEARCH_MIN_VECTOR_SIMILARITY,
  TAXONOMY_TREE_CHILD_DIAMETER_FACTOR,
  TAXONOMY_TREE_CHILD_DIAMETER_MAX,
  TAXONOMY_TREE_CHILD_DIAMETER_MIN,
  type TaxonomyObservationWeightScheme,
} from "./constants.ts"
export {
  type TaxonomyCentroid,
  type TaxonomyCluster,
  TaxonomyClusterState,
  taxonomyCentroidSchema,
  taxonomyClusterSchema,
  taxonomyClusterStateSchema,
} from "./entities/cluster.ts"
export { TaxonomyDimension, taxonomyDimensionSchema } from "./entities/dimension.ts"
export {
  type TaxonomyClusterLineage,
  TaxonomyLineageTransitionType,
  type TaxonomyRun,
  TaxonomyRunStatus,
  type TaxonomyRunTrigger,
  taxonomyClusterLineageSchema,
  taxonomyLineageTransitionTypeSchema,
  taxonomyRunSchema,
  taxonomyRunStatusSchema,
  taxonomyRunTriggerSchema,
} from "./entities/lineage.ts"
export {
  type TaxonomyMomentObservation,
  TaxonomyObservationAssignmentMethod,
  TaxonomyProjectionMethod,
  taxonomyMomentObservationSchema,
  taxonomyObservationAssignmentMethodSchema,
  taxonomyProjectionMethodSchema,
} from "./entities/observation.ts"
export {
  TaxonomyCentroidModelMismatchError,
  TaxonomyClusterLockUnavailableError,
  TaxonomyClusterNotFoundError,
  TaxonomyEmbeddingDimensionMismatchError,
  TaxonomyGardeningTimeoutError,
  TaxonomyGardenLockUnavailableError,
  TaxonomyObservationNotFoundError,
  TaxonomyQualityGateError,
  TaxonomyRunNotFoundError,
} from "./errors.ts"
export {
  clamp,
  cosineSimilarity,
  cosineSimilarityNormalized,
  createTaxonomyCentroid,
  diameterBoundedGreedyClusters,
  farthestPointSample,
  isDisplayableTaxonomyName,
  meanNormalized,
  normalizeTaxonomyCentroid,
  normalizeTaxonomyEmbedding,
  quantileSorted,
  softmax,
  type UpdateTaxonomyCentroidInput,
  updateTaxonomyCentroid,
} from "./helpers.ts"
export {
  taxonomyClusterLockKey,
  taxonomyGardenLockKey,
  withTaxonomyClusterLock,
  withTaxonomyGardenLock,
} from "./locks.ts"
export {
  type ClusterAnalysisAggregate,
  type ClusterRepresentativeExample,
  TaxonomyClusterIntelligenceRepository,
  type TaxonomyClusterIntelligenceRepositoryShape,
} from "./ports/taxonomy-cluster-intelligence-repository.ts"
export {
  type ListClustersInput,
  type MarkMergedInput,
  type NearestClusterMatch,
  type TaxonomyClusterListPage,
  TaxonomyClusterRepository,
  type TaxonomyClusterRepositoryShape,
  type TaxonomyClusterSearchCandidate,
  type TaxonomyClusterSort,
} from "./ports/taxonomy-cluster-repository.ts"
export {
  TaxonomyLineageRepository,
  type TaxonomyLineageRepositoryShape,
} from "./ports/taxonomy-lineage-repository.ts"
export {
  type ListTaxonomyNoiseInput,
  type ListTaxonomyObservationClusterInput,
  type ReassignTaxonomyObservationInput,
  type TaxonomyObservationClusterAssignmentCount,
  type TaxonomyObservationClusterOccurrence,
  type TaxonomyObservationClusterTrendCounts,
  type TaxonomyObservationCounts,
  TaxonomyObservationRepository,
  type TaxonomyObservationRepositoryShape,
} from "./ports/taxonomy-observation-repository.ts"
export {
  TaxonomyRunRepository,
  type TaxonomyRunRepositoryShape,
} from "./ports/taxonomy-run-repository.ts"
export {
  classifyClusterTrend,
  type GetLastRunInput,
  type GetLastRunResult,
  type GetTaxonomyAnalyticsInput,
  type GetTaxonomyAnalyticsResult,
  getLastRunUseCase,
  getTaxonomyAnalyticsUseCase,
  TAXONOMY_TREND_BASELINE_DAYS,
  TAXONOMY_TREND_CURRENT_DAYS,
  TAXONOMY_TREND_MS_PER_DAY,
  type TaxonomyClusterTrendStatus,
  type TaxonomyClusterTrendSummary,
  type TopTaxonomyCluster,
} from "./use-cases/analytics.ts"
export {
  type AssertTaxonomyQualityInput,
  type AssertTaxonomyQualityResult,
  assertTaxonomyQualityUseCase,
} from "./use-cases/assert-taxonomy-quality.ts"
export {
  type AssignObservationToClusterInput,
  assignObservationToClusterUseCase,
  type ReplaceObservationInClusterInput,
  replaceObservationInClusterUseCase,
} from "./use-cases/assign-observation-to-cluster.ts"
export {
  type ClusterAssignmentDecision,
  type DecideClusterAssignmentInput,
  decideClusterAssignment,
  decideClusterAssignmentUseCase,
} from "./use-cases/decide-cluster-assignment.ts"
export {
  type DeprecateInactiveClustersInput,
  type DeprecateInactiveClustersResult,
  deprecateInactiveClustersUseCase,
} from "./use-cases/deprecate-inactive-clusters.ts"
export {
  type EmbedBehaviorSummaryInput,
  type EmbeddedBehaviorSummary,
  embedBehaviorSummaryUseCase,
} from "./use-cases/embed-behavior-summary.ts"
export { type EmitLineageInput, emitLineageUseCase } from "./use-cases/emit-lineage.ts"
export { type FindNearestClustersInput, findNearestClustersUseCase } from "./use-cases/find-nearest-clusters.ts"
export {
  type GetClusterSessionIntelligenceInput,
  type GetClusterSessionIntelligenceResult,
  getClusterSessionIntelligenceUseCase,
} from "./use-cases/get-cluster-session-intelligence.ts"
export {
  type GetClusterDetailsInput,
  type GetClusterDetailsResult,
  getClusterDetailsUseCase,
} from "./use-cases/get-details.ts"
export {
  type ListTaxonomyClustersInput,
  listClustersUseCase,
  type TaxonomyClusterPage,
} from "./use-cases/list-clusters.ts"
export {
  type ListObservationsInClusterResult,
  type ListTaxonomyObservationsInClusterInput,
  listObservationsInClusterUseCase,
} from "./use-cases/list-observations-in-cluster.ts"
export {
  type BehaviourFirstSeenLabel,
  type BehaviourNovelty,
  type BehaviourSegment,
  type BehaviourSortBy,
  type ListProjectBehavioursInput,
  type ListProjectBehavioursResult,
  listProjectBehavioursUseCase,
  type ProjectBehaviourNode,
} from "./use-cases/list-project-behaviours.ts"
export {
  type MergeNearDuplicateClustersInput,
  type MergeNearDuplicateClustersResult,
  mergeNearDuplicateClustersUseCase,
} from "./use-cases/merge-near-duplicate-clusters.ts"
export {
  type NameClusterInput,
  type NameTaxonomyResult,
  nameClusterUseCase,
} from "./use-cases/name-taxonomy.ts"
export {
  type ReassignNoiseToCurrentClustersInput,
  type ReassignNoiseToCurrentClustersResult,
  reassignNoiseToCurrentClustersUseCase,
} from "./use-cases/reassign-noise-to-current-clusters.ts"
export {
  type ReconcileClusterCountsInput,
  type ReconcileClusterCountsResult,
  reconcileClusterCountsUseCase,
} from "./use-cases/reconcile-cluster-counts.ts"
export {
  type RecurseTreeClustersInput,
  type RecurseTreeClustersResult,
  recurseTreeClustersUseCase,
} from "./use-cases/recurse-tree-clusters.ts"
export { type RouteToDeepestClusterInput, routeToDeepestClusterUseCase } from "./use-cases/route-to-deepest-cluster.ts"
export {
  type SweepNoiseAndBirthClustersInput,
  type SweepNoiseAndBirthClustersResult,
  sweepNoiseAndBirthClustersUseCase,
} from "./use-cases/sweep-noise-and-birth-clusters.ts"
export {
  type TriggerProjectGardeningInput,
  type TriggerProjectGardeningResult,
  taxonomyGardenProjectDedupeKey,
  triggerProjectGardeningUseCase,
} from "./use-cases/trigger-project-gardening.ts"
