import {
  generateId,
  type OrganizationId,
  type OrganizationSettings,
  organizationIdSchema,
  organizationSettingsSchema,
} from "@domain/shared"
import { z } from "zod"

/**
 * Organization entity - represents a tenant/workspace.
 *
 * This entity maps directly to Better Auth's organization table.
 * Users can belong to multiple organizations via the member table.
 */
export const organizationSchema = z.object({
  id: organizationIdSchema,
  name: z.string().min(1),
  slug: z.string().min(1),
  logo: z.string().nullable(),
  metadata: z.string().nullable(), // Better auth needs it
  settings: organizationSettingsSchema.nullable(),
  parentOrgId: organizationIdSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Organization = z.infer<typeof organizationSchema>

/**
 * Factory function to create a new Organization.
 */
export const createOrganization = (params: {
  id?: OrganizationId | undefined
  name: string
  slug: string
  logo?: string | null
  metadata?: string | null
  settings?: OrganizationSettings | null
  parentOrgId?: OrganizationId | null
  createdAt?: Date
  updatedAt?: Date
}): Organization => {
  const now = new Date()
  return organizationSchema.parse({
    id: params.id ?? generateId<"OrganizationId">(),
    name: params.name,
    slug: params.slug,
    logo: params.logo ?? null,
    metadata: params.metadata ?? null,
    settings: params.settings ?? null,
    parentOrgId: params.parentOrgId ?? null,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  })
}
/**
 * Whether this org is a Test Mode sandbox (sibling tenant of a live parent).
 *
 * @knipignore — consumed by sandbox use-cases landing in later Test Mode PRs
 * (AGE-103+); this PR only seats the schema + predicate.
 */
export const isSandbox = (org: Pick<Organization, "parentOrgId">): boolean => org.parentOrgId !== null
