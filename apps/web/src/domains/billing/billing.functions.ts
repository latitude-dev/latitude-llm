import {
  BillingUsagePeriodRepository,
  calculatePlanSpendMicrocents,
  PRO_PLAN_CONFIG,
} from "@domain/billing"
import { MembershipRepository, updateOrganizationUseCase } from "@domain/organizations"
import { BadRequestError, OrganizationId, PermissionError, SettingsReader } from "@domain/shared"
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

    await Effect.runPromise(
      Effect.gen(function* () {
        const membershipRepo = yield* MembershipRepository
        const isBillingAdmin = yield* membershipRepo.isAdmin(OrganizationId(organizationId), userId)
        if (!isBillingAdmin) {
          return yield* Effect.fail(
            new PermissionError({
              message: "Only organization owners and admins can manage billing settings",
              organizationId,
            }),
          )
        }

        const orgPlan = yield* resolveEffectivePlanCached(OrganizationId(organizationId))
        if (orgPlan.plan.slug !== PRO_PLAN_CONFIG.slug) {
          return yield* Effect.fail(
            new BadRequestError({ message: "Custom spending limits are only available on Pro plans" }),
          )
        }

        const spendingLimitCents =
          data.spendingLimitDollars === null ? null : Math.round(data.spendingLimitDollars * 100)

        if (spendingLimitCents !== null && spendingLimitCents < PRO_PLAN_CONFIG.priceCents) {
          return yield* Effect.fail(
            new BadRequestError({
              message: `Spending limit must be at least $${(PRO_PLAN_CONFIG.priceCents / 100).toFixed(2)}`,
            }),
          )
        }

        const settingsReader = yield* SettingsReader
        const currentSettings = (yield* settingsReader.getOrganizationSettings()) ?? {}
        const currentBillingSettings = currentSettings.billing ?? {}
        const { billing: _billing, ...settingsWithoutBilling } = currentSettings
        const nextBillingSettings =
          spendingLimitCents === null
            ? Object.fromEntries(Object.entries(currentBillingSettings).filter(([key]) => key !== "spendingLimitCents"))
            : { ...currentBillingSettings, spendingLimitCents }

        const nextSettings = {
          ...settingsWithoutBilling,
          ...(Object.keys(nextBillingSettings).length > 0 ? { billing: nextBillingSettings } : {}),
        }

        yield* updateOrganizationUseCase({ settings: nextSettings })
        yield* invalidateEffectivePlanCache(OrganizationId(organizationId))
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
          OrganizationId(organizationId),
        ),
        Effect.provide(RedisCacheStoreLive(getRedisClient())),
        withTracing,
      ),
    )
  })
