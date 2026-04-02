import { apiKeyIdSchema, type ApiKeyId, generateId, organizationIdSchema, type OrganizationId } from "@domain/shared"
import { z } from "zod"

/**
 * API Key entity - authenticates organization-bound requests.
 *
 * API keys are scoped to an organization and provide token-based
 * authentication for API access. Tokens are UUIDs generated
 * using crypto.randomUUID().
 *
 * The token is encrypted at the application level (AES-256-GCM)
 * and a SHA-256 hex hash of the UTF-8 token bytes (tokenHash) is stored for indexed
 * lookups without decryption.
 */
export const apiKeySchema = z.object({
  id: apiKeyIdSchema,
  organizationId: organizationIdSchema,
  token: z.string().min(1),
  tokenHash: z.string().min(1),
  name: z.string().min(1),
  lastUsedAt: z.date().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type ApiKey = z.infer<typeof apiKeySchema>

/**
 * Factory function to create a new API Key.
 */
export const createApiKey = (params: {
  id?: ApiKeyId | undefined
  organizationId: OrganizationId
  token: string
  tokenHash: string
  name: string
  lastUsedAt?: Date | null
  deletedAt?: Date | null
  createdAt?: Date
  updatedAt?: Date
}): ApiKey => {
  const now = new Date()
  return apiKeySchema.parse({
    id: params.id ?? generateId<"ApiKeyId">(),
    organizationId: params.organizationId,
    token: params.token,
    tokenHash: params.tokenHash,
    name: params.name,
    lastUsedAt: params.lastUsedAt ?? null,
    deletedAt: params.deletedAt ?? null,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  })
}

/**
 * Generate a new API key token (UUID v4).
 */
export const generateApiKeyToken = (): string => {
  return crypto.randomUUID()
}

/**
 * Check if an API key is active (not soft-deleted).
 */
export const isActive = (apiKey: ApiKey): boolean => {
  return apiKey.deletedAt === null
}

/**
 * Touch the API key to update its lastUsedAt timestamp.
 */
export const touch = (apiKey: ApiKey): ApiKey => {
  const now = new Date()
  return apiKeySchema.parse({
    ...apiKey,
    lastUsedAt: now,
    updatedAt: now,
  })
}

/**
 * Revoke (soft delete) an API key.
 */
export const revoke = (apiKey: ApiKey): ApiKey => {
  const now = new Date()
  return apiKeySchema.parse({
    ...apiKey,
    deletedAt: now,
    updatedAt: now,
  })
}
