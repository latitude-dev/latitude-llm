import { z } from "zod"

/**
 * Organization details for the backoffice org-detail page.
 *
 * Same flat-DTO discipline as the other admin entities. Members and
 * projects are inlined as compact summaries — the page renders both as
 * sections on the same screen, so a single round-trip beats two
 * follow-up RPCs. Each summary carries only what the row component
 * needs (no Stripe customer ids / settings / sensitive internals
 * leaking through this surface).
 */

export const adminOrganizationMemberSchema = z.object({
  /** Membership row id (`members.id`). */
  membershipId: z.string(),
  /** Per-org role. */
  role: z.enum(["owner", "admin", "member"]),
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
    image: z.string().nullable(),
    /** Global platform role — surfaced so a platform-admin lurking inside a tenant is visible at a glance. */
    role: z.enum(["user", "admin"]),
  }),
})
export type AdminOrganizationMember = z.infer<typeof adminOrganizationMemberSchema>

export const adminOrganizationProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.date(),
})
export type AdminOrganizationProject = z.infer<typeof adminOrganizationProjectSchema>

export const adminOrganizationDetailsSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  /** Surfaced for support — staff need to map customers to Stripe records. */
  stripeCustomerId: z.string().nullable(),
  members: z.array(adminOrganizationMemberSchema),
  projects: z.array(adminOrganizationProjectSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type AdminOrganizationDetails = z.infer<typeof adminOrganizationDetailsSchema>
