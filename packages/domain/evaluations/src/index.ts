export { generateBaselinePromptText } from "./alignment/baseline-prompt.ts"
export type {
  BaselineEvaluationExampleResult,
  BaselineEvaluationResult,
  CollectedEvaluationAlignmentExamples,
  GeneratedEvaluationDetails,
  GeneratedEvaluationDraft,
  HydratedEvaluationAlignmentExample,
  IncrementalEvaluationRefreshResult,
  LoadedEvaluationAlignmentState,
  PersistEvaluationAlignmentResult,
} from "./alignment/types.ts"
export {
  ALIGNMENT_CURATED_DATASET_MAX_ROWS,
  ALIGNMENT_CURATED_DATASET_MIN_ROWS,
  ALIGNMENT_DEFAULT_SEED,
  ALIGNMENT_FULL_REOPTIMIZE_THROTTLE_MS,
  ALIGNMENT_MCC_TOLERANCE,
  ALIGNMENT_METRIC_RECOMPUTE_THROTTLE_MS,
  ALIGNMENT_TRAIN_SPLIT,
  ALIGNMENT_VALIDATION_SPLIT,
  DEFAULT_EVALUATION_SAMPLING,
  EVALUATION_ALIGNMENT_REFRESH_SIGNAL,
  EVALUATION_ALIGNMENT_STATE_QUERY,
  EVALUATION_NAME_MAX_LENGTH,
  EVALUATION_TURNS,
  type EvaluationAlignmentWorkflowState,
} from "./constants.ts"
export {
  type ConfusionMatrix,
  confusionMatrixSchema,
  defaultEvaluationTrigger,
  type Evaluation,
  type EvaluationAlignment,
  type EvaluationTrigger,
  type EvaluationTurn,
  emptyEvaluationAlignment,
  evaluationAlignmentSchema,
  evaluationSchema,
  evaluationTriggerSchema,
  evaluationTurnSchema,
  isActiveEvaluation,
  isPausedEvaluation,
} from "./entities/evaluation.ts"
export {
  EvaluationDeletedError,
  EvaluationExecutionError,
  EvaluationNotFoundError,
  LiveEvaluationExecutionError,
  LiveEvaluationQueuePublishError,
} from "./errors.ts"
export {
  addConfusionMatrixObservation,
  applyIssueIgnoreToEvaluation,
  applyIssueResolutionToEvaluation,
  archiveEvaluation,
  buildLiveEvaluationExecutePublication,
  buildLiveEvaluationExecuteScopeDedupeKey,
  buildLiveEvaluationExecuteTraceDedupeKey,
  type ConfusionMatrixObservation,
  calculateAccuracy,
  calculateF1,
  calculateMatthewsCorrelationCoefficient,
  calculateMatthewsCorrelationCoefficientDrop,
  calculatePrecision,
  calculateRecall,
  decideAlignmentRefreshStrategy,
  deriveConfusionMatrix,
  deriveEvaluationAlignmentMetrics,
  type EvaluationAlignmentMetrics,
  emptyConfusionMatrix,
  getLiveEvaluationEligibility,
  getLiveEvaluationTurnScope,
  hasMatthewsCorrelationCoefficientDropExceededTolerance,
  isArchivedEvaluation,
  isDeletedEvaluation,
  mergeConfusionMatrices,
  shouldSampleLiveEvaluation,
  softDeleteEvaluation,
  toLiveEvaluationDebounceMs,
  totalConfusionMatrixObservations,
  truncateEvaluationName,
  unarchiveEvaluation,
} from "./helpers.ts"
export {
  DEFAULT_ALIGNMENT_EXAMPLE_LIMIT,
  type EvaluationAlignmentExample,
  type EvaluationAlignmentExampleLabel,
  EvaluationAlignmentExamplesRepository,
  type EvaluationAlignmentExamplesRepositoryShape,
  type EvaluationAlignmentNegativePriority,
  evaluationAlignmentExampleLabelSchema,
  evaluationAlignmentExampleSchema,
  evaluationAlignmentNegativePrioritySchema,
  type ListEvaluationAlignmentExamplesInput,
  type ListNegativeEvaluationAlignmentExamplesInput,
} from "./ports/evaluation-alignment-examples-repository.ts"
export {
  type EvaluationIssue,
  EvaluationIssueRepository,
} from "./ports/evaluation-issue-repository.ts"
export {
  type EvaluationListLifecycle,
  type EvaluationListOptions,
  type EvaluationListPage,
  EvaluationRepository,
  type EvaluationRepositoryShape,
  evaluationListLifecycleSchema,
} from "./ports/evaluation-repository.ts"
export {
  LiveEvaluationQueuePublisher,
  type LiveEvaluationQueuePublisherShape,
  type PublishLiveEvaluationExecuteInput,
} from "./ports/live-evaluation-queue-publisher.ts"
export {
  buildEvaluationAlignmentJudgeTelemetryCapture,
  buildEvaluationGepaProposeTelemetryCapture,
  buildEvaluationGepaSummaryTelemetryCapture,
  buildEvaluationJudgeLiveTelemetryCapture,
  buildEvaluationOptimizationJudgeTelemetryCapture,
  type EvaluationAlignmentJudgeTelemetryScope,
  type EvaluationOptimizationJudgeTelemetryScope,
} from "./runtime/ai-telemetry.ts"
export {
  EVALUATION_CONVERSATION_PLACEHOLDER,
  EVALUATION_SCRIPT_RUNTIME_MODEL,
  EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT,
  type EvaluationConversationMessage,
  type EvaluationExecutionResult,
  type EvaluationExecutionResultPayload,
  type EvaluationIssueContext,
  type EvaluationScriptExecution,
  type EvaluationScriptSchema,
  type ExecuteEvaluationScriptWithAIError,
  estimateEvaluationScriptCostMicrocents,
  evaluationExecutionResultPayloadSchema,
  evaluationExecutionResultSchema,
  evaluationIssueContextSchema,
  evaluationRuntimeZod,
  executeEvaluationScript,
  executeEvaluationScriptWithAI,
  extractPromptFromEvaluationScript,
  formatEvaluationConversationForPrompt,
  toEvaluationConversationMessages,
  toEvaluationExecutionResult,
  validateEvaluationScript,
  wrapPromptAsEvaluationScript,
} from "./runtime/evaluation-execution.ts"
export { collectAlignmentExamplesUseCase } from "./use-cases/alignment/collect-alignment-examples.ts"
export { evaluateBaselineDraftUseCase } from "./use-cases/alignment/evaluate-baseline-draft.ts"
export { evaluateDraftAgainstExamplesUseCase } from "./use-cases/alignment/evaluate-draft-against-examples.ts"
export { evaluateIncrementalDraftUseCase } from "./use-cases/alignment/evaluate-incremental-draft.ts"
export { generateBaselineDraftUseCase } from "./use-cases/alignment/generate-baseline-draft.ts"
export { loadAlignmentStateUseCase } from "./use-cases/alignment/load-alignment-state.ts"
export {
  type LoadAlignmentStateOrInactiveResult,
  loadAlignmentStateOrInactiveUseCase,
} from "./use-cases/alignment/load-alignment-state-or-inactive.ts"
export { persistAlignmentResultUseCase } from "./use-cases/alignment/persist-alignment-result.ts"
export {
  buildLiveTraceEndEvaluationSelectionKey,
  buildTraceEndEvaluationSelectionInputs,
} from "./use-cases/live/build-trace-end-evaluation-selection.ts"
export {
  type ExecuteLiveEvaluationError,
  executeLiveEvaluationUseCase,
  type LiveEvaluationConversationInput,
  type LiveEvaluationExecutionInput,
  type LiveEvaluationExecutionResult,
  type LiveEvaluationIssueContext,
  type LiveEvaluationResultPayload,
  liveEvaluationConversationInputSchema,
  liveEvaluationExecutionInputSchema,
  liveEvaluationExecutionResultSchema,
  liveEvaluationIssueContextSchema,
  liveEvaluationResultPayloadSchema,
} from "./use-cases/live/execute-live-evaluation.ts"
export { listAllActiveEvaluations } from "./use-cases/live/list-all-active-evaluations.ts"
export { orchestrateTraceEndLiveEvaluationExecutesUseCase } from "./use-cases/live/orchestrate-trace-end-live-evaluation-executes.ts"
export {
  type RunLiveEvaluationCompletedExecution,
  type RunLiveEvaluationError,
  type RunLiveEvaluationErroredExecution,
  type RunLiveEvaluationExecutedContext,
  type RunLiveEvaluationExecutedSummary,
  type RunLiveEvaluationInput,
  type RunLiveEvaluationLoadedContext,
  type RunLiveEvaluationLoadedSummary,
  type RunLiveEvaluationPersistedContext,
  type RunLiveEvaluationPersistedExecution,
  type RunLiveEvaluationPersistedSummary,
  type RunLiveEvaluationResult,
  runLiveEvaluationUseCase,
} from "./use-cases/live/run-live-evaluation.ts"
export { evaluateOptimizationCandidate } from "./use-cases/optimization/evaluate-optimization-candidate.ts"
