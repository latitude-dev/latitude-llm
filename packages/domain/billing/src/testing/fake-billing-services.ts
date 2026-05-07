import { Effect } from "effect"
import {
  type BillingOverride,
  type BillingUsageEvent,
  type BillingUsageEventRepository,
  type BillingUsagePeriod,
  type BillingUsagePeriodRepository,
  calculateOverageAmountMills,
  persistedIncludedCreditsForPlan,
  type StripeBillingProvider,
  type StripeSubscriptionLookup,
  type StripeSubscriptionRow,
} from "../index.ts"
import type { BillingOverrideRepository } from "../ports/billing-override-repository.ts"
import type {
  AdvanceReportedOverageCreditsInput,
  AppendBillingPeriodCreditsInput,
} from "../ports/billing-usage-period-repository.ts"

type BillingOverrideRepositoryShape = (typeof BillingOverrideRepository)["Service"]
type BillingUsageEventRepositoryShape = (typeof BillingUsageEventRepository)["Service"]
type BillingUsagePeriodRepositoryShape = (typeof BillingUsagePeriodRepository)["Service"]
type StripeSubscriptionLookupShape = (typeof StripeSubscriptionLookup)["Service"]
type StripeBillingProviderShape = (typeof StripeBillingProvider)["Service"]

const buildPeriodKey = (input: Pick<BillingUsagePeriod, "organizationId" | "periodStart" | "periodEnd">) =>
  `${input.organizationId}:${input.periodStart.toISOString()}:${input.periodEnd.toISOString()}`

export const createFakeBillingOverrideRepository = (overrides?: Partial<BillingOverrideRepositoryShape>) => {
  const overridesByOrganizationId = new Map<string, BillingOverride>()

  const repository: BillingOverrideRepositoryShape = {
    findOptionalByOrganizationId: (organizationId) =>
      Effect.succeed(overridesByOrganizationId.get(organizationId) ?? null),
    upsert: (override) =>
      Effect.sync(() => {
        overridesByOrganizationId.set(override.organizationId, override)
      }),
    deleteByOrganizationId: (organizationId) =>
      Effect.sync(() => {
        overridesByOrganizationId.delete(organizationId)
      }),
    ...overrides,
  }

  return { repository, overridesByOrganizationId }
}

export const createFakeBillingUsageEventRepository = (overrides?: Partial<BillingUsageEventRepositoryShape>) => {
  const eventsByPeriodAndIdempotencyKey = new Map<string, BillingUsageEvent>()

  const buildEventKey = (event: BillingUsageEvent) =>
    `${event.billingPeriodStart.toISOString()}:${event.idempotencyKey}`

  const repository: BillingUsageEventRepositoryShape = {
    insertIfAbsent: (event) => {
      const key = buildEventKey(event)

      if (eventsByPeriodAndIdempotencyKey.has(key)) {
        return Effect.succeed(false)
      }

      return Effect.sync(() => {
        eventsByPeriodAndIdempotencyKey.set(key, event)
        return true
      })
    },
    insertMany: (events) =>
      Effect.sync(() => {
        let insertedCount = 0

        for (const event of events) {
          const key = buildEventKey(event)
          if (eventsByPeriodAndIdempotencyKey.has(key)) continue
          eventsByPeriodAndIdempotencyKey.set(key, event)
          insertedCount += 1
        }

        return insertedCount
      }),
    findOptionalByKey: (key) =>
      Effect.succeed(
        [...eventsByPeriodAndIdempotencyKey.values()]
          .filter((event) => event.idempotencyKey === key)
          .sort((a, b) => b.happenedAt.getTime() - a.happenedAt.getTime())[0] ?? null,
      ),
    ...overrides,
  }

  return { repository, eventsByPeriodAndIdempotencyKey }
}

