export type { Span, SpanDetail, SpanKind, SpanStatusCode, ToolDefinition } from "./entities/span.ts"
export type { Trace, TraceDetail, TraceStatus } from "./entities/trace.ts"
export type {
  ArrayContainsFilter,
  DateFilter,
  DateRangeFilter,
  FieldFilter,
  NumberFilter,
  NumberRangeFilter,
  StringFilter,
} from "./filters.ts"
export { decodeOtlpProtobuf } from "./otlp/proto.ts"
export type { TransformContext } from "./otlp/transform.ts"
export { transformOtlpToSpans } from "./otlp/transform.ts"
export type { OtlpExportTraceServiceRequest } from "./otlp/types.ts"
export type { SpanListOptions, SpanRepositoryShape } from "./ports/span-repository.ts"
export { SpanRepository } from "./ports/span-repository.ts"
export type { TraceListOptions, TraceRepositoryShape } from "./ports/trace-repository.ts"
export { TraceRepository } from "./ports/trace-repository.ts"
