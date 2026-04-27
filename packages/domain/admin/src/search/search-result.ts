import { z } from "zod"

/**
 * Admin unified-search results. Intentionally flat DTOs — we ship only the
 * fields the backoffice UI needs, so domain entities never accidentally leak
 * out of the admin surface.
 */

export const userMembershipSchema = z.object({
  organizationId: z.string(),
  organizationName: z.string(),
  organizationSlug: z.string(),
})
export type UserMembership = z.infer<typeof userMembershipSchema>

export const userSearchResultSchema = z.object({
  type: z.literal("user"),
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  role: z.enum(["user", "admin"]),
  memberships: z.array(userMembershipSchema),
  createdAt: z.date(),
})
export type UserSearchResult = z.infer<typeof userSearchResultSchema>

export const organizationSearchResultSchema = z.object({
  type: z.literal("organization"),
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.date(),
})
export type OrganizationSearchResult = z.infer<typeof organizationSearchResultSchema>

export const projectSearchResultSchema = z.object({
  type: z.literal("project"),
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  organizationId: z.string(),
  organizationName: z.string(),
  organizationSlug: z.string(),
  createdAt: z.date(),
})
export type ProjectSearchResult = z.infer<typeof projectSearchResultSchema>

export const searchEntityTypeSchema = z.enum(["all", "user", "organization", "project"])
export type SearchEntityType = z.infer<typeof searchEntityTypeSchema>

export const unifiedSearchResultSchema = z.object({
  users: z.array(userSearchResultSchema),
  organizations: z.array(organizationSearchResultSchema),
  projects: z.array(projectSearchResultSchema),
})
export type UnifiedSearchResult = z.infer<typeof unifiedSearchResultSchema>

export const emptyUnifiedSearchResult = (): UnifiedSearchResult => ({
  users: [],
  organizations: [],
  projects: [],
})
