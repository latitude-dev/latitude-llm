export {
  SESSION_ID_MAX_LENGTH,
  SPAN_ID_LENGTH,
  TRACE_COHORT_SUMMARY_CACHE_TTL_SECONDS,
  TRACE_END_DEBOUNCE_MS,
  TRACE_ID_LENGTH,
} from "./constants.ts"
export type { Session } from "./entities/session.ts"
export { sessionSchema } from "./entities/session.ts"
export type { Operation, Span, SpanDetail, SpanKind, SpanStatusCode, ToolDefinition } from "./entities/span.ts"
export {
  operationSchema,
  spanDetailSchema,
  spanKindSchema,
  spanSchema,
  spanStatusCodeSchema,
  toolDefinitionSchema,
} from "./entities/span.ts"
export type { Trace, TraceDetail } from "./entities/trace.ts"
export { traceDetailSchema, traceSchema } from "./entities/trace.ts"
export { SpanDecodingError } from "./errors.ts"
export {
  type AnnotationWriteSpanAnchor,
  annotationAnchorTargetsToolPart,
  resolveAnnotationSpanIdForWrite,
} from "./helpers/resolve-annotation-span-id-for-write.ts"
export {
  isLlmCompletionOperation,
  resolveLastLlmCompletionSpanId,
} from "./helpers/resolve-last-llm-completion-span.ts"
export {
  alignUnixSecondsToHistogramBucket,
  denseTraceTimeHistogramBuckets,
  mergeTraceHistogramTimeFilters,
  parseStartTimeBoundsFromFilters,
  pickTraceHistogramBucketSeconds,
  resolveTraceHistogramRangeIso,
} from "./helpers.ts"
export type {
  SessionDistinctColumn,
  SessionListCursor,
  SessionListOptions,
  SessionListPage,
  SessionMetrics,
  SessionRepositoryShape,
} from "./ports/session-repository.ts"
export { emptySessionMetrics, SessionRepository } from "./ports/session-repository.ts"
export type { SpanListOptions, SpanMessagesData, SpanRepositoryShape } from "./ports/span-repository.ts"
export { SpanRepository } from "./ports/span-repository.ts"
export type {
  NumericRollup,
  TraceDistinctColumn,
  TraceHistogramMetric,
  TraceListCursor,
  TraceListOptions,
  TraceListPage,
  TraceMetrics,
  TraceRepositoryShape,
  TraceTimeHistogramBucket,
} from "./ports/trace-repository.ts"
export {
  emptyTraceMetrics,
  emptyTraceTimeHistogramBucket,
  isTraceHistogramMetric,
  TRACE_HISTOGRAM_METRICS,
  TraceRepository,
} from "./ports/trace-repository.ts"
export {
  buildTraceCohortSummaryEntries,
  buildTraceMetricBaseline,
  buildTraceMetricBaselines,
  emptyTraceCohortSummaryEntry,
  evaluateTraceResourceOutliers,
  getTraceCohortMetricValue,
  getTraceMetricPercentileThreshold,
  isTraceCohortKeyAvailable,
  isTraceCohortMetricEligible,
  isTraceMetricPercentileAvailable,
  TRACE_COHORT_MEDIAN_X3_MIN_SAMPLES,
  TRACE_COHORT_P90_MIN_SAMPLES,
  TRACE_COHORT_P95_MIN_SAMPLES,
  TRACE_COHORT_P99_MIN_SAMPLES,
  TRACE_RESOURCE_OUTLIER_MULTIPLIER,
  type TraceCohortBaselineData,
  type TraceCohortKey,
  type TraceCohortMetric,
  type TraceCohortSummary,
  type TraceCohortSummaryEntry,
  type TraceCohortThresholdMode,
  type TraceCohortUnavailableReason,
  type TraceMetricBaseline,
  type TraceMetricPercentileLevel,
  type TraceMetricPercentiles,
  type TraceResourceOutlierEvaluation,
  type TraceResourceOutlierReason,
  traceCohortKeys,
  traceCohortMetrics,
  traceResourceOutlierSeverityRank,
} from "./trace-cohorts.ts"
export type { GetTraceCohortSummaryByTagsInput } from "./use-cases/get-trace-cohort-summary-by-tags.ts"
export { getTraceCohortSummaryByTagsUseCase } from "./use-cases/get-trace-cohort-summary-by-tags.ts"
export type {
  LoadTraceForTraceEndFound,
  LoadTraceForTraceEndResult,
  LoadTraceForTraceEndSkipped,
} from "./use-cases/load-trace-for-trace-end.ts"
export { loadTraceForTraceEndUseCase } from "./use-cases/load-trace-for-trace-end.ts"
export { buildConversationSpanMaps } from "./use-cases/map-conversation-to-spans.ts"
export type {
  SelectTraceEndItemsError,
  TraceEndSelectionDecision,
  TraceEndSelectionInput,
  TraceEndSelectionReason,
  TraceEndSelectionResult,
  TraceEndSelectionSpec,
} from "./use-cases/select-trace-end-items.ts"
export { selectTraceEndItemsUseCase } from "./use-cases/select-trace-end-items.ts"
export type { TraceEndItemDecisionCounts } from "./use-cases/summarize-trace-end-item-decisions.ts"
export { summarizeTraceEndItemDecisions } from "./use-cases/summarize-trace-end-item-decisions.ts"

// Intentionally omit OTLP ingestion exports from the browser entry so Vite's client
// resolver does not pull in protobufjs or @domain/models transitively.
