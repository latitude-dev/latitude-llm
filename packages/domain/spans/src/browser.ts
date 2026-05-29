export {
  buildMetricBaseline,
  buildMetricBaselines,
  COHORT_P90_MIN_SAMPLES,
  COHORT_P95_MIN_SAMPLES,
  COHORT_P99_MIN_SAMPLES,
  type CohortBaselineData,
  type CohortMetric,
  type CohortSummary,
  cohortMetrics,
  getMetricPercentileThreshold,
  isMetricPercentileAvailable,
  type MetricBaseline,
  type MetricPercentileLevel,
  type MetricPercentiles,
} from "./cohort-baselines.ts"
export {
  COHORT_SUMMARY_CACHE_TTL_SECONDS,
  SESSION_ID_MAX_LENGTH,
  SESSION_SEARCH_MAX_MATCHING_TRACES_PER_ROW,
  SPAN_ID_LENGTH,
  TRACE_END_DEBOUNCE_MS,
  TRACE_ID_LENGTH,
} from "./constants.ts"
export type { Session, SessionDetail } from "./entities/session.ts"
export { sessionDetailSchema, sessionSchema } from "./entities/session.ts"
export type { SessionSearchMatch } from "./entities/session-search-match.ts"
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
  isLlmCompletionOperation,
  resolveLastLlmCompletionSpanId,
} from "./helpers/resolve-last-llm-completion-span.ts"
export { resolveScoreTraceContext } from "./helpers/resolve-score-trace-context.ts"
export { resolveTraceIdFromRef, type TraceRef, traceRefSchema } from "./helpers/trace-ref.ts"
export {
  alignUnixSecondsToHistogramBucket,
  denseTraceTimeHistogramBuckets,
  mergeTraceHistogramTimeFilters,
  parseStartTimeBoundsFromFilters,
  pickTraceHistogramBucketSeconds,
  resolveTraceHistogramRangeIso,
} from "./helpers.ts"
export type {
  SessionCountResult,
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
export type { GetSessionCohortSummaryByTagsInput } from "./use-cases/get-session-cohort-summary-by-tags.ts"
export { getSessionCohortSummaryByTagsUseCase } from "./use-cases/get-session-cohort-summary-by-tags.ts"
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
export { WRAPPED_REPORT_TYPES, type WrappedReportType } from "./wrapped/entities/wrapped-report-record.ts"

// Intentionally omit OTLP ingestion exports from the browser entry so Vite's client
// resolver does not pull in protobufjs or @domain/models transitively.
