import type { OrganizationId, SubscriptionId } from "@domain/shared"
import type { Plan } from "./plan.ts"

export interface Subscription {
  readonly id: SubscriptionId
  readonly organizationId: OrganizationId
  readonly plan: Plan
  readonly status: string
  readonly periodStart: Date | null
  readonly trialEndsAt: Date | null
  readonly cancelledAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

export const createSubscription = (params: {
  id: SubscriptionId
  organizationId: OrganizationId
  plan: Plan
  status?: string
  periodStart?: Date | null
  trialEndsAt?: Date | null
  cancelledAt?: Date | null
  createdAt?: Date
  updatedAt?: Date
}): Subscription => {
  const now = new Date()
  return {
    id: params.id,
    organizationId: params.organizationId,
    plan: params.plan,
    status: params.status ?? "active",
    periodStart: params.periodStart ?? null,
    trialEndsAt: params.trialEndsAt ?? null,
    cancelledAt: params.cancelledAt ?? null,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
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
