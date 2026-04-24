import {
  EmbedBudgetResolver,
  type EmbedBudgetResolverShape,
  TRACE_SEARCH_DEFAULT_DAILY_EMBED_BUDGET_TOKENS,
  TRACE_SEARCH_DEFAULT_MONTHLY_EMBED_BUDGET_TOKENS,
  TRACE_SEARCH_DEFAULT_WEEKLY_EMBED_BUDGET_TOKENS,
} from "@domain/spans"
import { Effect, Layer } from "effect"

/**
 * Hardcoded-defaults embed-budget resolver. Every org resolves to the same
 * constants from `@domain/spans`. Swap this out for a plan-aware resolver
 * (Postgres lookup on org.plan_id → per-plan limits) when subscription plans
 * ship — the worker and the budget tracker both go through this port, so no
 * other code changes at that point.
 */
export const EmbedBudgetResolverLive = Layer.succeed(EmbedBudgetResolver, {
  resolveLimits: () =>
    Effect.succeed({
      dailyTokens: TRACE_SEARCH_DEFAULT_DAILY_EMBED_BUDGET_TOKENS,
      weeklyTokens: TRACE_SEARCH_DEFAULT_WEEKLY_EMBED_BUDGET_TOKENS,
      monthlyTokens: TRACE_SEARCH_DEFAULT_MONTHLY_EMBED_BUDGET_TOKENS,
    }),
} satisfies EmbedBudgetResolverShape)
