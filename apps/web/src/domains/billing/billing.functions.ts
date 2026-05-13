import {
  BillingUsagePeriodRepository,
  calculatePlanSpendMills,
  PLAN_SLUGS,
  updateSpendingLimitUseCase,
} from "@domain/billing"
import { BadRequestError, OrganizationId, type UserId } from "@domain/shared"
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
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getBetterAuth, getPostgresClient, getRedisClient } from "../../server/clients.ts"

interface BillingOverviewDto {
  planSlug: "free" | "pro" | "enterprise"
  planSource: "override" | "subscription" | "free-fallback"
  periodStart: string
  periodEnd: string
  /** `null` when the plan entitlement is intentionally unbounded over JSON (Enterprise). */
  includedCredits: number | null
  consumedCredits: number
  overageCredits: number
  overageAmountMills: number
  overageAllowed: boolean
  hardCapped: boolean
  retentionDays: number
  currentSpendMills: number | null
  spendingLimitCents: number | null
}

const loadBillingOverview = Effect.fn("web.billing.getOverview")(function* (organizationId: string) {
  const orgPlan = yield* resolveEffectivePlanCached(OrganizationId(organizationId))
  const periodRepo = yield* BillingUsagePeriodRepository
  const period = yield* periodRepo.findOptionalByPeriod({
    organizationId: OrganizationId(organizationId),
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
    overageAmountMills: period?.overageAmountMills ?? 0,
    overageAllowed: orgPlan.plan.overageAllowed,
    hardCapped: orgPlan.plan.hardCapped,
    retentionDays: orgPlan.plan.retentionDays,
    currentSpendMills: calculatePlanSpendMills(orgPlan.plan.slug, period?.overageAmountMills ?? 0),
    spendingLimitCents: orgPlan.plan.spendingLimitCents,
  } satisfies BillingOverviewDto
})

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
    loadBillingOverview(orgId).pipe(
      withPostgres(billingLayers, client, OrganizationId(orgId)),
      Effect.provide(RedisCacheStoreLive(getRedisClient())),
      withTracing,
    ),
  )
})

export const getFreshBillingOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<BillingOverviewDto> => {
    const { organizationId: orgId } = await requireSession()
    const client = getPostgresClient()
    const organizationId = OrganizationId(orgId)

    const billingLayers = Layer.mergeAll(
      BillingOverrideRepositoryLive,
      BillingUsagePeriodRepositoryLive,
      SettingsReaderLive,
      StripeSubscriptionLookupLive,
    )

    return await Effect.runPromise(
      Effect.gen(function* () {
        yield* invalidateEffectivePlanCache(organizationId)
        return yield* loadBillingOverview(orgId)
      }).pipe(
        withPostgres(billingLayers, client, organizationId),
        Effect.provide(RedisCacheStoreLive(getRedisClient())),
        withTracing,
      ),
    )
  },
)

const updateBillingSpendingLimitInputSchema = z.object({
  spendingLimitDollars: z.number().positive().max(1_000_000).nullable(),
})

const applyBillingSpendingLimitUpdate = Effect.fn("web.billing.updateSpendingLimit")(function* (input: {
  readonly organizationId: OrganizationId
  readonly userId: UserId
  readonly spendingLimitDollars: number | null
}) {
  yield* updateSpendingLimitUseCase({
    organizationId: input.organizationId,
    userId: input.userId,
    spendingLimitDollars: input.spendingLimitDollars,
  })
  yield* invalidateEffectivePlanCache(input.organizationId)
})

export const updateBillingSpendingLimit = createServerFn({ method: "POST" })
  .inputValidator((input: unknown): z.infer<typeof updateBillingSpendingLimitInputSchema> => {
    const parsed = updateBillingSpendingLimitInputSchema.safeParse(input)
    if (!parsed.success) {
      throw new BadRequestError({ message: JSON.stringify(parsed.error.issues) })
    }

    return parsed.data
  })
  .handler(async ({ data }): Promise<void> => {
    const { organizationId, userId } = await requireSession()
    const client = getPostgresClient()
    const orgId = OrganizationId(organizationId)

    await Effect.runPromise(
      applyBillingSpendingLimitUpdate({
        organizationId: orgId,
        userId: userId as UserId,
        spendingLimitDollars: data.spendingLimitDollars,
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

const billingRedirectInputSchema = z.object({
  returnUrl: z.string().min(1).max(2048),
})

const upgradeBillingInputSchema = billingRedirectInputSchema.extend({
  plan: z.enum(PLAN_SLUGS),
})

interface BillingRedirectResult {
  readonly url: string | null
}

/**
 * Subset of the `@better-auth/stripe` plugin API we call from server functions.
 * The plugin is registered conditionally on `stripeClient && stripeWebhookSecret`,
 * so its endpoint types do not flow through `auth.api` statically.
 */
interface StripeAuthApi {
  readonly upgradeSubscription: (input: {
    body: {
      plan: string
      customerType: "organization" | "user"
      referenceId: string
      successUrl: string
      cancelUrl: string
      returnUrl: string
      disableRedirect: boolean
    }
    headers: Headers
  }) => Promise<{ url?: string | null } | undefined>
  readonly createBillingPortal: (input: {
    body: {
      customerType: "organization" | "user"
      referenceId: string
      returnUrl: string
      disableRedirect: boolean
    }
    headers: Headers
  }) => Promise<{ url?: string | null } | undefined>
}

class StripeApiUnavailableError extends Error {
  constructor(missingMethod: string) {
    super(
      `Stripe billing endpoints are not available on better-auth. Missing "${missingMethod}". ` +
        `Verify LAT_STRIPE_SECRET_KEY and LAT_STRIPE_WEBHOOK_SECRET are set so the @better-auth/stripe plugin is registered.`,
    )
    this.name = "StripeApiUnavailableError"
  }
}

const stripeApi = (): StripeAuthApi => {
  const api = getBetterAuth().api as unknown as Partial<StripeAuthApi>
  // The cast above is unchecked because better-auth's plugin endpoints are
  // typed dynamically. Verify at runtime that the methods we depend on exist
  // before returning, so a misconfigured environment fails loudly at the
  // call boundary instead of as a confusing `undefined is not a function`.
  if (typeof api.upgradeSubscription !== "function") {
    throw new StripeApiUnavailableError("upgradeSubscription")
  }
  if (typeof api.createBillingPortal !== "function") {
    throw new StripeApiUnavailableError("createBillingPortal")
  }
  return api as StripeAuthApi
}

export const createBillingCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator(upgradeBillingInputSchema)
  .handler(async ({ data }): Promise<BillingRedirectResult> => {
    const { organizationId } = await requireSession()

    const result = await stripeApi().upgradeSubscription({
      body: {
        plan: data.plan,
        customerType: "organization",
        referenceId: organizationId,
        successUrl: data.returnUrl,
        cancelUrl: data.returnUrl,
        returnUrl: data.returnUrl,
        disableRedirect: true,
      },
      headers: getRequestHeaders() as unknown as Headers,
    })

    return { url: typeof result?.url === "string" ? result.url : null }
  })

export const createBillingPortalSession = createServerFn({ method: "POST" })
  .inputValidator(billingRedirectInputSchema)
  .handler(async ({ data }): Promise<BillingRedirectResult> => {
    const { organizationId } = await requireSession()

    const result = await stripeApi().createBillingPortal({
      body: {
        customerType: "organization",
        referenceId: organizationId,
        returnUrl: data.returnUrl,
        disableRedirect: true,
      },
      headers: getRequestHeaders() as unknown as Headers,
    })

    return { url: typeof result?.url === "string" ? result.url : null }
  })
