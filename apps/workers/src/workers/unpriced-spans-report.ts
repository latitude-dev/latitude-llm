import type { OrganizationId } from "@domain/shared"
import type { UnpricedSpanGroup } from "@domain/spans"
import { createLogger, recordSpanExceptionForDatadog, SpanStatusCode, trace } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("unpriced-spans")
const tracer = trace.getTracer("unpriced-spans")

/**
 * Datadog fingerprints Error Tracking issues on error type and stack, so this is thrown from one
 * site with a constant message to keep every occurrence in a single issue. The provider and model
 * ride on span attributes instead — putting them in the message would split the issue per customer
 * SDK and bury the signal in a long tail.
 */
class UnpricedSpanError extends Error {
  constructor() {
    super("Ingested token usage that no pricing matched; cost recorded as 0")
    this.name = "UnpricedSpanError"
  }
}

const REPORT_INTERVAL_MS = 60 * 60 * 1000

/**
 * Emission is driven by customer traffic, so an unmapped SDK on a busy project would otherwise
 * report on every batch forever. One report per hour per pair carries the same information.
 */
export const MAX_TRACKED_PAIRS = 500

/** Insertion order is kept as least-recently-reported first, so the first key is the eviction target. */
const lastReportedAt = new Map<string, number>()

function evictToMakeRoom(now: number): void {
  if (lastReportedAt.size < MAX_TRACKED_PAIRS) return

  for (const [tracked, at] of lastReportedAt) {
    if (now - at >= REPORT_INTERVAL_MS) lastReportedAt.delete(tracked)
  }
  // Still full of live claims: drop only the oldest. Clearing the whole map here would lift the
  // throttle off every pair at once, so a flood of new pairs could re-open the ones it displaced.
  if (lastReportedAt.size >= MAX_TRACKED_PAIRS) {
    const oldest = lastReportedAt.keys().next().value
    if (oldest !== undefined) lastReportedAt.delete(oldest)
  }
}

function claimReportSlot(key: string, now: number): boolean {
  const previous = lastReportedAt.get(key)
  if (previous !== undefined && now - previous < REPORT_INTERVAL_MS) return false

  evictToMakeRoom(now)
  lastReportedAt.delete(key)
  lastReportedAt.set(key, now)
  return true
}

/**
 * A span of its own, not the ingest span: the batch succeeded and its spans were stored, so marking
 * that span as an error would fail a healthy job and pollute the `status:error` queries used to
 * triage real ingest breakage.
 */
function recordUnpricedSpanIssue(group: UnpricedSpanGroup, organizationId: OrganizationId): void {
  const span = tracer.startSpan("cost.unpriced_spans")
  span.setAttributes({
    "latitude.organization_id": organizationId,
    "latitude.project_id": group.projectId,
    "gen_ai.provider.name": group.provider,
    "gen_ai.request.model": group.model,
    "cost.unpriced_spans": group.spans,
  })
  const error = new UnpricedSpanError()
  recordSpanExceptionForDatadog(span, error)
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
  span.end()
}

export function reportUnpricedSpans(
  groups: readonly UnpricedSpanGroup[],
  organizationId: OrganizationId,
): Effect.Effect<void> {
  return Effect.sync(() => {
    const now = Date.now()

    for (const group of groups) {
      const key = `${organizationId}:${group.projectId}:${group.provider}:${group.model}`
      if (!claimReportSlot(key, now)) continue

      logger.error("Ingested token usage that no pricing matched", {
        organizationId,
        projectId: group.projectId,
        provider: group.provider,
        model: group.model,
        spans: group.spans,
      })
      recordUnpricedSpanIssue(group, organizationId)
    }
  })
}

/** Exported for tests: the throttle is process-wide state that would otherwise leak across cases. */
export function resetUnpricedSpanReportThrottle(): void {
  lastReportedAt.clear()
}
