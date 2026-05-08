import { type ApiKeyId, apiKeyIdSchema, generateId, type OrganizationId, organizationIdSchema } from "@domain/shared"
import { z } from "zod"

/**
 * API Key entity - authenticates organization-bound requests.
 *
 * API keys are scoped to an organization and provide token-based
 * authentication for API access. The persisted token is a raw UUID v4; the
 * `lak_` prefix is a presentation concern added by the repository when
 * surfacing the token to callers (one-time creation response, "show full
 * token" detail page) and stripped by the auth middleware on incoming bearer
 * values before the hash lookup.
 *
 * Keeping the DB un-prefixed means existing tokens (from before the prefix
 * rolled out) authenticate without migration: the validator strip is a no-op
 * for un-prefixed tokens and the hash matches the historical row.
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
 * Token prefix used when surfacing an API key to its caller. The API auth
 * middleware uses the prefix to dispatch directly to the API-key validator
 * (vs. OAuth or legacy fallback) without paying for a Redis miss + DB lookup
 * against the wrong validator. The persisted value is the raw token without
 * the prefix — see {@link applyApiKeyTokenPrefix} / {@link stripApiKeyTokenPrefix}.
 *
 * `lak` (Latitude API Key) is intentionally three letters and avoids `lat_`,
 * which reads ambiguously as "Latitude" rather than the credential type.
 */
export const API_KEY_TOKEN_PREFIX = "lak_"

/**
 * Generate a new raw API key token (UUID v4). The repository prefixes it with
 * `lak_` when constructing the entity returned to callers; the DB row holds
 * the un-prefixed UUID and the SHA-256 hash of the un-prefixed UUID.
 */
export const generateApiKeyToken = (): string => {
  return crypto.randomUUID()
}

/**
 * Add the `lak_` prefix to a raw API key token. Idempotent — already-prefixed
 * input is returned unchanged so callers don't have to track which side of
 * the boundary they're on.
 */
export const applyApiKeyTokenPrefix = (rawToken: string): string =>
  rawToken.startsWith(API_KEY_TOKEN_PREFIX) ? rawToken : `${API_KEY_TOKEN_PREFIX}${rawToken}`

/**
 * Strip the `lak_` prefix to recover the raw token used for hashing /
 * encryption. Pass-through for un-prefixed input so legacy tokens (issued
 * before the prefix rolled out) hash to the same value they always did.
 */
export const stripApiKeyTokenPrefix = (token: string): string =>
  token.startsWith(API_KEY_TOKEN_PREFIX) ? token.slice(API_KEY_TOKEN_PREFIX.length) : token

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
