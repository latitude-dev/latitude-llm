import { z } from "zod"

/**
 * User details returned by the backoffice user-detail page.
 *
 * Intentionally flat DTOs — we ship only the fields the admin UI needs,
 * and expose memberships inline rather than returning full domain
 * `User` + `Membership` entities, so impersonation / audit flows never
 * accidentally leak sensitive internals (Stripe customer ids, auth
 * provider tokens, etc.) through this surface.
 */

export const adminUserMembershipSchema = z.object({
  organizationId: z.string(),
  organizationName: z.string(),
  organizationSlug: z.string(),
  role: z.enum(["owner", "admin", "member"]),
})
export type AdminUserMembership = z.infer<typeof adminUserMembershipSchema>

export const adminUserDetailsSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  role: z.enum(["user", "admin"]),
  memberships: z.array(adminUserMembershipSchema),
  createdAt: z.date(),
})
export type AdminUserDetails = z.infer<typeof adminUserDetailsSchema>
