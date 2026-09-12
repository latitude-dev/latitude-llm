export {
  buildLatencyReferenceArtifact,
  LATENCY_SAMPLE_REJECTIONS,
  type LatencyCohortSample,
  type LatencyReferenceBuildReport,
  type LatencySampleRejection,
} from "./artifacts/build-latency-reference.ts"
export { LAUNCH_AGENT_SCORE_ARTIFACT, LAUNCH_SCORING_VERSION } from "./artifacts/launch-agent-score-artifact.ts"
export {
  type LaunchArtifacts,
  type ResolvedLaunchArtifacts,
  resolveLaunchArtifacts,
  validateLaunchArtifacts,
} from "./artifacts/launch-artifacts.ts"
export { LAUNCH_COST_ARTIFACT_VERSION, LAUNCH_COST_SCORING_ARTIFACT } from "./artifacts/launch-cost-scoring-artifact.ts"
export {
  LAUNCH_LATENCY_ARTIFACT_VERSION,
  LAUNCH_LATENCY_MINIMUM_ORGANIZATION_COUNT,
  LAUNCH_LATENCY_MINIMUM_SAMPLE_COUNT,
  LAUNCH_LATENCY_REFERENCE_ARTIFACT,
} from "./artifacts/launch-latency-reference-artifact.ts"
export { SESSION_ASSESSMENT_CONTENT_BUDGET, SESSION_ASSESSMENT_RESOLVER_CONCURRENCY } from "./constants.ts"
export type {
  AgentScoreCoverage,
  AgentScoreNativeInputs,
  AgentScoreResult,
  AgentScoreStatus,
  AgentScoreWindow,
} from "./entities/agent-score.ts"
export {
  type AgentScoreArtifact,
  agentScoreArtifactSchema,
  type CompositePolicyCap,
  type CostCoverageFloors,
  compositePolicyCapSchema,
  compositeWeightOf,
  costCoverageFloorsSchema,
  type DimensionCoverageFloors,
  dimensionCoverageFloorsSchema,
  LOCAL_SCORING_VERSION_PREFIX,
  loadAgentScoreArtifact,
  type OutcomeCoverageFloors,
  outcomeCoverageFloorsSchema,
  type ReliabilityCoverageFloors,
  type ResolvedScoringVersion,
  reliabilityCoverageFloorsSchema,
  resolveScoringVersion,
  type SafetyCoverageFloors,
  type ScoreWindowSettings,
  type ScoringJudge,
  type SpeedCoverageFloors,
  type SupportedJudgmentVersions,
  safetyCoverageFloorsSchema,
  scoreWindowSettingsSchema,
  speedCoverageFloorsSchema,
  supportedJudgmentVersionsSchema,
} from "./entities/agent-score-artifact.ts"
export {
  type AgentScoreSnapshot,
  type AgentScoreSnapshotIdentity,
  agentScoreSnapshotSchema,
  type DimensionSnapshot,
  dimensionSnapshotSchema,
  type ScoreInterval,
  scoreIntervalSchema,
  utcDateOf,
} from "./entities/agent-score-snapshot.ts"
export {
  COST_ESTIMATOR_CHANNEL,
  COST_FAMILIES,
  COST_FAMILY_CANONICAL_UNIT,
  COST_FAMILY_RAW_UNITS,
  type CostAggregationMode,
  type CostEvidenceContract,
  type CostFamily,
  type CostFamilyMeasurementState,
  type CostFamilyResolution,
  type CostMeasurementStatus,
  type CostMetricApplicability,
  type CostMetricEvaluation,
  type CostMetricHealth,
  type CostMetricMeasurementState,
  type CostMetricReadability,
  type CostRawUnit,
  type CostSourceClaim,
  costAggregationModeSchema,
  costFamilyMeasurementStateSchema,
  costFamilySchema,
  costMeasurementStatusOf,
  costMeasurementStatusSchema,
  costMetricApplicabilitySchema,
  costMetricEvaluationSchema,
  costMetricHealthSchema,
  costMetricMeasurementStateOf,
  costMetricMeasurementStateSchema,
  costMetricReadabilitySchema,
  costRawUnitSchema,
  costSourceClaimSchema,
  type EstimateRange,
  type EstimateRangeInterpretation,
  estimateRangeInterpretationSchema,
  estimateRangeSchema,
  isCostEstimatorChannel,
  isCostRawUnitOfFamily,
  type SessionCostMetricEvaluation,
  sessionCostMetricEvaluationSchema,
  toSessionCostMetricEvaluation,
} from "./entities/cost-evidence.ts"
export {
  type CostApplicabilityRequirement,
  type CostApplicabilityRule,
  type CostMetricCatalog,
  type CostMetricCatalogEntry,
  type CostProductDestination,
  costApplicabilityRequirementSchema,
  costApplicabilityRuleSchema,
  costMetricCatalogEntrySchema,
  costMetricCatalogSchema,
  costProductDestinationSchema,
  PROVISIONAL_COST_METRIC_CATALOG,
  PROVISIONAL_METRIC_COVERAGE_FLOOR,
} from "./entities/cost-metric-catalog.ts"
export type {
  CostEvidenceStrength,
  CostMetricReading,
  CostReadingBase,
  CostReadingLimitation,
  CostSourceObservation,
  SessionCostMetricEvidence,
} from "./entities/cost-metric-reading.ts"
export {
  COST_EVIDENCE_STRENGTHS,
  COST_READING_LIMITATIONS,
  costEvidenceStrengthSchema,
  costMetricReadingSchema,
  costReadingLimitationSchema,
  costSourceObservationSchema,
  notApplicableReading,
  sessionCostMetricEvidenceSchema,
  toSessionCostMetricEvidence,
  unreadableReading,
} from "./entities/cost-metric-reading.ts"
export {
  type CostCurvePoint,
  type CostFamilyCoverageRequirement,
  type CostMetricCurve,
  type CostOverlapPolicy,
  type CostScoringArtifact,
  type CostTokenizerPolicy,
  costCurvePointSchema,
  costFamilyCoverageRequirementSchema,
  costMetricCurveSchema,
  costOverlapPolicySchema,
  costScoringArtifactSchema,
  costTokenizerPolicySchema,
  loadCostMetricCatalog,
  loadCostScoringArtifact,
} from "./entities/cost-scoring-artifact.ts"
export type {
  LatencyExpectation,
  LatencyExpectationGap,
  LatencyReferenceArtifact,
  LatencyReferenceGranularity,
  ThroughputReferenceCohort,
  TtftReferenceCohort,
} from "./entities/latency-reference-artifact.ts"
export {
  excessGenerationNs,
  excessTtftNs,
  LATENCY_EXPECTATION_GAPS,
  latencyReferenceArtifactSchema,
  latencyReferenceGranularitySchema,
  loadLatencyReferenceArtifact,
  lookupThroughputExpectationTps,
  lookupTtftExpectationNs,
  throughputReferenceCohortSchema,
  ttftReferenceCohortSchema,
} from "./entities/latency-reference-artifact.ts"
export {
  SESSION_ASSESSMENT_PAGE_SIZE,
  type SessionAssessment,
  type SessionAssessmentCoverage,
  type SessionAssessmentCursor,
  type SessionAssessmentImpactLevel,
  type SessionAssessmentItem,
  type SessionAssessmentPolarity,
  type SessionAssessmentSource,
  type SessionCostFamilySummary,
  type SessionCoverageLimitation,
  type SessionDimensionEffect,
  type SessionDimensionSummary,
  type SessionEvidenceAnchor,
  type SessionEvidenceDestination,
  type SessionEvidenceImpact,
  type SessionReaderCoverage,
  type SessionReaderSelection,
  sessionAssessmentCoverageSchema,
  sessionAssessmentCursorSchema,
  sessionAssessmentImpactLevelSchema,
  sessionAssessmentItemSchema,
  sessionAssessmentPolaritySchema,
  sessionAssessmentSchema,
  sessionAssessmentSourceSchema,
  sessionCostFamilySummarySchema,
  sessionCoverageLimitationSchema,
  sessionDimensionEffectSchema,
  sessionDimensionSummarySchema,
  sessionEvidenceAnchorSchema,
  sessionEvidenceDestinationSchema,
  sessionEvidenceImpactSchema,
  sessionReaderCoverageSchema,
  sessionReaderSelectionSchema,
} from "./entities/session-assessment.ts"
export type {
  AssessmentFinding,
  AssessmentFindingChronology,
  AssessmentFindingReference,
  AssessmentReaderFact,
  NormalizedSessionAssessmentInput,
  NormalizedSessionCostEvidence,
} from "./entities/session-assessment-input.ts"
export {
  InvalidAgentScoreArtifactError,
  InvalidCostMetricCatalogError,
  InvalidCostScoringArtifactError,
  InvalidLatencyReferenceArtifactError,
} from "./errors.ts"
export {
  chronologyFromSessionAssessmentCursor,
  decodeSessionAssessmentCursor,
  encodeSessionAssessmentCursor,
  type SessionAssessmentPageCursor,
} from "./pagination/session-assessment-cursor.ts"
export {
  type AgentScoreSnapshotHistoryScope,
  AgentScoreSnapshotRepository,
  type AgentScoreSnapshotRepositoryShape,
} from "./ports/agent-score-snapshot-repository.ts"
export {
  type OutcomeWindowDecision,
  OutcomeWindowDecisionSource,
  type OutcomeWindowDecisionSourceShape,
  type OutcomeWindowDecisions,
  type OutcomeWindowScope,
} from "./ports/outcome-window-source.ts"
export {
  type SafetyWindowDecision,
  SafetyWindowDecisionSource,
  type SafetyWindowDecisionSourceShape,
  type SafetyWindowDecisions,
  type SafetyWindowScope,
} from "./ports/safety-window-source.ts"
export {
  ScoreProjectSweepSource,
  type ScoreProjectSweepSourceShape,
  type ScoreSweepProject,
  type ScoreSweepScope,
  type ScoreWindowCountsScope,
  type ScoreWindowSessionsScope,
  ScoreWindowSource,
  type ScoreWindowSourceShape,
} from "./ports/score-window-source.ts"
export {
  type SessionAssessmentBulkJudgmentScope,
  SessionAssessmentBulkJudgmentSource,
  type SessionAssessmentBulkJudgmentSourceShape,
  type SessionAssessmentBulkJudgments,
  type SessionAssessmentBulkScope,
  type SessionAssessmentBulkSessionRef,
  type SessionAssessmentBulkTelemetry,
  SessionAssessmentBulkTelemetrySource,
  type SessionAssessmentBulkTelemetrySourceShape,
  type SessionAssessmentSourceScope,
  type SessionAssessmentTraceScope,
  SessionConversationSource,
  type SessionConversationSourceShape,
  type SessionMomentFacts,
  SessionMomentSource,
  type SessionMomentSourceShape,
  SessionScoreSource,
  type SessionScoreSourceShape,
  SessionScreeningDecisionSource,
  type SessionScreeningDecisionSourceShape,
  SessionSignalSource,
  type SessionSignalSourceShape,
  SessionSpanSource,
  type SessionSpanSourceShape,
} from "./ports/session-assessment-sources.ts"
export type {
  ContentAtom,
  ContentAtomKind,
  GenerationInputLedger,
  SessionContentLedger,
  TokenCounter,
} from "./readers/cost/content-atom-ledger.ts"
export {
  buildSessionContentLedger,
  CONTENT_ATOM_KINDS,
  repeatedAtomTokens,
} from "./readers/cost/content-atom-ledger.ts"
export type { CacheAchievableBasis, SessionCacheEvidence } from "./readers/cost/read-cache-gap.ts"
export { CACHE_GAP_GUARDS, readCacheGap } from "./readers/cost/read-cache-gap.ts"
export type { RedundantAtomClaim } from "./readers/cost/read-context-metrics.ts"
export { readAvoidablePressure, readRedundantInputShare } from "./readers/cost/read-context-metrics.ts"
export { readNoopRewrites, readRepeatedZeroHits, readRevertedWrites } from "./readers/cost/read-memory-metrics.ts"
export type { AttributableSpendClaim } from "./readers/cost/read-recoverable-spend.ts"
export { readRecoverableSpend } from "./readers/cost/read-recoverable-spend.ts"
export type { RecoveredIncident, TerminalIncident } from "./readers/cost/read-recovery-metrics.ts"
export {
  readRecoveredIncidentRate,
  recoveryAvoidableNs,
  recoverySpendClaims,
} from "./readers/cost/read-recovery-metrics.ts"
export type { SessionSpendCoverage } from "./readers/cost/read-spend-coverage.ts"
export { readSessionSpendCoverage } from "./readers/cost/read-spend-coverage.ts"
export type { RecoveredStructuralDefect, ToolDefinitionSurface } from "./readers/cost/read-tool-metrics.ts"
export {
  POLLING_INTERVAL_VARIATION,
  REPEATED_CALL_MINIMUM_CALLS,
  readDeadSurface,
  readRepeatedCalls,
  readStructuralDefects,
  readThrashing,
  THRASHING_MINIMUM_RUN,
} from "./readers/cost/read-tool-metrics.ts"
export {
  type ReadSessionAssessmentInputBatchInput,
  readSessionAssessmentBatch,
  readSessionAssessmentInputBatch,
} from "./readers/read-session-assessment-batch.ts"
export {
  type ReadSessionAssessmentSourcesInput,
  readSessionAssessmentSources,
} from "./readers/read-session-assessment-sources.ts"
export type { SessionCostEvidence, SessionCostEvidenceInput } from "./readers/read-session-cost-evidence.ts"
export {
  buildSessionCacheEvidence,
  readSessionCostEvidence,
  SESSION_CACHE_LIFETIME_SECONDS,
} from "./readers/read-session-cost-evidence.ts"
export {
  type BuildSessionAssessmentCoverageInput,
  buildSessionAssessmentCoverage,
  type ResolvedSessionAssessmentCoverage,
} from "./resolver/build-assessment-coverage.ts"
export {
  type BuildSessionDimensionSummariesInput,
  buildSessionDimensionSummaries,
  type SessionDimensionCoverage,
} from "./resolver/build-dimension-summaries.ts"
export {
  compareResolvedAssessmentItems,
  deduplicateResolvedAssessmentItems,
  type ResolvedAssessmentItem,
  type ResolvedAssessmentItemOrder,
  resolveAssessmentFinding,
  resolveAssessmentFindingEffects,
  resolveSessionAssessmentItems,
  resolveSessionAssessmentItemsWithChronology,
} from "./resolver/resolve-assessment-findings.ts"
export {
  resolveSessionAssessment,
  resolveSessionAssessmentPage,
} from "./resolver/resolve-session-assessment.ts"
export type {
  CostFamilyDenominators,
  CostFamilyResult,
  SessionCostAggregate,
} from "./scoring/aggregate-session-cost.ts"
export { aggregateSessionCost, EMPTY_COST_FAMILY_DENOMINATORS } from "./scoring/aggregate-session-cost.ts"
export type { ArbitratedReading, CostAtomArbitration } from "./scoring/arbitrate-cost-atoms.ts"
export { arbitrateCostAtoms } from "./scoring/arbitrate-cost-atoms.ts"
export {
  type AttributeDeficitInput,
  type AttributionMethod,
  attributeDeficit,
  type CauseAttribution,
  DEFAULT_ATTRIBUTION_ERROR_TARGET,
  type DeficitAttribution,
  EXACT_ATTRIBUTION_CAUSE_LIMIT,
  MAX_ATTRIBUTION_PERMUTATIONS,
} from "./scoring/attribute-deficit.ts"
export {
  ATTRIBUTED_DIMENSIONS,
  attributeCostWindow,
  attributeReliabilityWindow,
  attributeSpeedWindow,
  type CauseEvidenceKind,
  type DimensionAttribution,
  type DimensionCauseRow,
  EMPTY_DIMENSION_ATTRIBUTION,
} from "./scoring/attribute-dimensions.ts"
export {
  type BinomialInterval,
  clopperPearsonInterval,
  DEFAULT_CONFIDENCE_LEVEL,
  inverseRegularizedIncompleteBeta,
  regularizedIncompleteBeta,
} from "./scoring/binomial-interval.ts"
export type {
  SessionWindowContribution,
  WindowBootstrapResult,
  WindowConfidenceInterval,
  WindowCostAggregate,
  WindowSpeedAggregate,
} from "./scoring/bootstrap-window.ts"
export { aggregateWindowCost, aggregateWindowSpeed, bootstrapWindow } from "./scoring/bootstrap-window.ts"
export {
  buildIssueRows,
  ISSUE_ROW_LIMIT,
  type IssueObservation,
  type IssueRow,
  type IssueSession,
} from "./scoring/build-issue-rows.ts"
export { buildSafetyIssues, type SafetyIssueSession, type SafetyIssues } from "./scoring/build-safety-issues.ts"
export {
  buildWindowIssues,
  EMPTY_WINDOW_ISSUES,
  readSessionIssueEvidence,
  type SessionIssueEvidence,
  type WindowIssues,
} from "./scoring/build-window-issues.ts"
export {
  buildWindowSignalEffects,
  EMPTY_WINDOW_SIGNAL_EFFECTS,
  readSessionSignalEvidence,
  type SessionSignalEvidence,
  type WindowSignalEffects,
} from "./scoring/build-window-signal-effects.ts"
export {
  type AgentScoreComposite,
  type AgentScoreComposition,
  type ComposeAgentScoreInput,
  type CompositePolicyCapResult,
  composeAgentScore,
  DEFAULT_COMPOSITE_REPLICATES,
  type DimensionResult,
} from "./scoring/compose-agent-score.ts"
export type {
  SpeedAvoidableClaim,
  SpeedClaimDropReason,
  SpeedCounterfactual,
} from "./scoring/compose-speed-counterfactual.ts"
export { composeSpeedCounterfactual, SPEED_CLAIM_DROP_REASONS } from "./scoring/compose-speed-counterfactual.ts"
export {
  type DerivedSamplingRates,
  deriveSamplingRates,
  PROVISIONAL_SAMPLING_TARGETS,
  type SamplingTargets,
} from "./scoring/derive-sampling-rates.ts"
export {
  type EstimateProjectOutcomeInput,
  estimateProjectOutcome,
  OUTCOME_EXCLUSION_REASONS,
  type OutcomeExclusionReason,
  type OutcomeIntervalMethod,
  type OutcomeSessionVerdict,
  type OutcomeUnmeasuredReason,
  type ProjectOutcomeEstimate,
} from "./scoring/estimate-outcome.ts"
export {
  type EstimateProjectReliabilityInput,
  estimateProjectReliability,
  type ProjectReliabilityEstimate,
  type ReliabilityUnmeasuredReason,
} from "./scoring/estimate-reliability.ts"
export type {
  MatchedSession,
  ResidualEffect,
  ResidualGapReason,
  ResidualSupportFloors,
} from "./scoring/estimate-residual-effect.ts"
export {
  capResidualEffects,
  DEFAULT_RESIDUAL_SUPPORT,
  estimateResidualEffect,
  RESIDUAL_GAP_REASONS,
} from "./scoring/estimate-residual-effect.ts"
export {
  type EstimateProjectSafetyInput,
  estimateProjectSafety,
  type ProjectSafetyEstimate,
  SAFETY_EXCLUSION_REASONS,
  type SafetyExclusionReason,
  type SafetyMemberDecision,
  type SafetySessionExamination,
  type SafetyUnmeasuredReason,
} from "./scoring/estimate-safety.ts"
export type {
  CostSignalResidual,
  SignalResidualGap,
  SignalResidualGroup,
  SpeedSignalResidual,
} from "./scoring/estimate-signal-residuals.ts"
export {
  estimateCostSignalResiduals,
  estimateSpeedSignalResiduals,
} from "./scoring/estimate-signal-residuals.ts"
export {
  costHealthForRawValue,
  evaluateCostMetric,
  interpolateCostPenalty,
} from "./scoring/evaluate-cost-curve.ts"
export type { FamilyReadingCoverage, WindowFold } from "./scoring/fold-window-contributions.ts"
export {
  EMPTY_WINDOW_FOLD,
  foldSessionContribution,
  foldWindowBatch,
} from "./scoring/fold-window-contributions.ts"
export type { LinkedSignalOccurrence, SignalLinkage, SignalOccurrence } from "./scoring/link-signal-occurrences.ts"
export { linkSignalOccurrences } from "./scoring/link-signal-occurrences.ts"
export { readOutcomeIssueObservations } from "./scoring/read-outcome-issue-observations.ts"
export {
  readSafetyIssueObservations,
  type SafetyIssueObservations,
} from "./scoring/read-safety-issue-observations.ts"
export { survivalInterval, survivalOverReferenceRun } from "./scoring/reference-run.ts"
export {
  hasDeterministicOutcomeFailure,
  selectDeterministicOutcomeFailures,
} from "./scoring/select-outcome-endpoints.ts"
export {
  RELIABILITY_EXCLUSION_REASONS,
  type ReliabilityExclusionReason,
  type ReliabilitySessionEndpoint,
  selectReliabilityEndpoint,
  selectReliabilityEndpoints,
} from "./scoring/select-reliability-endpoints.ts"
export {
  SCORE_WINDOW_REASONS,
  type ScoreWindowReason,
  type ScoreWindowSelection,
  type ScoreWindowStepCount,
  selectScoreWindow,
} from "./scoring/select-score-window.ts"
export {
  type ReaderLimitation,
  tallyWindowReaderCoverage,
  type WindowReaderCoverage,
} from "./scoring/tally-reader-coverage.ts"
export {
  type CostFamilyWindowCoverage,
  type CostUnmeasuredReason,
  type CostWindowGate,
  gateCostWindow,
  gateSpeedWindow,
  type SpeedUnmeasuredReason,
  type SpeedWindowGate,
} from "./scoring/window-gates.ts"
export {
  AGENT_SCORE_BATCH_SIZE,
  type ComputeAgentScoreInput,
  computeAgentScore,
} from "./use-cases/compute-agent-score.ts"
export {
  type EstimateProjectOutcomeWindowInput,
  estimateProjectOutcomeWindow,
  OUTCOME_VERDICT_BATCH_SIZE,
} from "./use-cases/estimate-project-outcome.ts"
export {
  type EstimateProjectSafetyWindowInput,
  estimateProjectSafetyWindow,
  SAFETY_FINDING_BATCH_SIZE,
} from "./use-cases/estimate-project-safety.ts"
export {
  AGENT_SCORE_HISTORY_DEFAULT_DAYS,
  type CurrentAgentScore,
  getCurrentAgentScore,
  listAgentScoreHistory,
} from "./use-cases/get-agent-score.ts"
export {
  type GetSessionAssessmentInput,
  getSessionAssessment,
} from "./use-cases/get-session-assessment.ts"
export type {
  CostSpeedShadowInput,
  CostSpeedShadowReport,
  ShadowFamilyDistribution,
  ShadowResourceProbe,
  ShadowResourceReport,
  ShadowResourceSample,
} from "./use-cases/run-cost-speed-shadow.ts"
export { runCostSpeedShadow, SHADOW_BATCH_SIZE } from "./use-cases/run-cost-speed-shadow.ts"
