import { BillingUsagePeriodRepository, resolveEffectivePlan } from "@domain/billing"
import { OrganizationId } from "@domain/shared"
import {
  BillingOverrideRepositoryLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"

export interface BillingOverviewDto {
  planSlug: string
  planSource: "override" | "subscription" | "free-fallback"
  periodStart: string
  periodEnd: string
  includedCredits: number
  consumedCredits: number
  overageCredits: number
  overageAllowed: boolean
  hardCapped: boolean
  retentionDays: number
}

export const getBillingOverview = createServerFn({ method: "GET" }).handler(async (): Promise<BillingOverviewDto> => {
  const { organizationId: orgId } = await requireSession()
  const client = getPostgresClient()

  const billingLayers = Layer.mergeAll(
    BillingOverrideRepositoryLive,
    BillingUsageEventRepositoryLive,
    BillingUsagePeriodRepositoryLive,
    StripeSubscriptionLookupLive,
  )

  return await Effect.runPromise(
    Effect.gen(function* () {
      const orgPlan = yield* resolveEffectivePlan(OrganizationId(orgId))
      const periodRepo = yield* BillingUsagePeriodRepository
      const period = yield* periodRepo.findCurrent(OrganizationId(orgId))

      return {
        planSlug: orgPlan.plan.slug,
        planSource: orgPlan.source,
        periodStart: orgPlan.periodStart.toISOString(),
        periodEnd: orgPlan.periodEnd.toISOString(),
        includedCredits: orgPlan.plan.includedCredits,
        consumedCredits: period?.consumedCredits ?? 0,
        overageCredits: period?.overageCredits ?? 0,
        overageAllowed: orgPlan.plan.overageAllowed,
        hardCapped: orgPlan.plan.hardCapped,
        retentionDays: orgPlan.plan.retentionDays,
      }
    }).pipe(withPostgres(billingLayers, client, OrganizationId(orgId)), withTracing),
  )
})
