// Re-exported so `@domain/monitors` can size its saved-search seasonal window
// to the same history as the issue detector without depending on `@domain/scores`.
export { SEASONAL_HISTORY_WEEKS } from "@domain/scores"
export {
  CANDIDATE_EXPIRY_IDLE_DAYS,
  CANDIDATE_EXPIRY_SWEEP_LIMIT,
  CANDIDATE_SWEEPER_KEY,
  CANDIDATE_SWEEPER_PATTERN,
  CENTROID_HALF_LIFE_SECONDS,
  CENTROID_SOURCE_WEIGHTS,
  CONSOLIDATION_MAX_MERGES_PER_PASS,
  CONSOLIDATION_MIN_SIMILARITY,
  CONSOLIDATION_NEIGHBOR_LIMIT,
  CONSOLIDATION_THROTTLE_MS,
  DEFAULT_ESCALATION_SENSITIVITY_K,
  ESCALATION_ABSOLUTE_RATE_EXIT_FACTOR,
  ESCALATION_CHECK_THROTTLE_MS,
  ESCALATION_EXIT_DWELL_MS,
  ESCALATION_EXIT_THRESHOLD_FACTOR,
  ESCALATION_MAX_DURATION_MS,
  ESCALATION_MIN_OCCURRENCES_THRESHOLD,
  ESCALATION_SWEEPER_KEY,
  ESCALATION_SWEEPER_PATTERN,
  ESCALATION_THRESHOLD_FACTOR,
  MIN_SEASONAL_SAMPLES,
  NEW_SIGNAL_AGE_DAYS,
  SIGNAL_DETAILS_DEFAULT_GENERATION_MODEL,
  SIGNAL_DETAILS_MAX_OCCURRENCES,
  SIGNAL_DIMENSION_MIN_RATE_ELEVATION,
  SIGNAL_DIMENSION_MIN_SUPPORT,
  SIGNAL_DISCOVERY_MIN_RELEVANCE,
  SIGNAL_DISCOVERY_MIN_SIMILARITY,
  SIGNAL_DISCOVERY_MIN_VECTOR_SIMILARITY,
  SIGNAL_DISCOVERY_RERANK_CANDIDATES,
  SIGNAL_DISCOVERY_SEARCH_CANDIDATES,
  SIGNAL_DISCOVERY_SEARCH_RATIO,
  SIGNAL_FEEDBACK_MAX_LENGTH,
  SIGNAL_FEEDBACK_OCCURRENCE_SAMPLE_LIMIT,
  SIGNAL_FEEDBACK_THROTTLE_MS,
  SIGNAL_GENERATION_DEADLINE_MS,
  SIGNAL_GENERATION_DEFAULT_MODEL,
  SIGNAL_GENERATION_MAX_STEPS,
  SIGNAL_GENERATION_PROMPT_MAX_LENGTH,
  SIGNAL_PRIORITIES,
  SIGNAL_PRIORITY_GROUPS,
  SIGNAL_PRIORITY_ORDER,
  SIGNAL_PROMOTION_THROTTLE_MS,
  SIGNAL_REFRESH_THROTTLE_MS,
  SIGNAL_RELATED_CANDIDATE_LIMIT,
  SIGNAL_RELATED_COOCCURRENCE_WINDOW_DAYS,
  SIGNAL_RELATED_LIMIT,
  SIGNAL_RELATED_MIN_RELATEDNESS,
  SIGNAL_RELATED_MIN_SHARED_SESSIONS,
  SIGNAL_RELATED_SEMANTIC_CEILING,
  SIGNAL_RELATED_SEMANTIC_FLOOR,
  SIGNAL_SOURCES,
  SIGNAL_STATES,
  SIGNAL_UPDATE_LOCK_KEY,
  SIGNAL_UPDATE_LOCK_TTL_SECONDS,
} from "./constants.ts"
export { type DimensionPattern, rankDimensionValues } from "./dimension-patterns.ts"
export {
  type Signal,
  type SignalCentroid,
  type SignalFeedback,
  SignalPriority,
  type SignalSource,
  type SignalState,
  signalCentroidSchema,
  signalFeedbackSchema,
  signalPrioritySchema,
  signalSchema,
  signalSourceSchema,
  signalStateSchema,
} from "./entities/signal.ts"
export {
  type CheckEligibilityError,
  DraftScoreNotEligibleForDiscoveryError,
  ErroredScoreNotEligibleForDiscoveryError,
  isEligibilityError,
  MissingScoreFeedbackForDiscoveryError,
  MissingSignalOccurrencesForDetailsGenerationError,
  PassedScoreNotEligibleForDiscoveryError,
  ScoreAlreadyOwnedBySignalError,
  ScoreDiscoveryOrganizationMismatchError,
  ScoreDiscoveryProjectMismatchError,
  ScoreNotFoundForDiscoveryError,
  SignalDiscoveryLockUnavailableError,
  SignalFeedbackAlreadySubmittedError,
  SignalFeedbackNotSupportedError,
  SignalFeedbackReasonRequiredError,
  SignalNotFoundForAssignmentError,
  SignalNotFoundForDetailsGenerationError,
  SignalNotFoundForEscalationCheckError,
} from "./errors.ts"
export {
  createSignalCentroid,
  type DeriveSignalLifecycleStatesInput,
  deriveSignalLifecycleStates,
  evaluateSeasonalEscalation,
  getEscalationExitThreshold,
  getEscalationOccurrenceThreshold,
  isSignalNew,
  normalizeEmbedding,
  normalizeSignalCentroid,
  type SeasonalEscalationDecision,
  type SeasonalEscalationDecisionInput,
  type SeasonalEscalationExitReason,
  type SeasonalEscalationTransition,
  seasonalAnomalyThreshold,
  type UpdateSignalCentroidInput,
  updateSignalCentroid,
} from "./helpers.ts"
export { buildHistogramBucketScaffold, fillBuckets } from "./histogram-buckets.ts"
export { type SignalDiscoveryLockInput, signalDiscoveryLockKey, withSignalDiscoveryLock } from "./locks.ts"
export {
  type ListSignalsRepositoryInput,
  type OrgSignalSearchHit,
  type SignalCentroidNeighbor,
  type SignalLifecycleFlags,
  type SignalListPage,
  SignalRepository,
  type SignalRepositoryShape,
  type SignalSearchCandidate,
  type SignalWithLifecycle,
} from "./ports/signal-repository.ts"
export {
  type CoOccurrenceScoreInput,
  combinedRelatedness,
  coOccurrenceRelatednessScore,
  type RankRelatedSignalsInput,
  type RelatedSignalSignals,
  rankRelatedSignals,
  semanticRelatednessScore,
} from "./related-signals.ts"
export {
  buildSignalGenerationResultKey,
  SIGNAL_GENERATION_RESULT_TTL_SECONDS,
  type SignalGenerationResult,
} from "./signal-generation-result.ts"
export {
  type ApplySignalLifecycleCommandError,
  type ApplySignalLifecycleCommandInput,
  type ApplySignalLifecycleCommandResult,
  applySignalLifecycleCommandUseCase,
  type SignalLifecycleCommand,
  type SignalLifecycleCommandItem,
  signalLifecycleCommandSchema,
} from "./use-cases/apply-signal-lifecycle-command.ts"
export {
  type AssignOrCreateSignalError,
  type AssignOrCreateSignalInput,
  type AssignOrCreateSignalResult,
  assignOrCreateSignalUseCase,
} from "./use-cases/assign-or-create-signal-from-score.ts"
export {
  type AssignScoreToSignalError,
  type AssignScoreToSignalInput,
  type AssignScoreToSignalResult,
  assignScoreToSignalUseCase,
} from "./use-cases/assign-score-to-signal.ts"
export {
  type BuildSignalsExportInput,
  type BuildSignalsExportResult,
  buildSignalsExportUseCase,
} from "./use-cases/build-signals-export.ts"
export { type CheckEligibilityInput, checkEligibilityUseCase } from "./use-cases/check-eligibility.ts"
export {
  type CheckSignalEscalationError,
  type CheckSignalEscalationInput,
  type CheckSignalEscalationResult,
  type CheckSignalEscalationTransition,
  checkSignalEscalationUseCase,
} from "./use-cases/check-signal-escalation.ts"
export {
  type CreateSignalFromScoreError,
  type CreateSignalFromScoreInput,
  type CreateSignalFromScoreResult,
  createSignalFromScoreUseCase,
} from "./use-cases/create-signal-from-score.ts"
export {
  type DiscoverSignalError,
  type DiscoverSignalInput,
  type DiscoverSignalResult,
  type DiscoverSignalStartedWorkflow,
  discoverSignalUseCase,
} from "./use-cases/discover-signal.ts"
export {
  type EmbeddedScoreFeedback,
  type EmbedScoreFeedbackInput,
  embedScoreFeedbackUseCase,
} from "./use-cases/embed-score-feedback.ts"
export {
  type EmbedSignalSearchQueryInput,
  type EmbedSignalSearchQueryResult,
  embedSignalSearchQueryUseCase,
} from "./use-cases/embed-signal-search-query.ts"
export {
  type GeneratedSignalDetails,
  type GenerateSignalDetailsError,
  type GenerateSignalDetailsInput,
  generateSignalDetailsUseCase,
  type SignalOccurrenceInput,
} from "./use-cases/generate-signal-details.ts"
export {
  type GetRelatedSignalsError,
  type GetRelatedSignalsInput,
  getRelatedSignalsUseCase,
  type RelatedSignal,
} from "./use-cases/get-related-signals.ts"
export {
  type GetSignalAnalyticsError,
  type GetSignalAnalyticsInput,
  type GetSignalAnalyticsResult,
  getSignalAnalyticsUseCase,
  type SignalAnalyticsBucket,
  type SignalAnalyticsCountMetric,
  type SignalAnalyticsOccurrencesMetric,
} from "./use-cases/get-signal-analytics.ts"
export {
  type GetSignalDetailsError,
  type GetSignalDetailsInput,
  getSignalDetailsUseCase,
  type SignalDetails,
} from "./use-cases/get-signal-details.ts"
export {
  type GetSignalImpactError,
  type GetSignalImpactInput,
  getSignalImpactUseCase,
  type SignalImpact,
} from "./use-cases/get-signal-impact.ts"
export {
  type GetSignalTrendError,
  type GetSignalTrendInput,
  type GetSignalTrendResult,
  getSignalTrendUseCase,
} from "./use-cases/get-signal-trend.ts"
export {
  type ListSessionSignalsError,
  type ListSessionSignalsInput,
  listSessionSignalsUseCase,
  type SessionSignal,
} from "./use-cases/list-session-signals.ts"
export {
  type ListSignalTracesError,
  type ListSignalTracesInput,
  type ListSignalTracesResult,
  listSignalTracesUseCase,
} from "./use-cases/list-signal-traces.ts"
export {
  type ListSignalsError,
  type ListSignalsInput,
  type ListSignalsResult,
  listSignalsUseCase,
  type SignalAssigneeFilter,
  type SignalListAnalytics,
  type SignalListAnalyticsCounts,
  type SignalListItem,
  type SignalPriorityGroup,
  type SignalsLifecycleGroup,
  type SignalsSortDirection,
  type SignalsSortField,
  signalAssigneeFilterSchema,
  signalSearchSchema,
  signalsLifecycleGroupSchema,
  signalsSortDirectionSchema,
  signalsSortFieldSchema,
  signalsTimeRangeSchema,
  TAG_AGGREGATION_FALLBACK_DAYS,
  UNASSIGNED_FILTER,
} from "./use-cases/list-signals.ts"
export {
  type ListUserSignalsError,
  type ListUserSignalsInput,
  listUserSignalsUseCase,
  type UserSignalItem,
} from "./use-cases/list-user-signals.ts"
export {
  type PromoteSignalError,
  type PromoteSignalInput,
  type PromoteSignalResult,
  promoteSignalUseCase,
} from "./use-cases/promote-signal.ts"
export {
  type RefreshSignalDetailsError,
  type RefreshSignalDetailsInput,
  type RefreshSignalDetailsResult,
  refreshSignalDetailsUseCase,
} from "./use-cases/refresh-signal-details.ts"
export {
  type RemoveScoreFromSignalError,
  type RemoveScoreFromSignalInput,
  type RemoveScoreFromSignalResult,
  removeScoreFromSignalUseCase,
} from "./use-cases/remove-score-from-signal.ts"
export {
  type RerankSignalCandidatesInput,
  type RetrievalResult,
  rerankSignalCandidatesUseCase,
} from "./use-cases/rerank-signal-candidates.ts"
export {
  type ReviewSignalFlaggerOccurrencesError,
  type ReviewSignalFlaggerOccurrencesInput,
  type ReviewSignalFlaggerOccurrencesResult,
  reviewSignalFlaggerOccurrencesUseCase,
} from "./use-cases/review-signal-flagger-occurrences.ts"
export {
  type OrgSignalSearchItem,
  type SearchOrgSignalsInput,
  searchOrgSignalsUseCase,
} from "./use-cases/search-org-signals.ts"
export {
  type SubmitSignalFeedbackError,
  type SubmitSignalFeedbackInput,
  type SubmitSignalFeedbackResult,
  submitSignalFeedbackUseCase,
} from "./use-cases/submit-signal-feedback.ts"
export {
  type SweepEscalatingSignalsPublish,
  type SweepEscalatingSignalsResult,
  sweepEscalatingSignalsUseCase,
} from "./use-cases/sweep-escalating-signals.ts"
export {
  type UpdateSignalTriageError,
  type UpdateSignalTriageInput,
  type UpdateSignalTriageResult,
  updateSignalTriageUseCase,
} from "./use-cases/update-signal-triage.ts"
