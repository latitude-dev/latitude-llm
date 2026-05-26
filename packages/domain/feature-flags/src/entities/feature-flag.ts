import {
  generateId,
  type OrganizationFeatureFlagId,
  type OrganizationId,
  organizationFeatureFlagIdSchema,
  organizationIdSchema,
  type UserId,
  userIdSchema,
} from "@domain/shared"
import { z } from "zod"
import { FEATURE_FLAGS, type FeatureFlagId } from "../registry.ts"

export const featureFlagIdentifierSchema = z
  .string()
  .refine((value): value is FeatureFlagId => value in FEATURE_FLAGS, { message: "Unknown feature flag identifier" })

export const featureFlagSchema = z.object({
  identifier: featureFlagIdentifierSchema,
  enabledForAll: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type FeatureFlag = z.infer<typeof featureFlagSchema>
export type FeatureFlagIdentifier = z.infer<typeof featureFlagIdentifierSchema>

export const organizationFeatureFlagSchema = z.object({
  id: organizationFeatureFlagIdSchema,
  organizationId: organizationIdSchema,
  identifier: featureFlagIdentifierSchema,
  enabledByAdminUserId: userIdSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type OrganizationFeatureFlag = z.infer<typeof organizationFeatureFlagSchema>

export const createFeatureFlag = (params: {
  readonly identifier: FeatureFlagId
  readonly enabledForAll?: boolean | undefined
  readonly createdAt?: Date
  readonly updatedAt?: Date
}): FeatureFlag => {
  const now = new Date()
  return featureFlagSchema.parse({
    identifier: params.identifier,
    enabledForAll: params.enabledForAll ?? false,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  })
}

export const createOrganizationFeatureFlag = (params: {
  readonly id?: OrganizationFeatureFlagId | undefined
  readonly organizationId: OrganizationId
  readonly identifier: FeatureFlagId
  readonly enabledByAdminUserId: UserId
  readonly createdAt?: Date
  readonly updatedAt?: Date
}): OrganizationFeatureFlag => {
  const now = new Date()
  return organizationFeatureFlagSchema.parse({
    id: params.id ?? generateId<"OrganizationFeatureFlagId">(),
    organizationId: params.organizationId,
    identifier: params.identifier,
    enabledByAdminUserId: params.enabledByAdminUserId,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  })
}
