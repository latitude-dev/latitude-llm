// Re-exported so `@domain/monitors` can size its saved-search seasonal window
// to the same history as the issue detector without depending on `@domain/scores`.
export { SEASONAL_HISTORY_WEEKS } from "@domain/scores"
export {
  CENTROID_HALF_LIFE_SECONDS,
  CENTROID_SOURCE_WEIGHTS,
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
  ISSUE_DETAILS_DEFAULT_GENERATION_MODEL,
  ISSUE_DETAILS_MAX_OCCURRENCES,
  ISSUE_DIMENSION_MIN_RATE_ELEVATION,
  ISSUE_DIMENSION_MIN_SUPPORT,
  ISSUE_DISCOVERY_MIN_RELEVANCE,
  ISSUE_DISCOVERY_MIN_SIMILARITY,
  ISSUE_DISCOVERY_MIN_VECTOR_SIMILARITY,
  ISSUE_DISCOVERY_RERANK_CANDIDATES,
  ISSUE_DISCOVERY_SEARCH_CANDIDATES,
  ISSUE_DISCOVERY_SEARCH_RATIO,
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_GROUPS,
  ISSUE_PRIORITY_ORDER,
  ISSUE_REFRESH_THROTTLE_MS,
  ISSUE_RELATED_CANDIDATE_LIMIT,
  ISSUE_RELATED_COOCCURRENCE_WINDOW_DAYS,
  ISSUE_RELATED_LIMIT,
  ISSUE_RELATED_MIN_RELATEDNESS,
  ISSUE_RELATED_MIN_SHARED_SESSIONS,
  ISSUE_RELATED_SEMANTIC_CEILING,
  ISSUE_RELATED_SEMANTIC_FLOOR,
  ISSUE_SOURCES,
  ISSUE_STATES,
  ISSUE_UPDATE_LOCK_KEY,
  ISSUE_UPDATE_LOCK_TTL_SECONDS,
  MIN_OCCURRENCES_FOR_VISIBILITY,
  MIN_SEASONAL_SAMPLES,
  NEW_ISSUE_AGE_DAYS,
} from "./constants.ts"
export { type DimensionPattern, rankDimensionValues } from "./dimension-patterns.ts"
export {
  type Issue,
  type IssueCentroid,
  IssuePriority,
  type IssueSource,
  type IssueState,
  issueCentroidSchema,
  issuePrioritySchema,
  issueSchema,
  issueSourceSchema,
  issueStateSchema,
} from "./entities/issue.ts"
export {
  type CheckEligibilityError,
  DraftScoreNotEligibleForDiscoveryError,
  ErroredScoreNotEligibleForDiscoveryError,
  IssueDiscoveryLockUnavailableError,
  IssueNotFoundForAssignmentError,
  IssueNotFoundForDetailsGenerationError,
  IssueNotFoundForEscalationCheckError,
  isEligibilityError,
  MissingIssueOccurrencesForDetailsGenerationError,
  MissingScoreFeedbackForDiscoveryError,
  PassedScoreNotEligibleForDiscoveryError,
  ScoreAlreadyOwnedByIssueError,
  ScoreDiscoveryOrganizationMismatchError,
  ScoreDiscoveryProjectMismatchError,
  ScoreNotFoundForDiscoveryError,
} from "./errors.ts"
export {
  createIssueCentroid,
  type DeriveIssueLifecycleStatesInput,
  deriveIssueLifecycleStates,
  evaluateSeasonalEscalation,
  getEscalationExitThreshold,
  getEscalationOccurrenceThreshold,
  isIssueNew,
  normalizeEmbedding,
  normalizeIssueCentroid,
  type SeasonalEscalationDecision,
  type SeasonalEscalationDecisionInput,
  type SeasonalEscalationExitReason,
  type SeasonalEscalationTransition,
  seasonalAnomalyThreshold,
  type UpdateIssueCentroidInput,
  updateIssueCentroid,
} from "./helpers.ts"
export { buildHistogramBucketScaffold, fillBuckets } from "./histogram-buckets.ts"
export { type IssueDiscoveryLockInput, issueDiscoveryLockKey, withIssueDiscoveryLock } from "./locks.ts"
export {
  type IssueCentroidNeighbor,
  type IssueLifecycleFlags,
  type IssueListPage,
  IssueRepository,
  type IssueRepositoryShape,
  type IssueSearchCandidate,
  type IssueWithLifecycle,
  type ListIssuesRepositoryInput,
  type OrgIssueSearchHit,
} from "./ports/issue-repository.ts"
export {
  type CoOccurrenceScoreInput,
  combinedRelatedness,
  coOccurrenceRelatednessScore,
  type RankRelatedIssuesInput,
  type RelatedIssueSignals,
  rankRelatedIssues,
  semanticRelatednessScore,
} from "./related-issues.ts"
export {
  type ApplyIssueLifecycleCommandError,
  type ApplyIssueLifecycleCommandInput,
  type ApplyIssueLifecycleCommandResult,
  applyIssueLifecycleCommandUseCase,
  type IssueLifecycleCommand,
  type IssueLifecycleCommandItem,
  issueLifecycleCommandSchema,
} from "./use-cases/apply-issue-lifecycle-command.ts"
export {
  type AssignOrCreateIssueError,
  type AssignOrCreateIssueInput,
  type AssignOrCreateIssueResult,
  assignOrCreateIssueUseCase,
} from "./use-cases/assign-or-create-issue-from-score.ts"
export {
  type AssignScoreToIssueError,
  type AssignScoreToIssueInput,
  type AssignScoreToIssueResult,
  assignScoreToIssueUseCase,
} from "./use-cases/assign-score-to-issue.ts"
export {
  type BuildIssuesExportInput,
  type BuildIssuesExportResult,
  buildIssuesExportUseCase,
} from "./use-cases/build-issues-export.ts"
export { type CheckEligibilityInput, checkEligibilityUseCase } from "./use-cases/check-eligibility.ts"
export {
  type CheckIssueEscalationError,
  type CheckIssueEscalationInput,
  type CheckIssueEscalationResult,
  type CheckIssueEscalationTransition,
  checkIssueEscalationUseCase,
} from "./use-cases/check-issue-escalation.ts"
export {
  type CreateIssueFromScoreError,
  type CreateIssueFromScoreInput,
  type CreateIssueFromScoreResult,
  createIssueFromScoreUseCase,
} from "./use-cases/create-issue-from-score.ts"
export {
  type DiscoverIssueError,
  type DiscoverIssueInput,
  type DiscoverIssueResult,
  type DiscoverIssueStartedWorkflow,
  discoverIssueUseCase,
} from "./use-cases/discover-issue.ts"
export {
  type EmbedIssueSearchQueryInput,
  type EmbedIssueSearchQueryResult,
  embedIssueSearchQueryUseCase,
} from "./use-cases/embed-issue-search-query.ts"
export {
  type EmbeddedScoreFeedback,
  type EmbedScoreFeedbackInput,
  embedScoreFeedbackUseCase,
} from "./use-cases/embed-score-feedback.ts"
export {
  type GeneratedIssueDetails,
  type GenerateIssueDetailsError,
  type GenerateIssueDetailsInput,
  generateIssueDetailsUseCase,
  type IssueOccurrenceInput,
} from "./use-cases/generate-issue-details.ts"
export {
  type GetIssueAnalyticsError,
  type GetIssueAnalyticsInput,
  type GetIssueAnalyticsResult,
  getIssueAnalyticsUseCase,
  type IssueAnalyticsBucket,
  type IssueAnalyticsCountMetric,
  type IssueAnalyticsOccurrencesMetric,
} from "./use-cases/get-issue-analytics.ts"
export {
  type GetIssueDetailsError,
  type GetIssueDetailsInput,
  getIssueDetailsUseCase,
  type IssueDetails,
} from "./use-cases/get-issue-details.ts"
export {
  type GetIssueTrendError,
  type GetIssueTrendInput,
  type GetIssueTrendResult,
  getIssueTrendUseCase,
} from "./use-cases/get-issue-trend.ts"
export {
  type GetRelatedIssuesError,
  type GetRelatedIssuesInput,
  getRelatedIssuesUseCase,
  type RelatedIssue,
} from "./use-cases/get-related-issues.ts"
export {
  type ListIssueTracesError,
  type ListIssueTracesInput,
  type ListIssueTracesResult,
  listIssueTracesUseCase,
} from "./use-cases/list-issue-traces.ts"
export {
  type IssueAssigneeFilter,
  type IssueListAnalytics,
  type IssueListAnalyticsCounts,
  type IssueListItem,
  type IssuePriorityGroup,
  type IssuesLifecycleGroup,
  type IssuesSortDirection,
  type IssuesSortField,
  issueAssigneeFilterSchema,
  issueSearchSchema,
  issuesLifecycleGroupSchema,
  issuesSortDirectionSchema,
  issuesSortFieldSchema,
  issuesTimeRangeSchema,
  type ListIssuesError,
  type ListIssuesInput,
  type ListIssuesResult,
  listIssuesUseCase,
  TAG_AGGREGATION_FALLBACK_DAYS,
  UNASSIGNED_FILTER,
} from "./use-cases/list-issues.ts"
export {
  type RefreshIssueDetailsError,
  type RefreshIssueDetailsInput,
  type RefreshIssueDetailsResult,
  refreshIssueDetailsUseCase,
} from "./use-cases/refresh-issue-details.ts"
export {
  type RemoveScoreFromIssueError,
  type RemoveScoreFromIssueInput,
  type RemoveScoreFromIssueResult,
  removeScoreFromIssueUseCase,
} from "./use-cases/remove-score-from-issue.ts"
export {
  type RerankIssueCandidatesInput,
  type RetrievalResult,
  rerankIssueCandidatesUseCase,
} from "./use-cases/rerank-issue-candidates.ts"
export {
  type OrgIssueSearchItem,
  type SearchOrgIssuesInput,
  searchOrgIssuesUseCase,
} from "./use-cases/search-org-issues.ts"
export {
  type SweepEscalatingIssuesPublish,
  type SweepEscalatingIssuesResult,
  sweepEscalatingIssuesUseCase,
} from "./use-cases/sweep-escalating-issues.ts"
export {
  type UpdateIssueTriageError,
  type UpdateIssueTriageInput,
  type UpdateIssueTriageResult,
  updateIssueTriageUseCase,
} from "./use-cases/update-issue-triage.ts"
