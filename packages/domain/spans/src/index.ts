export type { Session } from "./entities/session.ts"
export type { Operation, Span, SpanDetail, SpanKind, SpanStatusCode, ToolDefinition } from "./entities/span.ts"
export type { Trace, TraceDetail } from "./entities/trace.ts"
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
export {
  SESSION_ID_MAX_LENGTH,
  SPAN_ID_LENGTH,
  sessionIdSchema,
  spanIdSchema,
  TRACE_ID_LENGTH,
  traceIdSchema,
} from "./ids.ts"
export type {
  SessionDistinctColumn,
  SessionListCursor,
  SessionListOptions,
  SessionListPage,
  SessionMetrics,
  SessionRepositoryShape,
} from "./ports/session-repository.ts"
export { SessionRepository } from "./ports/session-repository.ts"
export type { SpanListOptions, SpanMessagesData, SpanRepositoryShape } from "./ports/span-repository.ts"
export { SpanRepository } from "./ports/span-repository.ts"
export type {
  NumericRollup,
  TraceDistinctColumn,
  TraceListCursor,
  TraceListOptions,
  TraceListPage,
  TraceMetrics,
  TraceRepositoryShape,
  TraceTimeHistogramBucket,
} from "./ports/trace-repository.ts"
export { TraceRepository } from "./ports/trace-repository.ts"
export type { IngestSpansInput } from "./use-cases/ingest-spans.ts"
export { ingestSpansUseCase } from "./use-cases/ingest-spans.ts"
export { buildConversationSpanMaps } from "./use-cases/map-conversation-to-spans.ts"
export type { ProcessIngestedSpansDeps, ProcessIngestedSpansInput } from "./use-cases/process-ingested-spans.ts"
export { processIngestedSpansUseCase, SpanDecodingError } from "./use-cases/process-ingested-spans.ts"
