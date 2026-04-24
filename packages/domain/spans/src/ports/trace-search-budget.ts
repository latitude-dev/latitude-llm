import type { CacheError, OrganizationId } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"

/**
 * Per-organization embedding-token budget tracker.
 *
 * `tryConsume` is the gate the trace-search worker runs before calling
 * Voyage: it reads current daily/weekly/monthly usage and, if all three
 * windows can absorb the request, increments counters and returns `true`.
 * When any window is exhausted, returns `false` and the worker skips the
 * embed call entirely (trace stays lexical-only).
 *
 * Three rolling windows are tracked so a single burst day / week can't
 * exhaust the monthly allowance — the strictest window dominates at any
 * moment.
 *
 * Race handling is intentionally loose: we pre-check then increment, which
 * allows a small amount of overshoot under concurrent bursts. Acceptable at
 * our scales — the budget is a cost-control ceiling, not a hard financial
 * contract.
 */
export interface TraceSearchBudgetShape {
  /**
   * Attempt to consume `tokens` against the org's budget. Returns `true` if
   * all three windows had room and counters were incremented; `false` if any
   * window is exhausted (no counter change).
   */
  tryConsume(organizationId: OrganizationId, tokens: number): Effect.Effect<boolean, CacheError>
}

export class TraceSearchBudget extends ServiceMap.Service<TraceSearchBudget, TraceSearchBudgetShape>()(
  "@domain/spans/TraceSearchBudget",
) {}
