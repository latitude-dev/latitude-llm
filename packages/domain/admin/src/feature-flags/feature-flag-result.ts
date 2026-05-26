import { featureFlagIdentifierSchema } from "@domain/feature-flags"
import { organizationIdSchema } from "@domain/shared"
import { z } from "zod"

export const adminFeatureFlagEnabledOrganizationSchema = z.object({
  id: organizationIdSchema,
  name: z.string(),
  slug: z.string(),
})

export type AdminFeatureFlagEnabledOrganization = z.infer<typeof adminFeatureFlagEnabledOrganizationSchema>

/**
 * Aggregated view of a flag for the backoffice. The catalog (identifier,
 * name, description) is sourced from the code-side registry; enablement
 * (enabledForAll, enabledOrganizations) is sourced from the DB.
 */
export const adminFeatureFlagSummarySchema = z.object({
  identifier: featureFlagIdentifierSchema,
  emoji: z.string(),
  name: z.string(),
  description: z.string(),
  enabledForAll: z.boolean(),
  enabledOrganizations: z.array(adminFeatureFlagEnabledOrganizationSchema),
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
