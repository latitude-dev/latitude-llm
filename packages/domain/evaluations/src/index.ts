export { generateBaselinePromptText, generateJudgePromptText } from "./alignment/baseline-prompt.ts"
export type {
  BaselineEvaluationExampleResult,
  BaselineEvaluationResult,
  CollectedEvaluationAlignmentExamples,
  GeneratedEvaluationDraft,
  HydratedEvaluationAlignmentExample,
  IncrementalEvaluationRefreshResult,
  LoadedEvaluationAlignmentState,
  PersistEvaluationAlignmentResult,
} from "./alignment/types.ts"
export {
  compileSettingsToScript,
  validateAndHashEvaluationScript,
  validateEvaluationScriptCompiles,
} from "./codegen/compile-settings-to-script.ts"
export {
  ALIGNMENT_CURATED_DATASET_MAX_ROWS,
  ALIGNMENT_CURATED_DATASET_MIN_ROWS,
  ALIGNMENT_DEFAULT_SEED,
  ALIGNMENT_FULL_REOPTIMIZE_THROTTLE_MS,
  ALIGNMENT_METRIC_RECOMPUTE_THROTTLE_MS,
  ALIGNMENT_METRIC_TOLERANCE,
  ALIGNMENT_TRAIN_SPLIT,
  ALIGNMENT_VALIDATION_SPLIT,
  DEFAULT_EVALUATION_SAMPLING,
  EVALUATION_NAME_MAX_LENGTH,
  EVALUATION_TURNS,
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
  EvaluationScriptGenerationError,
  LiveEvaluationExecutionError,
  LiveEvaluationQueuePublishError,
} from "./errors.ts"
export {
  addConfusionMatrixObservation,
  applySignalIgnoreToEvaluation,
  applySignalResolutionToEvaluation,
  archiveEvaluation,
  buildLiveEvaluationExecutePublication,
  buildLiveEvaluationExecuteScopeDedupeKey,
  buildLiveEvaluationExecuteTraceDedupeKey,
  type ConfusionMatrixObservation,
  calculateAccuracy,
  calculateAlignmentMetric,
  calculateAlignmentMetricDrop,
  calculateBalancedAccuracy,
  calculateF1,
  calculateMatthewsCorrelationCoefficient,
  calculatePrecision,
  calculateRecall,
  calculateSpecificity,
  calculateTrueness,
  decideAlignmentRefreshStrategy,
  deriveConfusionMatrix,
  deriveEvaluationAlignmentMetrics,
  type EvaluationAlignmentMetrics,
  emptyConfusionMatrix,
  getLiveEvaluationEligibility,
  getLiveEvaluationTurnScope,
  hasAlignmentMetricDropExceededTolerance,
  isArchivedEvaluation,
  isDeletedEvaluation,
  mergeConfusionMatrices,
  shouldSampleLiveEvaluation,
  softDeleteEvaluation,
  toLiveEvaluationDebounceMs,
  totalConfusionMatrixObservations,
  unarchiveEvaluation,
  updateEvaluationSampling,
  updateEvaluationTriggerFilter,
} from "./helpers.ts"
export {
  DEFAULT_ALIGNMENT_EXAMPLE_LIMIT,
  type EvaluationAlignmentExample,
  type EvaluationAlignmentExampleLabel,
  EvaluationAlignmentExamplesRepository,
  type EvaluationAlignmentExamplesRepositoryShape,
  type EvaluationAlignmentNegativePriority,
  type EvaluationAlignmentPositivePriority,
  evaluationAlignmentExampleLabelSchema,
  evaluationAlignmentExampleSchema,
  evaluationAlignmentNegativePrioritySchema,
  evaluationAlignmentPositivePrioritySchema,
  type ListEvaluationAlignmentExamplesInput,
  type ListNegativeEvaluationAlignmentExamplesInput,
} from "./ports/evaluation-alignment-examples-repository.ts"
export {
  type EvaluationListLifecycle,
  type EvaluationListOptions,
  type EvaluationListPage,
  EvaluationRepository,
  type EvaluationRepositoryShape,
  evaluationListLifecycleSchema,
} from "./ports/evaluation-repository.ts"
export {
  type EvaluationSignal,
  EvaluationSignalRepository,
} from "./ports/evaluation-signal-repository.ts"
export {
  LiveEvaluationQueuePublisher,
  type LiveEvaluationQueuePublisherShape,
  type PublishLiveEvaluationExecuteInput,
} from "./ports/live-evaluation-queue-publisher.ts"
export {
  buildEvaluationAlignmentJudgeTelemetryCapture,
  buildEvaluationGepaProposeTelemetryCapture,
  buildEvaluationJudgeLiveTelemetryCapture,
  buildEvaluationOptimizationJudgeTelemetryCapture,
  type EvaluationAlignmentJudgeTelemetryScope,
  type EvaluationOptimizationJudgeTelemetryScope,
} from "./runtime/ai-telemetry.ts"
export {
  EVALUATION_CONVERSATION_PLACEHOLDER,
  EVALUATION_DEFAULT_SCRIPT_RUNTIME_MODEL,
  EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT,
  type EvaluationConversationMessage,
  type EvaluationExecutionResult,
  type EvaluationExecutionResultPayload,
  type EvaluationScriptExecution,
  type EvaluationSignalContext,
  estimateEvaluationScriptCostMicrocents,
  evaluationExecutionResultPayloadSchema,
  evaluationExecutionResultSchema,
  evaluationSignalContextSchema,
  toEvaluationConversationMessages,
  toEvaluationExecutionResult,
  wrapPromptAsEvaluationScript,
} from "./runtime/evaluation-execution.ts"
export { loadScriptSessionContext } from "./runtime/load-session-context.ts"
export { executeEvaluationScriptSandboxed } from "./runtime/sandbox-execution.ts"
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
  type CreateEvaluationError,
  type CreateEvaluationInput,
  type CreateEvaluationResult,
  createEvaluationUseCase,
} from "./use-cases/create-evaluation.ts"
export {
  type CreateScriptFromPromptError,
  type CreateScriptFromPromptInput,
  type CreateScriptFromPromptResult,
  createScriptFromPromptUseCase,
} from "./use-cases/create-script-from-prompt.ts"
export {
  deriveSignalAlignmentState,
  type GetSignalAlignmentStateError,
  type GetSignalAlignmentStateInput,
  getSignalAlignmentStateUseCase,
  type SignalAlignmentState,
} from "./use-cases/get-signal-alignment-state.ts"
export {
  buildLiveTraceEndEvaluationSelectionKey,
  buildTraceEndEvaluationSelectionInputs,
} from "./use-cases/live/build-trace-end-evaluation-selection.ts"
export {
  type ExecuteLiveEvaluationError,
  executeLiveEvaluationUseCase,
  type LiveEvaluationExecutionInput,
  type LiveEvaluationExecutionResult,
  type LiveEvaluationResultPayload,
  type LiveEvaluationSignalContext,
  liveEvaluationExecutionInputSchema,
  liveEvaluationExecutionResultSchema,
  liveEvaluationResultPayloadSchema,
  liveEvaluationSignalContextSchema,
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
export {
  type MonitorSignalError,
  type MonitorSignalInput,
  monitorSignalUseCase,
} from "./use-cases/monitor-signal.ts"
export { evaluateOptimizationCandidate } from "./use-cases/optimization/evaluate-optimization-candidate.ts"
export {
  type PreviewEvaluationError,
  type PreviewEvaluationInput,
  type PreviewEvaluationResult,
  type PreviewEvaluationRow,
  previewEvaluationUseCase,
} from "./use-cases/preview-evaluation.ts"
export {
  type UnmonitorSignalError,
  type UnmonitorSignalInput,
  unmonitorSignalUseCase,
} from "./use-cases/unmonitor-signal.ts"
