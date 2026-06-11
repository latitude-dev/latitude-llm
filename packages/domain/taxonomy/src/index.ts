export {
  type BuildHierarchicalClustersInput,
  buildHierarchicalClusters,
  type ClusteringTreeNode,
  type DepthSchedule,
} from "./clustering.ts"
export {
  TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
  TAXONOMY_ASSIGN_RELATIVE_MARGIN,
  TAXONOMY_ASSIGN_TEMPERATURE,
  TAXONOMY_ASSIGN_TOPK,
  TAXONOMY_CENTROID_HALF_LIFE_SECONDS,
  TAXONOMY_CLUSTER_DESCRIPTION_MAX_LENGTH,
  TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
  TAXONOMY_CLUSTER_NAME_MAX_LENGTH,
  TAXONOMY_CLUSTER_STATES,
  TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
  TAXONOMY_CLUSTERING_SAMPLE_STRATEGY,
  TAXONOMY_CONTINUATION_THRESHOLD,
  TAXONOMY_DIMENSIONS,
  TAXONOMY_EMBEDDING_DIMENSIONS,
  TAXONOMY_EMBEDDING_MODEL,
  TAXONOMY_FPS_SAMPLE_BUDGET_MAX,
  TAXONOMY_FPS_SAMPLE_BUDGET_MIN,
  TAXONOMY_GARDENING_CRON_KEY,
  TAXONOMY_GARDENING_CRON_PATTERN,
  TAXONOMY_GARDENING_MIN_OBSERVATIONS,
  TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX,
  TAXONOMY_GARDENING_THROTTLE_MS,
  TAXONOMY_KMEANS_MAX_ITER,
  TAXONOMY_KMEANS_RESTARTS,
  TAXONOMY_KMEANS_TOLERANCE,
  TAXONOMY_LINEAGE_TRANSITION_TYPES,
  TAXONOMY_LIST_ALL_BY_CLUSTER_MAX,
  TAXONOMY_NAME_REUSE_THRESHOLD,
  TAXONOMY_NAMING_MODEL,
  TAXONOMY_NAMING_REFRESH_OBSERVATIONS,
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
  TAXONOMY_TREE_DEPTH_SCHEDULE,
  type TaxonomyObservationWeightScheme,
  type TaxonomyTreeDepthSchedule,
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
  TaxonomyClusterLockUnavailableError,
  TaxonomyClusterNotFoundError,
  TaxonomyQualityGateError,
} from "./errors.ts"
export {
  clamp,
  cosineSimilarity,
  cosineSimilarityNormalized,
  createTaxonomyCentroid,
  farthestPointSample,
  isDisplayableTaxonomyName,
  normalizeTaxonomyCentroid,
  normalizeTaxonomyEmbedding,
  softmax,
  type UpdateTaxonomyCentroidInput,
  updateTaxonomyCentroid,
} from "./helpers.ts"
export {
  type LineageDecision,
  type LineageNewNode,
  type LineageOldCluster,
  type MatchTaxonomyLineageInput,
  matchTaxonomyLineage,
  solveAssignment,
  type TaxonomyLineageMatch,
} from "./lineage.ts"
export { taxonomyClusterLockKey, withTaxonomyClusterLock } from "./locks.ts"
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
  type ReassignTaxonomyObservationByIdInput,
  type ReassignTaxonomyObservationInput,
  type TaxonomyClusteringObservation,
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
  type BuildHierarchicalTaxonomyInput,
  type BuildHierarchicalTaxonomyResult,
  buildHierarchicalTaxonomyUseCase,
  type HierarchicalTaxonomyPlan,
  type PersistHierarchicalTaxonomyPlanInput,
  type PlanHierarchicalTaxonomyInput,
  persistHierarchicalTaxonomyPlanUseCase,
  planHierarchicalTaxonomyUseCase,
  type TaxonomyClusterBuilder,
} from "./use-cases/build-hierarchical-taxonomy.ts"
export {
  type ClusterAssignmentDecision,
  decideClusterAssignment,
} from "./use-cases/decide-cluster-assignment.ts"
export { type EmitLineageInput, emitLineageUseCase } from "./use-cases/emit-lineage.ts"
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
  type NameClusterInput,
  type NameTaxonomyResult,
  nameClusterUseCase,
} from "./use-cases/name-taxonomy.ts"
export { type RouteToDeepestClusterInput, routeToDeepestClusterUseCase } from "./use-cases/route-to-deepest-cluster.ts"
export {
  type TriggerProjectGardeningInput,
  type TriggerProjectGardeningResult,
  taxonomyGardenProjectDedupeKey,
  triggerProjectGardeningUseCase,
} from "./use-cases/trigger-project-gardening.ts"
