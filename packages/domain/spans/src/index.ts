export type { Operation, Span, SpanDetail, SpanKind, SpanStatusCode, ToolDefinition } from "./entities/span.ts"
export type { Trace, TraceDetail, TraceStatus } from "./entities/trace.ts"
export type { SpanListOptions, SpanRepositoryShape } from "./ports/span-repository.ts"
export { SpanRepository } from "./ports/span-repository.ts"
export type {
  TraceDistinctColumn,
  TraceListCursor,
  TraceListOptions,
  TraceListPage,
  TraceRepositoryShape,
} from "./ports/trace-repository.ts"
export { TraceRepository } from "./ports/trace-repository.ts"
export type { IngestSpansInput } from "./use-cases/ingest-spans.ts"
export { ingestSpansUseCase } from "./use-cases/ingest-spans.ts"
