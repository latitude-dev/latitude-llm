import { sessionIdCandidates } from "../otlp/resolvers/identity.ts"
import { first } from "../otlp/resolvers/utils.ts"
import type { OtlpExportTraceServiceRequest } from "../otlp/types.ts"

/**
 * Returns a sampling key derived from the first span in the OTLP batch:
 *   1. Any of the known session-id attribute keys on the span attrs
 *      (see `sessionIdCandidates`)
 *   2. Same lookup on the resource attrs (mirrors the slug resolver)
 *   3. The span's `traceId` as final fallback
 *
 * Returns `null` if the payload has no spans.
 */
export function extractSamplingKey(request: OtlpExportTraceServiceRequest): string | null {
  for (const resourceSpans of request.resourceSpans ?? []) {
    const resourceAttrs = resourceSpans.resource?.attributes ?? []
    for (const scopeSpans of resourceSpans.scopeSpans ?? []) {
      for (const span of scopeSpans.spans ?? []) {
        const fromSpan = first(sessionIdCandidates, span.attributes ?? [])
        if (fromSpan) return fromSpan
        const fromResource = first(sessionIdCandidates, resourceAttrs)
        if (fromResource) return fromResource
        return span.traceId || null
      }
    }
  }
  return null
}
