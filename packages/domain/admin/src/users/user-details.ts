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

/**
 * Snapshot of a Better Auth session row for the backoffice Sessions
 * panel. The shape mirrors the underlying table 1:1 except for
 * `impersonatedByEmail`, which the repository resolves with a
 * second-pass lookup so audit views can read "Carlos was impersonating
 * this session" without a join in every consumer.
 *
 * `token` is the value Better Auth's `revokeUserSession` admin
 * endpoint takes — we surface it here so the per-row Revoke button
 * has the identifier it needs without re-fetching the session.
 */
export const adminUserSessionSchema = z.object({
  id: z.string(),
  token: z.string(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  expiresAt: z.date(),
  impersonatedByUserId: z.string().nullable(),
  /**
   * Email of the admin currently impersonating this session, when
   * `impersonatedByUserId` is set and the admin row still exists.
   * Resolved as a best-effort hint at fetch time — the audit trail of
   * record lives on `AdminImpersonationStarted` events, not on this
   * field.
   */
  impersonatedByEmail: z.string().nullable(),
})
export type AdminUserSession = z.infer<typeof adminUserSessionSchema>

export const adminUserDetailsSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  role: z.enum(["user", "admin"]),
  memberships: z.array(adminUserMembershipSchema),
  /**
   * Active sessions for this user (`expiresAt > now()` at the moment
   * of the fetch). Sorted impersonation-first, then by `updatedAt`
   * descending so the most-recently-active row reads at the top.
   */
  sessions: z.array(adminUserSessionSchema),
  createdAt: z.date(),
})
export type AdminUserDetails = z.infer<typeof adminUserDetailsSchema>
