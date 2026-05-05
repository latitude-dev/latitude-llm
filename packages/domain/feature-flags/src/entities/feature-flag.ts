import {
  type FeatureFlagId,
  featureFlagIdSchema,
  generateId,
  type OrganizationFeatureFlagId,
  type OrganizationId,
  organizationFeatureFlagIdSchema,
  organizationIdSchema,
  type UserId,
  userIdSchema,
} from "@domain/shared"
import { z } from "zod"
import { FEATURE_FLAG_IDENTIFIER_MAX_LENGTH, FEATURE_FLAG_NAME_MAX_LENGTH } from "../constants.ts"

export const featureFlagIdentifierSchema = z.string().trim().min(1).max(FEATURE_FLAG_IDENTIFIER_MAX_LENGTH)

export const featureFlagSchema = z.object({
  id: featureFlagIdSchema,
  identifier: featureFlagIdentifierSchema,
  name: z.string().trim().min(1).max(FEATURE_FLAG_NAME_MAX_LENGTH).nullable(),
  description: z.string().trim().min(1).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type FeatureFlag = z.infer<typeof featureFlagSchema>
export type FeatureFlagIdentifier = z.infer<typeof featureFlagIdentifierSchema>

export const organizationFeatureFlagSchema = z.object({
  id: organizationFeatureFlagIdSchema,
  organizationId: organizationIdSchema,
  featureFlagId: featureFlagIdSchema,
  enabledByAdminUserId: userIdSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type OrganizationFeatureFlag = z.infer<typeof organizationFeatureFlagSchema>

export const createFeatureFlag = (params: {
  readonly id?: FeatureFlagId | undefined
  readonly identifier: string
  readonly name?: string | null | undefined
  readonly description?: string | null | undefined
  readonly createdAt?: Date
  readonly updatedAt?: Date
}): FeatureFlag => {
  const now = new Date()
  return featureFlagSchema.parse({
    id: params.id ?? generateId<"FeatureFlagId">(),
    identifier: params.identifier,
    name: normalizeNullableText(params.name),
    description: normalizeNullableText(params.description),
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  })
}

export const createOrganizationFeatureFlag = (params: {
  readonly id?: OrganizationFeatureFlagId | undefined
  readonly organizationId: OrganizationId
  readonly featureFlagId: FeatureFlagId
  readonly enabledByAdminUserId: UserId
  readonly createdAt?: Date
  readonly updatedAt?: Date
}): OrganizationFeatureFlag => {
  const now = new Date()
  return organizationFeatureFlagSchema.parse({
    id: params.id ?? generateId<"OrganizationFeatureFlagId">(),
    organizationId: params.organizationId,
    featureFlagId: params.featureFlagId,
    enabledByAdminUserId: params.enabledByAdminUserId,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  })
}

const normalizeNullableText = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
