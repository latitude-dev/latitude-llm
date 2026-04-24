import type { OrganizationId } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"

/**
 * Per-window embed-token budgets for one organization. All three limits are
 * enforced by `TraceSearchBudget.tryConsume` — a trace is embedded only when
 * every window can absorb its estimated tokens.
 */
export interface EmbedBudgetLimits {
  readonly dailyTokens: number
  readonly weeklyTokens: number
  readonly monthlyTokens: number
}

/**
 * Resolves per-organization embedding budgets. Today every org gets the same
 * hardcoded limits from `@domain/spans/constants`; when subscription plans
 * land, the production implementation will read the org's plan and return
 * per-plan values.
 *
 * The port shape is intentionally a simple `(orgId) => limits` effect so it
 * can be swapped for a Postgres-backed plan lookup without touching the
 * worker, the budget service, or tests.
 */
export interface EmbedBudgetResolverShape {
  resolveLimits(organizationId: OrganizationId): Effect.Effect<EmbedBudgetLimits, never>
}

export class EmbedBudgetResolver extends ServiceMap.Service<EmbedBudgetResolver, EmbedBudgetResolverShape>()(
  "@domain/spans/EmbedBudgetResolver",
) {}
