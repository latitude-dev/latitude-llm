import type { GenerationContentBudget } from "@domain/spans"

/**
 * How much stored generation content one assessment batch may load.
 *
 * A scoring window can cover a thousand sessions whose prompts are individually megabytes, so the
 * content read is budgeted rather than complete: the per-session cap keeps one long agent session
 * from consuming the batch, and the total cap bounds the batch itself. Payloads left out come back
 * as truncated content coverage, never as absent content.
 *
 * These are stored JSON bytes, which parse into several times as much heap — the total stays well
 * under a worker's budget for that reason, and the PR 3 shadow run is what calibrates it.
 */
export const SESSION_ASSESSMENT_CONTENT_BUDGET = {
  perSessionBytes: 4 * 1024 * 1024,
  totalBytes: 64 * 1024 * 1024,
} as const satisfies GenerationContentBudget

/**
 * How many sessions the batch resolver reads at once.
 *
 * Bounded rather than unbounded: each session in flight holds its content ledger and critical path,
 * so a thousand-session batch resolved all at once would peak at a thousand times one session's
 * working set. Sixteen keeps the pipeline busy while the resident set stays a small multiple of the
 * largest session.
 */
export const SESSION_ASSESSMENT_RESOLVER_CONCURRENCY = 16
