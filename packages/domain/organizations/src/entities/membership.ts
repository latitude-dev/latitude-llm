import type { OrganizationId, UserId } from "@domain/shared-kernel"

/**
 * Membership entity - represents a user's membership in an organization.
 *
 * Note: The actual membership data is stored by Better Auth in the member table.
 * This is a domain representation used for business logic.
 */
export interface Membership {
  readonly id: string // Better Auth member id
  readonly organizationId: OrganizationId
  readonly userId: UserId
  readonly role: MembershipRole
  readonly invitedAt: Date | null
  readonly confirmedAt: Date | null
  readonly createdAt: Date
}

export type MembershipRole = "owner" | "admin" | "member"

/**
 * Check if a role has admin privileges.
 */
export const isAdminRole = (role: MembershipRole): boolean => role === "owner" || role === "admin"

/**
 * Factory function to create a Membership.
 */
export const createMembership = (params: {
  id: string
  organizationId: OrganizationId
  userId: UserId
  role: MembershipRole
  invitedAt?: Date
  confirmedAt?: Date
  createdAt?: Date
}): Membership => {
  return {
    id: params.id,
    organizationId: params.organizationId,
    userId: params.userId,
    role: params.role,
    invitedAt: params.invitedAt ?? null,
    confirmedAt: params.confirmedAt ?? null,
    createdAt: params.createdAt ?? new Date(),
  }
}
