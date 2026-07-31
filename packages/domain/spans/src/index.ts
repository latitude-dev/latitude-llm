// Wrapped (server-only — intentionally omitted from browser.ts
// since it pulls in per-org repositories that the browser bundle doesn't
// need). The generic `wrapped/` barrel also re-exports the Claude Code
// type's surface, so consumers that only deal with claude_code today
// don't need to import from `wrapped/types/claude-code` directly.

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
  AGENT_GRAPH_MAIN_ID,
  COHORT_SUMMARY_CACHE_TTL_SECONDS,
  MAX_AGENT_GRAPH_DEPTH,
  SESSION_END_DEBOUNCE_MS,
  SESSION_ID_MAX_LENGTH,
  SESSION_SEARCH_MAX_MATCHING_TRACES_PER_ROW,
  SPAN_ID_LENGTH,
  TRACE_END_DEBOUNCE_MS,
  TRACE_ID_LENGTH,
  TRACE_SEARCH_BOILERPLATE_MIN_TRACES,
  TRACE_SEARCH_BOILERPLATE_TRACE_FRACTION,
  TRACE_SEARCH_CHARS_PER_TOKEN_ESTIMATE,
  TRACE_SEARCH_DEFAULT_DAILY_EMBED_BUDGET_TOKENS,
  TRACE_SEARCH_DEFAULT_MONTHLY_EMBED_BUDGET_TOKENS,
  TRACE_SEARCH_DEFAULT_WEEKLY_EMBED_BUDGET_TOKENS,
  TRACE_SEARCH_DOCUMENT_MAX_ESTIMATED_TOKENS,
  TRACE_SEARCH_DOCUMENT_MAX_LENGTH,
  TRACE_SEARCH_MIN_RELEVANCE_SCORE,
} from "./constants.ts"
export type { Session, SessionDetail } from "./entities/session.ts"
export { sessionConversationMessages, sessionDetailSchema, sessionSchema } from "./entities/session.ts"
export type { SessionSearchMatch } from "./entities/session-search-match.ts"
export type {
  CostSource,
  Operation,
  Span,
  SpanDetail,
  SpanKind,
  SpanStatusCode,
  SpanTokenCounts,
  ToolDefinition,
} from "./entities/span.ts"
export {
  costSourceSchema,
  isMemoryOperation,
  isUsageOperation,
  MEMORY_OPERATIONS,
  operationSchema,
  parseCostSource,
  spanDetailSchema,
  spanKindSchema,
  spanSchema,
  spanStatusCodeSchema,
  toolDefinitionSchema,
  USAGE_OPERATIONS,
} from "./entities/span.ts"
export type { Trace, TraceConversationChunk, TraceDetail, TraceMetadataDetail } from "./entities/trace.ts"
export { traceDetailSchema, traceSchema } from "./entities/trace.ts"
export { RedactionError, SpanDecodingError } from "./errors.ts"
export type {
  CacheCadence,
  CacheCadenceHistogram,
  CacheSavingsInput,
  CacheTokenFlow,
} from "./helpers/cache-ceiling.ts"
export {
  CACHE_CEILING_LIFETIME_SECONDS,
  CACHE_CEILING_PLAUSIBLE_LIFETIME_SECONDS,
  CACHE_SAVINGS_MIN_SPEND_SHARE,
  CACHE_SAVINGS_MIN_WEEKLY_MICROCENTS,
  cacheCeilingRate,
  cacheCeilingRatesByLifetime,
  cacheCeilingSavingsMicrocents,
  cachingPremiumMicrocents,
  clearsCacheSavingsFloor,
  modeledInputCostMicrocents,
  weeklyCacheSavingsMicrocents,
} from "./helpers/cache-ceiling.ts"
export type {
  CacheClassification,
  CacheClassificationInput,
  CacheEconomicsPricing,
  CacheState,
  CacheUrgency,
} from "./helpers/cache-economics.ts"
export {
  CACHE_CEILING_MIN_MATERIAL_GAP,
  CACHE_ECONOMICS_MIN_CALLS,
  CACHE_MIN_CACHEABLE_INPUT_TOKENS,
  CACHE_STATES,
  CACHE_URGENCIES,
  cacheBreakEvenRate,
  classifyCacheState,
} from "./helpers/cache-economics.ts"
export type { ClassifiedUnpricedPair, UnpricedCause, UnpricedUsageSummary } from "./helpers/classify-unpriced-cost.ts"
export {
  classifyUnpricedPair,
  isUnpricedGap,
  summarizeUnpricedUsage,
  UNPRICED_CAUSES,
} from "./helpers/classify-unpriced-cost.ts"
export type {
  CostPerSessionDecomposition,
  DecomposeCostPerSessionInput,
  SessionCostContribution,
  SessionCostDecompositionStatus,
  SessionCostFactor,
  SessionCostModelSlice,
  SessionCostPeriod,
} from "./helpers/decompose-cost-per-session.ts"
export { decomposeCostPerSession, SESSION_COST_MIN_SESSIONS } from "./helpers/decompose-cost-per-session.ts"
export { resolveSpanCost, usdToMicrocents } from "./helpers/estimate-span-cost.ts"
export type { CacheModelJudgment, JudgedCacheModel } from "./helpers/judge-cache-economics.ts"
export { judgeCacheEconomics, promptCacheTtlSeconds } from "./helpers/judge-cache-economics.ts"
export {
  canonicalizeMessageForEmbedding,
  hashMessageContent,
  type MessageEmbeddingInput,
  type MessageEmbeddingRole,
} from "./helpers/message-embedding.ts"
export { parseMessagePayload, stringifyPayload } from "./helpers/message-payload.ts"
export { modelCacheBreakEvenRate } from "./helpers/model-cache-break-even.ts"
export { type ModelRegistryPricing, modelRegistryPricing } from "./helpers/model-registry-pricing.ts"
export { normalizeLiteralPhrase, stripLoneSurrogates } from "./helpers/normalize-literal-phrase.ts"
export {
  isLlmCompletionOperation,
  resolveLastLlmCompletionSpanId,
} from "./helpers/resolve-last-llm-completion-span.ts"
export { resolveScoreTraceContext } from "./helpers/resolve-score-trace-context.ts"
export { toolDefinitionsFrom } from "./helpers/resolve-tool-definitions.ts"
export {
  shouldReportUnpricedSpan,
  UNPRICEABLE_PAIR_REASONS,
  type UnpriceablePairReason,
  unpriceablePairReason,
} from "./helpers/should-report-unpriced.ts"
export { tokenizePhrase } from "./helpers/tokenize-phrase.ts"
export {
  resolveTraceIdFromRef,
  resolveTraceIdsFromRef,
  type TraceRef,
  type TracesRef,
  traceRefSchema,
  tracesRefSchema,
} from "./helpers/trace-ref.ts"
export {
  alignUnixSecondsToHistogramBucket,
  denseTraceTimeHistogramBuckets,
  mergeTraceHistogramTimeFilters,
  parseStartTimeBoundsFromFilters,
  pickTraceHistogramBucketSeconds,
  resolveTraceHistogramRangeIso,
} from "./helpers.ts"
export { resolveErrorTypeFromMetadata } from "./otlp/resolvers/error.ts"
export {
  resolveModelFromMetadata,
  resolveProviderFromMetadata,
  resolveUserEmailFromMetadata,
} from "./otlp/resolvers/identity.ts"
export { resolveOperationFromSourceKind } from "./otlp/resolvers/operation.ts"
export { resolveReportedPerformance } from "./otlp/resolvers/performance.ts"
export { resolveResponseIdFromMetadata } from "./otlp/resolvers/response.ts"
export { resolveToolDefinitionsFromMetadata } from "./otlp/resolvers/tool-definitions.ts"
export { resolveToolExecutionFromMetadata } from "./otlp/resolvers/tool-execution.ts"
export type { UnpricedSpanGroup } from "./otlp/transform.ts"
export type { AnalyticsQueryInput, AnalyticsQueryReaderShape } from "./ports/analytics-query-reader.ts"
export { AnalyticsQueryReader } from "./ports/analytics-query-reader.ts"
export type {
  CacheCadenceRow,
  CacheEconomics,
  CacheModelUsage,
  CacheUsageMeasures,
  CostAnalyticsRepositoryShape,
  CostAnalyticsScope,
  CostBreakdown,
  CostBreakdownDimension,
  CostBreakdownRow,
  CostBreakdownTotals,
  CostBreakdownUsage,
  CostConfidence,
  CostModelSpend,
  CostOverview,
  CostSeriesBucket,
  CostSeriesMetric,
  CostSeriesModelSlice,
  CostZeroCostPair,
  ModelUsageBucket,
  ModelUsageMeasures,
  ModelUsageSeries,
  ModelUsageSlice,
  SessionCostFactorsPair,
  SessionCostFactorsScope,
} from "./ports/cost-analytics-repository.ts"
export {
  CACHE_ECONOMICS_ROW_LIMIT,
  COST_BREAKDOWN_DIMENSIONS,
  COST_BREAKDOWN_ROW_LIMIT,
  COST_PER_CALL_MIN_SAMPLE_CALLS,
  COST_SERIES_METRICS,
  CostAnalyticsRepository,
  MODEL_USAGE_SERIES_LIMIT,
} from "./ports/cost-analytics-repository.ts"
export type { EmbedBudgetLimits, EmbedBudgetResolverShape } from "./ports/embed-budget-resolver.ts"
export { EmbedBudgetResolver } from "./ports/embed-budget-resolver.ts"
export type {
  MessageEmbedding,
  MessageEmbeddingRepositoryShape,
  MessageEmbeddingUpsert,
} from "./ports/message-embedding-repository.ts"
export { MessageEmbeddingRepository } from "./ports/message-embedding-repository.ts"
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
export type {
  MemoryOperationSpan,
  SessionToolSpan,
  SpanIngestedAtWindow,
  SpanIngestionCursor,
  SpanListCursor,
  SpanListOptions,
  SpanListOrderDirection,
  SpanListOrderField,
  SpanListPage,
  SpanMessagesData,
  SpanRepositoryShape,
} from "./ports/span-repository.ts"
export { SpanRepository } from "./ports/span-repository.ts"
export type {
  RecentDefiningSpan,
  RecentDefiningSpanPage,
  RecentToolCall,
  RecentToolCallPage,
  ToolAnalyticsRepositoryShape,
  ToolAnalyticsScope,
  ToolCallCursor,
  ToolCallHistogramBucket,
  ToolContextBreakdownRow,
  ToolContextDimension,
  ToolCoOccurrenceRow,
  ToolDefinitionDetail,
  ToolErrorBreakdownRow,
  ToolParameterStat,
  ToolParameterStatsResult,
  ToolParameterValueStat,
  ToolSummary,
  ToolsAnalytics,
  ToolsAnalyticsTotals,
  ToolUsageMetrics,
} from "./ports/tool-analytics-repository.ts"
export { ToolAnalyticsRepository } from "./ports/tool-analytics-repository.ts"
export type {
  NumericRollup,
  TokenAnalyticsAggregate,
  TraceDistinctColumn,
  TraceDistribution,
  TraceHistogramMetric,
  TraceListCursor,
  TraceListOptions,
  TraceListPage,
  TraceMetrics,
  TraceRepositoryShape,
  TraceTimeHistogramBucket,
} from "./ports/trace-repository.ts"
export {
  emptyTokenAnalytics,
  emptyTraceDistribution,
  emptyTraceMetrics,
  emptyTraceTimeHistogramBucket,
  isTraceHistogramMetric,
  TRACE_HISTOGRAM_METRICS,
  TraceRepository,
} from "./ports/trace-repository.ts"
export type { TraceSearchBudgetShape } from "./ports/trace-search-budget.ts"
export { TraceSearchBudget } from "./ports/trace-search-budget.ts"
export type {
  TraceMessageOccurrenceContent,
  TraceMessageOccurrenceRow,
  TraceSearchDocumentRow,
  TraceSearchRepositoryShape,
  TraceSemanticHighlightMatch,
} from "./ports/trace-search-repository.ts"
export { TraceSearchRepository } from "./ports/trace-search-repository.ts"
export type {
  ProjectUserSummary,
  UserActivityBucket,
  UserActivitySeries,
  UserAnalyticsRepositoryShape,
  UserCostRollup,
  UserListOptions,
  UserListPage,
  UserListTimeRange,
  UserProfile,
  UserSortField,
  UsersOverview,
  UsersOverviewBucket,
  UserUsageDimension,
  UserUsageSlice,
} from "./ports/user-analytics-repository.ts"
export { isUserSortField, USER_SORT_FIELDS, UserAnalyticsRepository } from "./ports/user-analytics-repository.ts"
export { redactSpans, type SpanRedactionSummary } from "./redaction/redact-spans.ts"
export type { RuleValidation, RuleValidationIssue } from "./redaction/validate-rule.ts"
export { REDACTION_VALIDATOR_VERSION, validateRedactionRule } from "./redaction/validate-rule.ts"
export { deterministicSample } from "./sampling/deterministic-sampler.ts"
export { extractSamplingKey } from "./sampling/extract-sampling-key.ts"
export type {
  AgentGraph,
  AgentGraphSpanInput,
  AgentMetrics,
  AgentNode,
  AgentNodeKind,
  AgentTrigger,
} from "./use-cases/build-agent-graph.ts"
export { agentGraphSpanKey, agentGraphToolCallKey, buildAgentGraph } from "./use-cases/build-agent-graph.ts"
export type {
  TraceSearchDocument,
  TraceSearchDocumentInput,
  TraceSearchEmbeddingMessage,
} from "./use-cases/build-trace-search-document.ts"
export {
  buildTraceSearchDocument,
  extractTraceSearchEmbeddingMessages,
  isTraceSearchSemanticMessage,
} from "./use-cases/build-trace-search-document.ts"
export type {
  BuildTracesExportInput,
  BuildTracesExportResult,
} from "./use-cases/build-traces-export.ts"
export { buildTracesExportUseCase } from "./use-cases/build-traces-export.ts"
export type {
  TraceHighlight,
  TraceSearchHighlightsResult,
} from "./use-cases/compute-trace-search-highlights.ts"
export { computeTraceSearchHighlights } from "./use-cases/compute-trace-search-highlights.ts"
export type {
  GetSessionAnalyticsError,
  GetSessionAnalyticsInput,
  GetSessionAnalyticsResult,
  SessionAnalyticsBucket,
  SessionAnalyticsMedianMetric,
  SessionAnalyticsTotalMetric,
} from "./use-cases/get-session-analytics.ts"
export { getSessionAnalyticsUseCase } from "./use-cases/get-session-analytics.ts"
export type { GetSessionCohortSummaryInput } from "./use-cases/get-session-cohort-summary.ts"
export { getSessionCohortSummaryUseCase } from "./use-cases/get-session-cohort-summary.ts"
export type { GetSpanConversationChunkInput } from "./use-cases/get-span-conversation-chunk.ts"
export { getSpanConversationChunkUseCase } from "./use-cases/get-span-conversation-chunk.ts"
export type {
  GetTraceAnalyticsError,
  GetTraceAnalyticsInput,
  GetTraceAnalyticsResult,
  TraceAnalyticsBucket,
  TraceAnalyticsMedianMetric,
  TraceAnalyticsTotalMetric,
} from "./use-cases/get-trace-analytics.ts"
export { getTraceAnalyticsUseCase } from "./use-cases/get-trace-analytics.ts"
export type { GetTraceCohortSummaryInput } from "./use-cases/get-trace-cohort-summary.ts"
export { getTraceCohortSummaryUseCase } from "./use-cases/get-trace-cohort-summary.ts"
export type { GetTraceConversationChunkInput } from "./use-cases/get-trace-conversation-chunk.ts"
export { getTraceConversationChunkUseCase } from "./use-cases/get-trace-conversation-chunk.ts"
export { getTraceSearchHighlightsUseCase } from "./use-cases/get-trace-search-highlights.ts"
export type { IngestSpansInput, IngestSpansResult } from "./use-cases/ingest-spans.ts"
export { ingestSpansUseCase } from "./use-cases/ingest-spans.ts"
export { ingestSpansWithBillingUseCase } from "./use-cases/ingest-spans-with-billing.ts"
export type {
  LoadTraceForTraceEndFound,
  LoadTraceForTraceEndResult,
  LoadTraceForTraceEndSkipped,
} from "./use-cases/load-trace-for-trace-end.ts"
export { loadTraceForTraceEndUseCase } from "./use-cases/load-trace-for-trace-end.ts"
export { buildConversationSpanMaps, type ConversationSpanRef } from "./use-cases/map-conversation-to-spans.ts"
export type { ParsedSearchQuery } from "./use-cases/parse-search-query.ts"
export { parseSearchQuery } from "./use-cases/parse-search-query.ts"
export type {
  PreviewRedactionInput,
  RedactionPreviewChange,
  RedactionPreviewLabelCount,
  RedactionPreviewResult,
} from "./use-cases/preview-redaction.ts"
export { IDENTITY_PREVIEW_LABEL, previewRedactionUseCase } from "./use-cases/preview-redaction.ts"
export type { ProcessIngestedSpansDeps, ProcessIngestedSpansInput } from "./use-cases/process-ingested-spans.ts"
export { processIngestedSpansUseCase } from "./use-cases/process-ingested-spans.ts"
export type { QueryAnalyticsInput } from "./use-cases/query-analytics.ts"
export { queryAnalyticsUseCase } from "./use-cases/query-analytics.ts"
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
export {
  type AssembleReportInput,
  type AssignPersonalityInput,
  assembleReport,
  assignPersonality,
  BASELINE_SHARE,
  type BashPatternRow,
  type BiggestWriteRow,
  type BranchRow,
  type BuildReportInput,
  type BusiestDayRow,
  buildReportUseCase,
  ClaudeCodeSpanReader,
  type ClaudeCodeSpanReaderShape,
  CURRENT_REPORT_VERSION,
  consultantGatePasses,
  type FileLine,
  type FileTouchesRow,
  type HeatmapCellRow,
  type LastReport,
  type LocStats,
  type LocStatsRow,
  lastReportSchema,
  listProjectsWithClaudeCodeSpansUseCase,
  type OrgProjectPair,
  PERSONALITY_KINDS,
  type Personality,
  type PersonalityKind,
  type ProjectWindowInput,
  pickReadAnchor,
  pickWrittenAnchor,
  REPORT_VERSIONS,
  type Report,
  type ReportV1,
  type ReportV2,
  type ReportV3,
  type ReportVersion,
  type RunWrappedInput,
  type RunWrappedResult,
  type RunWrappedSkippedReason,
  reportV2Schema,
  reportV3Schema,
  runWrappedUseCase,
  SCHEMA_BY_VERSION,
  type SessionDurationStatsRow,
  type SkillCount,
  type SkillCountRow,
  type Skills,
  type SkillUsageRow,
  scholarGatePasses,
  shipperGatePasses,
  strategistGatePasses,
  TOOL_BUCKETS,
  type ToolBucket,
  type ToolMix,
  type ToolMixRow,
  type TopBashCommand,
  testerGatePasses,
  toolBucketFor,
  type WindowInput,
  type WorkspaceDeepDive,
  type WorkspaceDeepDiveRow,
  type WorkspaceDeepDiveV3,
  type WorkspaceRow,
  WRAPPED_REPORT_TYPES,
  type WrappedReportRecord,
  WrappedReportRepository,
  type WrappedReportRepositoryShape,
  type WrappedReportSummary,
  type WrappedReportType,
  type WrappedTotalsRow,
} from "./wrapped/index.ts"
