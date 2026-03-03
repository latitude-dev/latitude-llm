import {
  type CacheInvalidator,
  type GenerateApiKeyInput,
  generateApiKeyUseCase,
  revokeApiKeyUseCase,
} from "@domain/api-keys"
import { ApiKeyId, OrganizationId, generateId } from "@domain/shared-kernel"
import type { RedisClient } from "@platform/cache-redis"
import { createApiKeyPostgresRepository } from "@platform/db-postgres"
import { Effect } from "effect"
import { Hono } from "hono"
import { BadRequestError } from "../errors.ts"
import { extractParam } from "../lib/effect-utils.ts"

/**
 * API Key routes
 *
 * - POST /organizations/:organizationId/api-keys - Generate API key
 * - GET /organizations/:organizationId/api-keys - List API keys
 * - DELETE /organizations/:organizationId/api-keys/:id - Revoke API key
 */

/**
 * Create a cache invalidator for API keys using Redis.
 * Keys are cached by token hash, so invalidation uses the hash.
 */
const createApiKeyCacheInvalidator = (redis: RedisClient): CacheInvalidator => {
  return {
    delete: (tokenHash: string) =>
      Effect.tryPromise({
        try: () => redis.del(`apikey:${tokenHash}`),
        catch: () => {
          // Silently ignore - DB is source of truth
        },
      }).pipe(Effect.orDie),
  }
}

export const createApiKeysRoutes = () => {
  const app = new Hono()

  // POST /organizations/:organizationId/api-keys - Generate API key
  app.post("/", async (c) => {
    const apiKeyRepository = createApiKeyPostgresRepository(c.get("db"))
    const organizationId = extractParam(c, "organizationId", OrganizationId)
    if (!organizationId) {
      throw new BadRequestError({ httpMessage: "Organization ID is required" })
    }

    const body = (await c.req.json()) as {
      readonly name: string
    }

    const input: GenerateApiKeyInput = {
      id: ApiKeyId(generateId()),
      organizationId,
      name: body.name,
    }

    const apiKey = await Effect.runPromise(generateApiKeyUseCase(apiKeyRepository)(input))
    return c.json(apiKey, 201)
  })

  // GET /organizations/:organizationId/api-keys - List API keys
  app.get("/", async (c) => {
    const apiKeyRepository = createApiKeyPostgresRepository(c.get("db"))
    const organizationId = extractParam(c, "organizationId", OrganizationId)
    if (!organizationId) {
      throw new BadRequestError({ httpMessage: "Organization ID is required" })
    }

    const apiKeys = await Effect.runPromise(apiKeyRepository.findByOrganizationId(organizationId))
    return c.json({ apiKeys }, 200)
  })

  // DELETE /organizations/:organizationId/api-keys/:id - Revoke API key
  app.delete("/:id", async (c) => {
    const apiKeyRepository = createApiKeyPostgresRepository(c.get("db"))
    const cacheInvalidator = createApiKeyCacheInvalidator(c.get("redis"))
    const id = extractParam(c, "id", ApiKeyId)
    if (!id) {
      throw new BadRequestError({ httpMessage: "API Key ID is required" })
    }

    await Effect.runPromise(
      revokeApiKeyUseCase({ repository: apiKeyRepository, cacheInvalidator })({
        id,
      }),
    )
    return c.body(null, 204)
  })

  return app
}
