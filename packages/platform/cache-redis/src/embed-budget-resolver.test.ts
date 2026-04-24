import { OrganizationId } from "@domain/shared"
import {
  EmbedBudgetResolver,
  TRACE_SEARCH_DEFAULT_DAILY_EMBED_BUDGET_TOKENS,
  TRACE_SEARCH_DEFAULT_MONTHLY_EMBED_BUDGET_TOKENS,
  TRACE_SEARCH_DEFAULT_WEEKLY_EMBED_BUDGET_TOKENS,
} from "@domain/spans"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { EmbedBudgetResolverLive } from "./embed-budget-resolver.ts"

describe("EmbedBudgetResolverLive", () => {
  it("resolves the hardcoded constants regardless of org id", async () => {
    const a = OrganizationId("a".repeat(24))
    const b = OrganizationId("b".repeat(24))

    const [limitsA, limitsB] = await Effect.runPromise(
      Effect.gen(function* () {
        const resolver = yield* EmbedBudgetResolver
        return [yield* resolver.resolveLimits(a), yield* resolver.resolveLimits(b)] as const
      }).pipe(Effect.provide(EmbedBudgetResolverLive)),
    )

    expect(limitsA).toEqual({
      dailyTokens: TRACE_SEARCH_DEFAULT_DAILY_EMBED_BUDGET_TOKENS,
      weeklyTokens: TRACE_SEARCH_DEFAULT_WEEKLY_EMBED_BUDGET_TOKENS,
      monthlyTokens: TRACE_SEARCH_DEFAULT_MONTHLY_EMBED_BUDGET_TOKENS,
    })
    // Both orgs get the same hardcoded limits — pre-plan-tier behavior.
    expect(limitsB).toEqual(limitsA)
  })
})
