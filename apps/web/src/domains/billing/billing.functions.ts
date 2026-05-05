import { BillingUsagePeriodRepository, calculatePlanSpendMicrocents, updateSpendingLimitUseCase } from "@domain/billing"
import { OrganizationId, type UserId } from "@domain/shared"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import {
  BillingOverrideRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  invalidateEffectivePlanCache,
  MembershipRepositoryLive,
  OrganizationRepositoryLive,
  resolveEffectivePlanCached,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient, getRedisClient } from "../../server/clients.ts"

interface BillingOverviewDto {
  planSlug: "free" | "pro" | "enterprise"
  planSource: "override" | "subscription" | "free-fallback"
  periodStart: string
  periodEnd: string
  /** `null` when the plan entitlement is intentionally unbounded over JSON (Enterprise). */
  includedCredits: number | null
  consumedCredits: number
  overageCredits: number
  overageAmountMicrocents: number
  overageAllowed: boolean
  hardCapped: boolean
  retentionDays: number
  currentSpendMicrocents: number | null
  spendingLimitCents: number | null
}

export const getBillingOverview = createServerFn({ method: "GET" }).handler(async (): Promise<BillingOverviewDto> => {
  const { organizationId: orgId } = await requireSession()
  const client = getPostgresClient()

  const billingLayers = Layer.mergeAll(
    BillingOverrideRepositoryLive,
    BillingUsagePeriodRepositoryLive,
    SettingsReaderLive,
    StripeSubscriptionLookupLive,
  )

  return await Effect.runPromise(
    Effect.gen(function* () {
      const orgPlan = yield* resolveEffectivePlanCached(OrganizationId(orgId))
      const periodRepo = yield* BillingUsagePeriodRepository
      const period = yield* periodRepo.findByPeriod({
        organizationId: OrganizationId(orgId),
        periodStart: orgPlan.periodStart,
        periodEnd: orgPlan.periodEnd,
      })

      return {
        planSlug: orgPlan.plan.slug,
        planSource: orgPlan.source as BillingOverviewDto["planSource"],
        periodStart: orgPlan.periodStart.toISOString(),
        periodEnd: orgPlan.periodEnd.toISOString(),
        includedCredits: Number.isFinite(orgPlan.plan.includedCredits) ? orgPlan.plan.includedCredits : null,
        consumedCredits: period?.consumedCredits ?? 0,
        overageCredits: period?.overageCredits ?? 0,
        overageAmountMicrocents: period?.overageAmountMicrocents ?? 0,
        overageAllowed: orgPlan.plan.overageAllowed,
        hardCapped: orgPlan.plan.hardCapped,
        retentionDays: orgPlan.plan.retentionDays,
        currentSpendMicrocents: calculatePlanSpendMicrocents(orgPlan.plan.slug, period?.overageAmountMicrocents ?? 0),
        spendingLimitCents: orgPlan.plan.spendingLimitCents,
      } satisfies BillingOverviewDto
    }).pipe(
      withPostgres(billingLayers, client, OrganizationId(orgId)),
      Effect.provide(RedisCacheStoreLive(getRedisClient())),
      withTracing,
    ),
  )
})

const updateBillingSpendingLimitInputSchema = z.object({
  spendingLimitDollars: z.number().positive().max(1_000_000).nullable(),
})

export const updateBillingSpendingLimit = createServerFn({ method: "POST" })
  .inputValidator(updateBillingSpendingLimitInputSchema)
  .handler(async ({ data }): Promise<void> => {
    const { organizationId, userId } = await requireSession()
    const client = getPostgresClient()
    const orgId = OrganizationId(organizationId)

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* updateSpendingLimitUseCase({
          organizationId: orgId,
          userId: userId as UserId,
          spendingLimitDollars: data.spendingLimitDollars,
        })
        yield* invalidateEffectivePlanCache(orgId)
      }).pipe(
        withPostgres(
          Layer.mergeAll(
            BillingOverrideRepositoryLive,
            MembershipRepositoryLive,
            OrganizationRepositoryLive,
            SettingsReaderLive,
            StripeSubscriptionLookupLive,
          ),
          client,
          orgId,
        ),
        Effect.provide(RedisCacheStoreLive(getRedisClient())),
        withTracing,
      ),
    )
  })
