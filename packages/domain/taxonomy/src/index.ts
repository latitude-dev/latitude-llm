export {
  TAXONOMY_ABSORPTION_THRESHOLD,
  TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
  TAXONOMY_ASSIGN_RELATIVE_MARGIN,
  TAXONOMY_ASSIGN_TEMPERATURE,
  TAXONOMY_ASSIGN_TOPK,
  TAXONOMY_BIRTH_LINK_THRESHOLD,
  TAXONOMY_BIRTH_MAX_DIAMETER,
  TAXONOMY_CATEGORY_CONTINUATION_THRESHOLD,
  TAXONOMY_CATEGORY_STATES,
  TAXONOMY_CENTROID_HALF_LIFE_SECONDS,
  TAXONOMY_CLUSTER_DESCRIPTION_MAX_LENGTH,
  TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
  TAXONOMY_CLUSTER_NAME_MAX_LENGTH,
  TAXONOMY_CLUSTER_STATES,
  TAXONOMY_DEAD_CLUSTER_INACTIVITY_DAYS,
  TAXONOMY_DEAD_CLUSTER_MASS_FLOOR,
  TAXONOMY_EMBEDDING_DIMENSIONS,
  TAXONOMY_EMBEDDING_MODEL,
  TAXONOMY_FPS_SAMPLE_BUDGET_MAX,
  TAXONOMY_FPS_SAMPLE_BUDGET_MIN,
  TAXONOMY_GARDEN_LOCK_TTL_SECONDS,
  TAXONOMY_GARDENING_CRON_KEY,
  TAXONOMY_GARDENING_CRON_PATTERN,
  TAXONOMY_GARDENING_MAX_RUNTIME_MS,
  TAXONOMY_GARDENING_MIN_OBSERVATIONS,
  TAXONOMY_GARDENING_STALE_GRACE_MS,
  TAXONOMY_GARDENING_SWEEP_BATCH,
  TAXONOMY_GARDENING_THROTTLE_MS,
  TAXONOMY_HIERARCHY_MAX_CATEGORIES,
  TAXONOMY_LINEAGE_TRANSITION_TYPES,
  TAXONOMY_LIST_ALL_BY_CLUSTER_MAX,
  TAXONOMY_MERGE_THRESHOLD,
  TAXONOMY_NAMING_MODEL,
  TAXONOMY_NAMING_REFRESH_OBSERVATIONS,
  TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_CEILING,
  TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_FLOOR,
  TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_RATIO,
  TAXONOMY_NOISE_BIRTH_MIN_OBSERVATIONS,
  TAXONOMY_NOISE_LOOKBACK_DAYS,
  TAXONOMY_OBSERVATION_ASSIGNMENT_METHODS,
  TAXONOMY_OBSERVATION_DEBOUNCE_MS,
  TAXONOMY_OBSERVATION_RETENTION_DAYS,
  TAXONOMY_OBSERVATION_WEIGHT_SCHEME,
  TAXONOMY_RUN_STATUSES,
  TAXONOMY_RUN_TRIGGERS,
  TAXONOMY_SEARCH_MIN_SCORE,
  TAXONOMY_SEARCH_MIN_VECTOR_SIMILARITY,
  TAXONOMY_SESSION_DOCUMENT_MAX_LENGTH,
  TAXONOMY_SESSION_MIN_LENGTH,
  TAXONOMY_SUMMARY_MIN_SESSION_TOKENS,
  TAXONOMY_SUMMARY_MODEL,
  TAXONOMY_SUMMARY_STRATEGIES,
  TAXONOMY_SUMMARY_STRATEGY,
  type TaxonomyObservationWeightScheme,
  type TaxonomySummaryStrategy,
} from "./constants.ts"
export {
  type TaxonomyCategory,
  TaxonomyCategoryState,
  taxonomyCategorySchema,
  taxonomyCategoryStateSchema,
} from "./entities/category.ts"
export {
  type TaxonomyCentroid,
  type TaxonomyCluster,
  TaxonomyClusterState,
  taxonomyCentroidSchema,
  taxonomyClusterSchema,
  taxonomyClusterStateSchema,
} from "./entities/cluster.ts"
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
  type TaxonomyObservation,
  TaxonomyObservationAssignmentMethod,
  taxonomyObservationAssignmentMethodSchema,
  taxonomyObservationSchema,
} from "./entities/observation.ts"
export {
  TaxonomyCategoryNotFoundError,
  TaxonomyCentroidModelMismatchError,
  TaxonomyClusterLockUnavailableError,
  TaxonomyClusterNotFoundError,
  TaxonomyEmbeddingDimensionMismatchError,
  TaxonomyGardeningTimeoutError,
  TaxonomyGardenLockUnavailableError,
  TaxonomyObservationNotFoundError,
  TaxonomyRunNotFoundError,
} from "./errors.ts"
export {
  type AgglomerativeAssignment,
  type AgglomerativeClusterInput,
  agglomerativeCluster,
  buildSessionDocument,
  clamp,
  cosineSimilarity,
  cosineSimilarityNormalized,
  createTaxonomyCentroid,
  farthestPointSample,
  meanNormalized,
  normalizeTaxonomyCentroid,
  normalizeTaxonomyEmbedding,
  type SessionDocument,
  type SingleLinkageCandidate,
  type SingleLinkageClustersInput,
  singleLinkageClusters,
  softmax,
  type UpdateTaxonomyCentroidInput,
  updateTaxonomyCentroid,
} from "./helpers.ts"
export {
  type BehaviorObservationClusterOccurrence,
  type BehaviorObservationCounts,
  BehaviorObservationRepository,
  type BehaviorObservationRepositoryShape,
  type ListNoiseInput,
  type ListObservationsInClusterInput,
  type ReassignObservationInput,
} from "./ports/behavior-observation-repository.ts"
export {
  type BestCategoryMatch,
  TaxonomyCategoryRepository,
  type TaxonomyCategoryRepositoryShape,
} from "./ports/taxonomy-category-repository.ts"
export {
  type BulkUpdateParentCategoryInput,
  type IncrementObservationCountInput,
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
  type TaxonomyClusterLockInput,
  type TaxonomyGardenLockInput,
  TaxonomyLockRepository,
  type TaxonomyLockRepositoryShape,
} from "./ports/taxonomy-lock-repository.ts"
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
  type AssignObservationToClusterInput,
  assignObservationToClusterUseCase,
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
  type GetCategoryDetailsInput,
  type GetCategoryDetailsResult,
  type GetClusterDetailsInput,
  type GetClusterDetailsResult,
  getCategoryDetailsUseCase,
  getClusterDetailsUseCase,
} from "./use-cases/get-details.ts"
export {
  type ListCategoriesInput,
  type ListCategoriesResult,
  listCategoriesUseCase,
} from "./use-cases/list-categories.ts"
export {
  type ListClustersInCategoryInput,
  type ListTaxonomyClustersInput,
  listClustersInCategoryUseCase,
  listClustersUseCase,
  type TaxonomyClusterPage,
} from "./use-cases/list-clusters.ts"
export {
  type ListObservationsInClusterResult,
  type ListTaxonomyObservationsInClusterInput,
  listObservationsInClusterUseCase,
} from "./use-cases/list-observations-in-cluster.ts"
export {
  type MergeNearDuplicateClustersInput,
  type MergeNearDuplicateClustersResult,
  mergeNearDuplicateClustersUseCase,
} from "./use-cases/merge-near-duplicate-clusters.ts"
export {
  type NameCategoryInput,
  type NameClusterInput,
  type NameTaxonomyResult,
  nameCategoryUseCase,
  nameClusterUseCase,
} from "./use-cases/name-taxonomy.ts"
export {
  type ReassignNoiseToCurrentClustersInput,
  type ReassignNoiseToCurrentClustersResult,
  reassignNoiseToCurrentClustersUseCase,
} from "./use-cases/reassign-noise-to-current-clusters.ts"
export {
  type RebuildCategoryHierarchyInput,
  type RebuildCategoryHierarchyResult,
  rebuildCategoryHierarchyUseCase,
} from "./use-cases/rebuild-category-hierarchy.ts"
export {
  type RecordSessionObservationInput,
  type RecordSessionObservationResult,
  recordSessionObservationUseCase,
} from "./use-cases/record-session-observation.ts"
export {
  type RunProjectGardeningInput,
  runProjectGardeningUseCase,
} from "./use-cases/run-project-gardening.ts"
export {
  type BehaviorSummary,
  behaviorSummarySchema,
  type SummarizeBehaviorInput,
  summarizeBehaviorUseCase,
} from "./use-cases/summarize-behavior.ts"
export {
  computeBirthMinMembers,
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
