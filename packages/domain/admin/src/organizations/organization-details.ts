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

export const adminOrganizationSandboxSchema = z.object({
  /** The sandbox's own organization id (sandbox = org with a parent). */
  organizationId: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(["active", "archived"]),
  lastActivityAt: z.date(),
  owner: z
    .object({
      id: z.string(),
      email: z.string(),
      name: z.string().nullable(),
    })
    .nullable(),
  createdAt: z.date(),
})
export type AdminOrganizationSandbox = z.infer<typeof adminOrganizationSandboxSchema>

export const adminOrganizationDetailsSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  /** Surfaced for support — staff need to map customers to Stripe records. */
  stripeCustomerId: z.string().nullable(),
  /**
   * Whether this org opts into the shared read-only Showcase demo project.
   * Set `true` at org creation for new orgs; staff can toggle it here to
   * re-enable it for an org that dismissed it (or enable it on an older org
   * that predates the feature). Surfaced so the toggle shows current state.
   */
  wantsShowcase: z.boolean(),
  members: z.array(adminOrganizationMemberSchema),
  projects: z.array(adminOrganizationProjectSchema),
  sandboxes: z.array(adminOrganizationSandboxSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type AdminOrganizationDetails = z.infer<typeof adminOrganizationDetailsSchema>
