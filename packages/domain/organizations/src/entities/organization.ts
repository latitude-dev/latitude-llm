import type { OrganizationId, SubscriptionId, UserId } from "@domain/shared-kernel"

/**
 * Organization entity - represents a tenant/workspace.
 *
 * This entity maps directly to Better Auth's organization table.
 * Users can belong to multiple organizations via the member table.
 */
export interface Organization {
  readonly id: OrganizationId
  readonly name: string
  readonly slug: string
  readonly logo: string | null
  readonly metadata: string | null // Better auth needs it
  readonly creatorId: UserId | null
  readonly currentSubscriptionId: SubscriptionId | null
  readonly stripeCustomerId: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

/**
 * Factory function to create a new Organization.
 */
export const createOrganization = (params: {
  id: OrganizationId
  name: string
  slug: string
  logo?: string | null
  metadata?: string | null
  creatorId?: UserId
  currentSubscriptionId?: SubscriptionId
  stripeCustomerId?: string
  createdAt?: Date
  updatedAt?: Date
}): Organization => {
  const now = new Date()
  return {
    id: params.id,
    name: params.name,
    slug: params.slug,
    logo: params.logo ?? null,
    metadata: params.metadata ?? null,
    creatorId: params.creatorId ?? null,
    currentSubscriptionId: params.currentSubscriptionId ?? null,
    stripeCustomerId: params.stripeCustomerId ?? null,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  }
}
