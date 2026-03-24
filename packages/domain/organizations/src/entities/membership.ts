import type { OrganizationId, UserId } from "@domain/shared"
import { generateId } from "@domain/shared"

/**
 * Membership entity - represents a user's membership in an organization.
 *
 * Note: The actual membership data is stored by Better Auth in the member table.
 * This is a domain representation used for business logic.
 *
 * Invitation and confirmation state is tracked by Better Auth invitation
 * records, not on the membership record itself.
 */
export interface Membership {
  readonly id: string
  readonly organizationId: OrganizationId
  readonly userId: UserId
  readonly role: MembershipRole
  readonly createdAt: Date
}

export type MembershipRole = "owner" | "admin" | "member"

export const isAdminRole = (role: MembershipRole): boolean => role === "owner" || role === "admin"

export const createMembership = (params: {
  id?: string | undefined
  organizationId: OrganizationId
  userId: UserId
  role: MembershipRole
  createdAt?: Date
}): Membership => {
  return {
    id: params.id ?? generateId(),
    organizationId: params.organizationId,
    userId: params.userId,
    role: params.role,
    createdAt: params.createdAt ?? new Date(),
  }
}
