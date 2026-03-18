import type { OrganizationId, SubscriptionId } from "@domain/shared"
import type { Plan } from "./plan.ts"

/**
 * Subscription entity - tracks organization billing subscription.
 *
 * Each organization has one active subscription at a time.
 * Subscriptions have a plan, trial status, and cancellation tracking.
 *
 * This entity is backed by the Better Auth Stripe plugin table, which
 * has no created_at/updated_at columns. The `periodStart` field maps
 * to the Stripe billing period start.
 */
export interface Subscription {
  readonly id: SubscriptionId
  readonly organizationId: OrganizationId
  readonly plan: Plan
  readonly status: string
  readonly periodStart: Date | null
  readonly trialEndsAt: Date | null
  readonly cancelledAt: Date | null
}

export const createSubscription = (params: {
  id: SubscriptionId
  organizationId: OrganizationId
  plan: Plan
  status?: string
  periodStart?: Date | null
  trialEndsAt?: Date | null
  cancelledAt?: Date | null
}): Subscription => {
  return {
    id: params.id,
    organizationId: params.organizationId,
    plan: params.plan,
    status: params.status ?? "active",
    periodStart: params.periodStart ?? null,
    trialEndsAt: params.trialEndsAt ?? null,
    cancelledAt: params.cancelledAt ?? null,
  }
}

export const isInTrial = (subscription: Subscription): boolean => {
  if (!subscription.trialEndsAt) return false
  return new Date() < subscription.trialEndsAt
}

export const isCancelled = (subscription: Subscription): boolean => {
  return subscription.cancelledAt !== null
}

export const isActive = (subscription: Subscription): boolean => {
  if (isCancelled(subscription)) return false
  if (subscription.trialEndsAt && !isInTrial(subscription)) return false
  return true
}
