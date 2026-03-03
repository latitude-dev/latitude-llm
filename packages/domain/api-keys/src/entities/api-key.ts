import { randomBytes } from "node:crypto"
import type { ApiKeyId, OrganizationId } from "@domain/shared-kernel"

const API_KEY_TOKEN_PREFIX = "lat_sk"

/**
 * API Key entity - authenticates organization-bound requests.
 *
 * API keys are scoped to an organization and provide token-based
 * authentication for API access. Tokens are random secrets.
 */
export interface ApiKey {
  readonly id: ApiKeyId
  readonly organizationId: OrganizationId
  readonly token: string
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
  id: ApiKeyId
  organizationId: OrganizationId
  token: string
  name: string
  lastUsedAt?: Date | null
  deletedAt?: Date | null
  createdAt?: Date
  updatedAt?: Date
}): ApiKey => {
  const now = new Date()
  return {
    id: params.id,
    organizationId: params.organizationId,
    token: params.token,
    name: params.name,
    lastUsedAt: params.lastUsedAt ?? null,
    deletedAt: params.deletedAt ?? null,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  }
}

/**
 * Generate a new API key token.
 */
export const generateApiKeyToken = (): string => {
  const secret = randomBytes(32).toString("base64url")
  return `${API_KEY_TOKEN_PREFIX}.${secret}`
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
