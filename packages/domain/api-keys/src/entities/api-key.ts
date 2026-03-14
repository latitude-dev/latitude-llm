import { ApiKeyId, generateId, type OrganizationId } from "@domain/shared"

/**
 * API Key entity - authenticates organization-bound requests.
 *
 * API keys are scoped to an organization and provide token-based
 * authentication for API access. Tokens are UUIDs generated
 * using crypto.randomUUID().
 *
 * The token is encrypted at the application level (AES-256-GCM)
 * and a SHA-256 hash (tokenHash) is stored for indexed lookups
 * without decryption.
 */
export interface ApiKey {
  readonly id: ApiKeyId
  readonly organizationId: OrganizationId
  readonly token: string
  readonly tokenHash: string
  readonly name: string
  readonly lastUsedAt: Date | null
  readonly deletedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

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
  return {
    id: params.id ?? ApiKeyId(generateId()),
    organizationId: params.organizationId,
    token: params.token,
    tokenHash: params.tokenHash,
    name: params.name,
    lastUsedAt: params.lastUsedAt ?? null,
    deletedAt: params.deletedAt ?? null,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  }
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
  return {
    ...apiKey,
    lastUsedAt: new Date(),
    updatedAt: new Date(),
  }
}

/**
 * Revoke (soft delete) an API key.
 */
export const revoke = (apiKey: ApiKey): ApiKey => {
  return {
    ...apiKey,
    deletedAt: new Date(),
    updatedAt: new Date(),
  }
}
