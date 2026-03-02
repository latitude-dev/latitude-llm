import type { OrganizationId, SubscriptionId } from "@domain/shared-kernel";
import type { Plan } from "./plan.ts";

/**
 * Subscription entity - tracks organization billing subscription.
 *
 * Each organization has one active subscription at a time.
 * Subscriptions have a plan, trial status, and cancellation tracking.
 */
export interface Subscription {
  readonly id: SubscriptionId;
  readonly organizationId: OrganizationId;
  readonly plan: Plan;
  readonly trialEndsAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Factory function to create a new Subscription.
 */
export const createSubscription = (params: {
  id: SubscriptionId;
  organizationId: OrganizationId;
  plan: Plan;
  trialEndsAt?: Date | null;
  cancelledAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}): Subscription => {
  const now = new Date();
  return {
    id: params.id,
    organizationId: params.organizationId,
    plan: params.plan,
    trialEndsAt: params.trialEndsAt ?? null,
    cancelledAt: params.cancelledAt ?? null,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  };
};

/**
 * Check if subscription is in trial period.
 */
export const isInTrial = (subscription: Subscription): boolean => {
  if (!subscription.trialEndsAt) return false;
  return new Date() < subscription.trialEndsAt;
};

/**
 * Check if subscription has been cancelled.
 */
export const isCancelled = (subscription: Subscription): boolean => {
  return subscription.cancelledAt !== null;
};

/**
 * Check if subscription is active (not cancelled and either paid or in trial).
 */
export const isActive = (subscription: Subscription): boolean => {
  if (isCancelled(subscription)) return false;
  if (subscription.trialEndsAt && !isInTrial(subscription)) return false;
  return true;
};
