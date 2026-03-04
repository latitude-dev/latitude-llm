import {
  ApiKeyNotFoundError,
  type CacheInvalidator,
  type GenerateApiKeyInput,
  generateApiKeyUseCase,
  revokeApiKeyUseCase,
} from "@domain/api-keys"
import { ApiKeyId, BadRequestError, generateId } from "@domain/shared"
import type { RedisClient } from "@platform/cache-redis"
import { createApiKeyPostgresRepository, runCommand } from "@platform/db-postgres"
import { Effect } from "effect"
import { Hono } from "hono"
import type { OrganizationScopedEnv } from "../types.ts"
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
  const app = new Hono<OrganizationScopedEnv>()

  // POST /organizations/:organizationId/api-keys - Generate API key
  app.post("/", async (c) => {
    const organizationId = c.var.organization.id
    const body = (await c.req.json()) as {
      readonly name: string
    }

    const input: GenerateApiKeyInput = {
      id: ApiKeyId(generateId()),
      organizationId,
      name: body.name,
    }

    const apiKey = await runCommand(
      c.var.db,
      organizationId,
    )(async (txDb) => {
      const apiKeyRepository = createApiKeyPostgresRepository(txDb, organizationId)

      return Effect.runPromise(generateApiKeyUseCase(apiKeyRepository)(input))
    })
    return c.json(apiKey, 201)
  })

  // GET /organizations/:organizationId/api-keys - List API keys
  app.get("/", async (c) => {
    const organizationId = c.var.organization.id

    const apiKeys = await runCommand(
      c.var.db,
      organizationId,
    )(async (txDb) => {
      const apiKeyRepository = createApiKeyPostgresRepository(txDb, organizationId)
      return Effect.runPromise(apiKeyRepository.findAll())
    })
    return c.json({ apiKeys }, 200)
  })

  // DELETE /organizations/:organizationId/api-keys/:id - Revoke API key
  app.delete("/:id", async (c) => {
    const cacheInvalidator = createApiKeyCacheInvalidator(c.var.redis)
    const organizationId = c.var.organization.id
    const idParam = c.req.param("id")
    const id = idParam ? ApiKeyId(idParam) : null
    if (!id) {
      throw new BadRequestError({ httpMessage: "API Key ID is required" })
    }

    await runCommand(
      c.var.db,
      organizationId,
    )(async (txDb) => {
      const apiKeyRepository = createApiKeyPostgresRepository(txDb, organizationId)

      const apiKey = await Effect.runPromise(apiKeyRepository.findById(id))
      if (!apiKey || apiKey.organizationId !== organizationId) {
        throw new ApiKeyNotFoundError({ id })
      }

      return Effect.runPromise(
        revokeApiKeyUseCase({ repository: apiKeyRepository, cacheInvalidator })({
          id,
        }),
      )
    })
    return c.body(null, 204)
  })

  return app
}
