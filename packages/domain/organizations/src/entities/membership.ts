import {
  generateId,
  type MembershipId,
  membershipIdSchema,
  type OrganizationId,
  organizationIdSchema,
  type UserId,
  userIdSchema,
} from "@domain/shared"
import { z } from "zod"

/**
 * Membership entity - represents a user's membership in an organization.
 *
 * Note: The actual membership data is stored by Better Auth in the member table.
 * This is a domain representation used for business logic.
 *
 * Invitation and confirmation state is tracked by Better Auth invitation
 * records, not on the membership record itself.
 */
export const membershipRoleSchema = z.enum(["owner", "admin", "member"])

export const membershipSchema = z.object({
  id: membershipIdSchema,
  organizationId: organizationIdSchema,
  userId: userIdSchema,
  role: membershipRoleSchema,
  createdAt: z.date(),
})

export type Membership = z.infer<typeof membershipSchema>

export type MembershipRole = Membership["role"]

export const isAdminRole = (role: MembershipRole): boolean => role === "owner" || role === "admin"

export const createMembership = (params: {
  id?: MembershipId | undefined
  organizationId: OrganizationId
  userId: UserId
  role: MembershipRole
  createdAt?: Date
}): Membership => {
  return membershipSchema.parse({
    id: params.id ?? generateId<"MembershipId">(),
    organizationId: params.organizationId,
    userId: params.userId,
    role: params.role,
    createdAt: params.createdAt ?? new Date(),
  })
}
