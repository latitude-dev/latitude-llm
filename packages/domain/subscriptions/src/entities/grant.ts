import type { GrantId, OrganizationId, SubscriptionId } from "@domain/shared-kernel"

/**
 * Grant type enum - defines what quota is being granted.
 */
export type GrantType = "seats" | "runs" | "credits"

/**
 * Grant entity - represents a quota allocation for an organization.
 *
 * Grants are issued when a subscription is created or upgraded.
 * Each grant has a balance that can be consumed.
 */
export interface Grant {
  readonly id: GrantId
  readonly organizationId: OrganizationId
  readonly subscriptionId: SubscriptionId
  readonly type: GrantType
  readonly amount: number
  readonly balance: number
  readonly expiresAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

/**
 * Factory function to create a new Grant.
 */
export const createGrant = (params: {
  id: GrantId
  organizationId: OrganizationId
  subscriptionId: SubscriptionId
  type: GrantType
  amount: number
  expiresAt?: Date | null
  createdAt?: Date
  updatedAt?: Date
}): Grant => {
  const now = new Date()
  return {
    id: params.id,
    organizationId: params.organizationId,
    subscriptionId: params.subscriptionId,
    type: params.type,
    amount: params.amount,
    balance: params.amount,
    expiresAt: params.expiresAt ?? null,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  }
}

/**
 * Check if grant is still valid (not expired).
 */
export const isValid = (grant: Grant): boolean => {
  if (!grant.expiresAt) return true
  return new Date() < grant.expiresAt
}

/**
 * Check if grant has available balance.
 */
export const hasBalance = (grant: Grant): boolean => {
  return grant.balance > 0
}

/**
 * Consume a portion of the grant balance.
 * Returns the updated grant with reduced balance.
 */
export const consume = (grant: Grant, amount: number): Grant => {
  if (amount < 0) {
    throw new Error("Cannot consume negative amount")
  }
  if (amount > grant.balance) {
    throw new Error("Insufficient balance")
  }
  return {
    ...grant,
    balance: grant.balance - amount,
    updatedAt: new Date(),
  }
}

/**
 * Revoke a grant by setting balance to 0.
 */
export const revoke = (grant: Grant): Grant => {
  return {
    ...grant,
    balance: 0,
    updatedAt: new Date(),
  }
}
