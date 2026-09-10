export { SESSION_ASSESSMENT_CONTENT_BUDGET, SESSION_ASSESSMENT_RESOLVER_CONCURRENCY } from "./constants.ts"
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
export type {
  SessionWindowContribution,
  WindowBootstrapResult,
  WindowConfidenceInterval,
  WindowCostAggregate,
  WindowSpeedAggregate,
} from "./scoring/bootstrap-window.ts"
export { aggregateWindowCost, aggregateWindowSpeed, bootstrapWindow } from "./scoring/bootstrap-window.ts"
export type {
  SpeedAvoidableClaim,
  SpeedClaimDropReason,
  SpeedCounterfactual,
} from "./scoring/compose-speed-counterfactual.ts"
export { composeSpeedCounterfactual, SPEED_CLAIM_DROP_REASONS } from "./scoring/compose-speed-counterfactual.ts"
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
export type { WindowFold } from "./scoring/fold-window-contributions.ts"
export {
  EMPTY_WINDOW_FOLD,
  foldSessionContribution,
  foldWindowBatch,
} from "./scoring/fold-window-contributions.ts"
export type { LinkedSignalOccurrence, SignalLinkage, SignalOccurrence } from "./scoring/link-signal-occurrences.ts"
export { linkSignalOccurrences } from "./scoring/link-signal-occurrences.ts"
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
