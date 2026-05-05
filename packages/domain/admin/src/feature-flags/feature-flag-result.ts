import { featureFlagIdSchema, organizationIdSchema } from "@domain/shared"
import { z } from "zod"

export const adminFeatureFlagEnabledOrganizationSchema = z.object({
  id: organizationIdSchema,
  name: z.string(),
  slug: z.string(),
})

export type AdminFeatureFlagEnabledOrganization = z.infer<typeof adminFeatureFlagEnabledOrganizationSchema>

export const adminFeatureFlagSummarySchema = z.object({
  id: featureFlagIdSchema,
  identifier: z.string(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  enabledOrganizations: z.array(adminFeatureFlagEnabledOrganizationSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type AdminFeatureFlagSummary = z.infer<typeof adminFeatureFlagSummarySchema>

export const adminOrganizationFeatureFlagSchema = adminFeatureFlagSummarySchema.omit({
  enabledOrganizations: true,
})

export type AdminOrganizationFeatureFlag = z.infer<typeof adminOrganizationFeatureFlagSchema>

export const adminOrganizationFeatureFlagsSchema = z.object({
  enabled: z.array(adminOrganizationFeatureFlagSchema),
  available: z.array(adminOrganizationFeatureFlagSchema),
})

export type AdminOrganizationFeatureFlags = z.infer<typeof adminOrganizationFeatureFlagsSchema>
