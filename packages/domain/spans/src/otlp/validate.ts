import type { OtlpExportTraceServiceRequest, OtlpSpan } from "./types.ts"

const HEX_32 = /^[0-9a-f]{32}$/
const HEX_16 = /^[0-9a-f]{16}$/
const DIGITS = /^\d+$/

function validateSpan(span: OtlpSpan, index: number): string | null {
  if (!HEX_32.test(span.traceId)) {
    return `span[${index}]: trace_id must be 32 lowercase hex characters, got "${span.traceId}" (${span.traceId.length} chars)`
  }
  if (!HEX_16.test(span.spanId)) {
    return `span[${index}]: span_id must be 16 lowercase hex characters, got "${span.spanId}" (${span.spanId.length} chars)`
  }
  if (span.parentSpanId && !HEX_16.test(span.parentSpanId)) {
    return `span[${index}]: parent_span_id must be 16 lowercase hex characters, got "${span.parentSpanId}" (${span.parentSpanId.length} chars)`
  }
  if (span.startTimeUnixNano && !DIGITS.test(span.startTimeUnixNano)) {
    return `span[${index}]: start_time_unix_nano must be a numeric string, got "${span.startTimeUnixNano}"`
  }
  if (span.endTimeUnixNano && !DIGITS.test(span.endTimeUnixNano)) {
    return `span[${index}]: end_time_unix_nano must be a numeric string, got "${span.endTimeUnixNano}"`
  }
  return null
}

export function validateOtlpCompliance(request: OtlpExportTraceServiceRequest): string | null {
  for (const resourceSpans of request.resourceSpans ?? []) {
    let spanIndex = 0
    for (const scopeSpans of resourceSpans.scopeSpans ?? []) {
      for (const span of scopeSpans.spans ?? []) {
        const error = validateSpan(span, spanIndex)
        if (error) return error
        spanIndex++
      }
    }
  }
  return null
}
