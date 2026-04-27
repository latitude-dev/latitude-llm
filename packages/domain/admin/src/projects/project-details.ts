import { z } from "zod"

/**
 * Project details for the backoffice project-detail page.
 *
 * Same flat-DTO discipline as the other admin entities — only the
 * fields the staff UI renders, no domain-entity passthrough, so
 * sensitive fields can't leak through this surface accidentally.
 *
 * `organization` is included inline because the detail page renders a
 * link to the parent organisation as a primary affordance (same as the
 * search-results project row). Pulling it inline saves a second
 * round-trip and keeps the page render fully driven by the loader's
 * single result.
 */

export const adminProjectOrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
})
export type AdminProjectOrganization = z.infer<typeof adminProjectOrganizationSchema>

export const adminProjectSettingsSchema = z.object({
  keepMonitoring: z.boolean().optional(),
})
export type AdminProjectSettings = z.infer<typeof adminProjectSettingsSchema>

export const adminProjectDetailsSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  organization: adminProjectOrganizationSchema,
  settings: adminProjectSettingsSchema.nullable(),
  firstTraceAt: z.date().nullable(),
  lastEditedAt: z.date(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type AdminProjectDetails = z.infer<typeof adminProjectDetailsSchema>