export const createFakeBillingUsagePeriodRepository = (overrides?: Partial<BillingUsagePeriodRepositoryShape>) => {
  const periodsByKey = new Map<string, BillingUsagePeriod>()

  const repository: BillingUsagePeriodRepositoryShape = {
    upsert: (period) =>
      Effect.sync(() => {
        periodsByKey.set(buildPeriodKey(period), period)
      }),
    appendCreditsForBillingPeriod: (input: AppendBillingPeriodCreditsInput) =>
      Effect.sync(() => {
        const key = buildPeriodKey(input)
        const current = periodsByKey.get(key)
        const consumedCredits = (current?.consumedCredits ?? 0) + input.creditsDelta
        const includedCredits = current?.includedCredits ?? input.persistedIncludedCredits
        const overageCredits = Math.max(consumedCredits - includedCredits, 0)
        const next: BillingUsagePeriod = {
          organizationId: input.organizationId,
          planSlug: input.planSlug,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          includedCredits,
          consumedCredits,
          overageCredits,
          reportedOverageCredits: current?.reportedOverageCredits ?? 0,
          overageAmountMills: calculateOverageAmountMills(input.planSlug, overageCredits),
          updatedAt: new Date(),
        }

        periodsByKey.set(key, next)
        return next
      }),
    findOptionalByPeriod: ({ organizationId, periodStart, periodEnd }) =>
      Effect.succeed(periodsByKey.get(buildPeriodKey({ organizationId, periodStart, periodEnd })) ?? null),
    advanceReportedOverageCredits: ({
      organizationId,
      periodStart,
      periodEnd,
      reportedOverageCredits,
    }: AdvanceReportedOverageCreditsInput) =>
      Effect.sync(() => {
        const key = buildPeriodKey({ organizationId, periodStart, periodEnd })
        const current = periodsByKey.get(key)
        if (!current) return null
        // Forward-only: mirror the production CAS so the test fake never
        // rolls `reportedOverageCredits` backwards.
        if (current.reportedOverageCredits >= reportedOverageCredits) return null

        const next = {
          ...current,
          reportedOverageCredits,
          updatedAt: new Date(),
        } satisfies BillingUsagePeriod

        periodsByKey.set(key, next)
        return next
      }),
    findOptionalCurrent: (organizationId) =>
      Effect.sync(() => {
        const now = Date.now()
        const current = [...periodsByKey.values()]
          .filter(
            (period) =>
              period.organizationId === organizationId &&
              period.periodStart.getTime() <= now &&
              period.periodEnd.getTime() > now,
          )
          .sort((left, right) => left.periodStart.getTime() - right.periodStart.getTime())[0]

        return current ?? null
      }),
    ...overrides,
  }

  return { repository, periodsByKey }
}

export const createFakeStripeSubscriptionLookup = (overrides?: Partial<StripeSubscriptionLookupShape>) => {
  const subscriptionsByOrganizationId = new Map<string, StripeSubscriptionRow>()

  const service: StripeSubscriptionLookupShape = {
    findOptionalActiveByOrganizationId: (organizationId) =>
      Effect.succeed(subscriptionsByOrganizationId.get(organizationId) ?? null),
    ...overrides,
  }

  return { service, subscriptionsByOrganizationId }
}

export const createFakeStripeBillingProvider = (input?: {
  readonly configured?: boolean
  readonly attachedSubscriptionIds?: readonly string[]
  readonly overrides?: Partial<StripeBillingProviderShape>
}) => {
  const attachedSubscriptionIds = new Set(input?.attachedSubscriptionIds ?? [])
  const checkedSubscriptions: string[] = []
  const attachedCalls: string[] = []
  const recordedEvents: Parameters<StripeBillingProviderShape["recordOverageMeterEvent"]>[0][] = []
  const configured = input?.configured ?? true

  const service: StripeBillingProviderShape = {
    isConfigured: () => Effect.succeed(configured),
    hasOveragePriceItem: ({ stripeSubscriptionId }) =>
      Effect.sync(() => {
        checkedSubscriptions.push(stripeSubscriptionId)
        return attachedSubscriptionIds.has(stripeSubscriptionId)
      }),
    attachOveragePriceItem: ({ stripeSubscriptionId }) =>
      Effect.sync(() => {
        attachedSubscriptionIds.add(stripeSubscriptionId)
        attachedCalls.push(stripeSubscriptionId)
      }),
    recordOverageMeterEvent: (event) =>
      Effect.sync(() => {
        recordedEvents.push(event)
      }),
    ...input?.overrides,
  }

  return {
    service,
    checkedSubscriptions,
    attachedCalls,
    recordedEvents,
  }
}

export const seedBillingUsagePeriod = (input: {
  readonly organizationId: BillingUsagePeriod["organizationId"]
  readonly planSlug: BillingUsagePeriod["planSlug"]
  readonly periodStart: Date
  readonly periodEnd: Date
  readonly includedCredits: number
  readonly consumedCredits: number
  readonly reportedOverageCredits?: number
}): BillingUsagePeriod => {
  const overageCredits = Math.max(input.consumedCredits - input.includedCredits, 0)

  return {
    organizationId: input.organizationId,
    planSlug: input.planSlug,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    includedCredits: persistedIncludedCreditsForPlan(input.planSlug, input.includedCredits),
    consumedCredits: input.consumedCredits,
    overageCredits,
    reportedOverageCredits: input.reportedOverageCredits ?? 0,
    overageAmountMills: calculateOverageAmountMills(input.planSlug, overageCredits),
    updatedAt: new Date(),
  }
}
