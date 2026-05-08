import { type ApiKeyId, apiKeyIdSchema, generateId, type OrganizationId, organizationIdSchema } from "@domain/shared"
import { z } from "zod"

/**
 * API Key entity - authenticates organization-bound requests.
 *
 * API keys are scoped to an organization and provide token-based
 * authentication for API access. New tokens are prefixed with `lak_` to let
 * the API auth middleware route to the API-key validator without a double
 * lookup. Tokens issued before the prefix rollout (plain UUIDs) are still
 * accepted via the legacy fallback path; no forced rotation.
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
 * Token prefix for newly issued API keys. The API auth middleware uses it to
 * dispatch directly to the API-key validator (vs. OAuth or legacy fallback)
 * without paying for a Redis miss + DB lookup against the wrong validator.
 *
 * `lak` (Latitude API Key) is intentionally three letters and avoids `lat_`,
 * which reads ambiguously as "Latitude" rather than the credential type.
 */
export const API_KEY_TOKEN_PREFIX = "lak_"

/**
 * Generate a new API key token. Format: `lak_<UUID v4>`.
 *
 * Legacy un-prefixed UUID tokens issued before this rollout still authenticate
 * — see `apps/api/src/middleware/auth.ts` for the legacy fallback dispatch.
 */
export const generateApiKeyToken = (): string => {
  return `${API_KEY_TOKEN_PREFIX}${crypto.randomUUID()}`
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
