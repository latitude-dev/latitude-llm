export {
  AUTO_RESOLVE_INACTIVITY_DAYS,
  CENTROID_EMBEDDING_DIMENSIONS,
  CENTROID_EMBEDDING_MODEL,
  CENTROID_HALF_LIFE_SECONDS,
  CENTROID_SOURCE_WEIGHTS,
  ESCALATION_THRESHOLD_FACTOR,
  ISSUE_DISCOVERY_MAX_CANDIDATES,
  ISSUE_DISCOVERY_MIN_KEYWORDS,
  ISSUE_DISCOVERY_MIN_SIMILARITY,
  ISSUE_DISCOVERY_SEARCH_RATIO,
  ISSUE_REFRESH_DEBOUNCE_MS,
  ISSUE_STATES,
  MIN_OCCURRENCES_FOR_VISIBILITY,
  MIN_RERANK_RELEVANCE,
  NEW_ISSUE_AGE_DAYS,
  RERANK_LIMIT,
  RERANK_MODEL,
} from "./constants.ts"
export {
  type Issue,
  type IssueCentroid,
  type IssueState,
  issueCentroidSchema,
  issueIdSchema,
  issueSchema,
  issueStateSchema,
} from "./entities/issue.ts"
export {
  type CheckEligibilityError,
  DraftScoreNotEligibleForDiscoveryError,
  ErroredScoreNotEligibleForDiscoveryError,
  MissingScoreFeedbackForDiscoveryError,
  PassedScoreNotEligibleForDiscoveryError,
  ScoreAlreadyOwnedByIssueError,
  ScoreDiscoveryOrganizationMismatchError,
  ScoreDiscoveryProjectMismatchError,
  ScoreNotFoundForDiscoveryError,
} from "./errors.ts"
export {
  createIssueCentroid,
  normalizeEmbedding,
  normalizeIssueCentroid,
  type UpdateIssueCentroidInput,
  updateIssueCentroid,
} from "./helpers.ts"
export {
  type DeleteIssueProjectionInput,
  type HybridSearchInput,
  type IssueProjectionCandidate,
  IssueProjectionRepository,
  type IssuesCollectionProperties,
  type UpsertIssueProjectionInput,
} from "./ports/issue-projection-repository.ts"
export {
  type CreateIssueInput as CreateIssueRepositoryInput,
  type IssueListPage,
  IssueRepository,
  type ListIssuesInput,
} from "./ports/issue-repository.ts"
export {
  type CheckEligibilityInput,
  checkEligibilityUseCase,
} from "./use-cases/check-eligibility.ts"
export {
  type CreateIssueError,
  type CreateIssueInput,
  createIssueUseCase,
} from "./use-cases/create-issue.ts"
export {
  type AssignmentResult,
  type CreateOrAssignIssueInput,
  createOrAssignIssueUseCase,
} from "./use-cases/create-or-assign-issue.ts"
export {
  type EmbeddedScoreFeedback,
  type EmbedScoreFeedbackInput,
  embedScoreFeedbackUseCase,
} from "./use-cases/embed-score-feedback.ts"
export {
  type HybridSearchIssuesInput,
  type HybridSearchIssuesResult,
  hybridSearchIssuesUseCase,
} from "./use-cases/hybrid-search-issues.ts"
export {
  type ListProjectIssuesError,
  type ListProjectIssuesInput,
  listProjectIssuesUseCase,
} from "./use-cases/list-project-issues.ts"
export {
  type RerankIssueCandidatesInput,
  type RetrievalResult,
  rerankIssueCandidatesUseCase,
} from "./use-cases/rerank-issue-candidates.ts"
export {
  type SyncIssueProjectionsInput,
  syncIssueProjectionsUseCase,
} from "./use-cases/sync-projections.ts"
