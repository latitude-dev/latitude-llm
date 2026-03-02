import type { NotFoundError, OrganizationId, RepositoryError } from "@domain/shared-kernel"
import { Effect } from "effect"
import type { Grant, GrantType } from "../entities/grant.ts"
import type { Plan } from "../entities/plan.ts"
import type { GrantRepository } from "../ports/grant-repository.ts"
import type { SubscriptionRepository } from "../ports/subscription-repository.ts"

/**
 * Quota information for a specific resource type.
 */
export interface QuotaInfo {
  readonly type: GrantType
  readonly total: number
  readonly used: number
  readonly remaining: number
  readonly grants: readonly Grant[]
}

/**
 * Complete organization quota information.
 */
export interface OrganizationQuota {
  readonly organizationId: OrganizationId
  readonly plan: Plan | null
  readonly quotas: {
    readonly seats: QuotaInfo
    readonly runs: QuotaInfo
    readonly credits: QuotaInfo
  }
  readonly hasActiveSubscription: boolean
  readonly isInTrial: boolean
  readonly trialEndsAt: Date | null
}

/**
 * Error types for get organization quota use case.
 */
export type GetOrganizationQuotaError = RepositoryError | NotFoundError

/**
 * Calculate total available balance from a list of grants.
 */
const calculateQuota = (grants: readonly Grant[]): { total: number; used: number; remaining: number } => {
  const total = grants.reduce((sum, g) => sum + g.amount, 0)
  const remaining = grants.reduce((sum, g) => sum + g.balance, 0)
  const used = total - remaining
  return { total, used, remaining }
}

/**
 * Get current quota information for an organization.
 *
 * This use case:
 * 1. Finds the active subscription for the organization
 * 2. Retrieves all active grants grouped by type
 * 3. Calculates total, used, and remaining quotas
 * 4. Returns comprehensive quota information
 */
export const getOrganizationQuota =
  (deps: {
    subscriptionRepository: SubscriptionRepository
    grantRepository: GrantRepository
  }) =>
  (organizationId: OrganizationId): Effect.Effect<OrganizationQuota, GetOrganizationQuotaError> => {
    return Effect.gen(function* () {
      // Find active subscription
      const subscription = yield* deps.subscriptionRepository.findActiveByOrganizationId(organizationId)

      const hasActiveSubscription = subscription !== null
      const isInTrial = subscription?.trialEndsAt ? new Date() < subscription.trialEndsAt : false

      // Get active grants for each type
      const [seatsGrants, runsGrants, creditsGrants] = yield* Effect.all(
        [
          deps.grantRepository.findActiveByType(organizationId, "seats"),
          deps.grantRepository.findActiveByType(organizationId, "runs"),
          deps.grantRepository.findActiveByType(organizationId, "credits"),
        ],
        { concurrency: "unbounded" },
      )

      // Calculate quotas
      const seatsQuota = calculateQuota(seatsGrants)
      const runsQuota = calculateQuota(runsGrants)
      const creditsQuota = calculateQuota(creditsGrants)

      return {
        organizationId,
        plan: subscription?.plan ?? null,
        quotas: {
          seats: {
            type: "seats",
            total: seatsQuota.total,
            used: seatsQuota.used,
            remaining: seatsQuota.remaining,
            grants: seatsGrants,
          },
          runs: {
            type: "runs",
            total: runsQuota.total,
            used: runsQuota.used,
            remaining: runsQuota.remaining,
            grants: runsGrants,
          },
          credits: {
            type: "credits",
            total: creditsQuota.total,
            used: creditsQuota.used,
            remaining: creditsQuota.remaining,
            grants: creditsGrants,
          },
        },
        hasActiveSubscription,
        isInTrial,
        trialEndsAt: subscription?.trialEndsAt ?? null,
      }
    })
  }
