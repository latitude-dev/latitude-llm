import { stringAttr } from "../attributes.ts"
import type { OtlpEvent, OtlpKeyValue } from "../types.ts"
import { attrsFromMetadata, type Candidate, first, fromString } from "./utils.ts"

/**
 * Where a failure names the exception class behind it, most specific first.
 *
 * `error.type` is the span attribute the OTEL semconv defines. `exception.type` is the same class
 * under the name the exception conventions give it, which some instrumentations stamp on the span
 * alongside the event.
 */
const errorTypeCandidates: Candidate<string>[] = [fromString("error.type"), fromString("exception.type")]

/**
 * `recordException` records the class on an event rather than on the span, so a span that raised
 * rather than annotated names its exception nowhere else.
 */
function exceptionTypeFromEvents(events: readonly OtlpEvent[]): string | undefined {
  for (const event of events) {
    if (!event.attributes?.length) continue
    const type = stringAttr(event.attributes, "exception.type")
    if (type) return type
  }
  return undefined
}

/**
 * The exception class behind a failure, or empty when none was recorded.
 *
 * Empty rather than a literal `"error"` for anything that failed: that reads as a real type and
 * collapses every distinct failure into one group in the errored-span breakdown.
 */
export function resolveErrorType(attrs: readonly OtlpKeyValue[], events: readonly OtlpEvent[] = []): string {
  return first(errorTypeCandidates, attrs) ?? exceptionTypeFromEvents(events) ?? ""
}

/** `resolveErrorType` against a source's own metadata map, for a span that arrived by import. */
export function resolveErrorTypeFromMetadata(metadata: Record<string, unknown> | null | undefined): string {
  return resolveErrorType(attrsFromMetadata(metadata))
}
