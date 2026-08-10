export const LARGE_SESSION_TRACE_THRESHOLD = 100
export const LARGE_SESSION_SPAN_THRESHOLD = 1_000
export const MAX_SESSION_ANALYSIS_TRACE_COUNT = 500

export function isLargeSession({ traceCount, spanCount }: { readonly traceCount: number; readonly spanCount: number }) {
  return traceCount > LARGE_SESSION_TRACE_THRESHOLD || spanCount > LARGE_SESSION_SPAN_THRESHOLD
}
