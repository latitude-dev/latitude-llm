import {
  type CacheInvalidator,
  type GenerateApiKeyInput,
  generateApiKeyUseCase,
  revokeApiKeyUseCase,
} from "@domain/api-keys"
import { ApiKeyId, OrganizationId, generateId } from "@domain/shared-kernel"
import { createRepositories } from "@platform/db-postgres"
import { Effect } from "effect"
import { type Context, Hono } from "hono"
import { getRedisClient } from "../clients.ts"
import { getDbDependencies } from "../db-deps.ts"
import { BadRequestError } from "../errors.ts"
import { extractParam } from "../lib/effect-utils.ts"
import type { ApiRedisClient } from "../lib/redis-client.ts"

/**
 * API Key routes
 *
 * - POST /organizations/:organizationId/api-keys - Generate API key
 * - GET /organizations/:organizationId/api-keys - List API keys
 * - DELETE /organizations/:organizationId/api-keys/:id - Revoke API key
 */

/**
 * Create a cache invalidator for API keys using Redis.
 * Cache invalidation failures are logged but don't fail the operation.
 */
interface ApiKeysRoutesOptions {
  readonly redisClient?: ApiRedisClient | undefined
}

const createApiKeyCacheInvalidator = (redis: ApiRedisClient): CacheInvalidator => {
  return {
    delete: (token: string) =>
      Effect.tryPromise({
        try: () => redis.del(`apikey:${token}`),
        catch: () => {
          // Silently ignore - DB is source of truth
        },
      }).pipe(Effect.orDie),
  }
}

export const createApiKeysRoutes = (options: ApiKeysRoutesOptions = {}) => {
  const cacheInvalidator = createApiKeyCacheInvalidator(options.redisClient ?? getRedisClient())
  const app = new Hono()
  const getRepos = (c: Context) => createRepositories(getDbDependencies(c).db)

  // POST /organizations/:organizationId/api-keys - Generate API key
  app.post("/", async (c) => {
    const repos = getRepos(c)
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

    const apiKey = await Effect.runPromise(generateApiKeyUseCase(repos.apiKey)(input))
    return c.json(apiKey, 201)
  })

  // GET /organizations/:organizationId/api-keys - List API keys
  app.get("/", async (c) => {
    const repos = getRepos(c)
    const organizationId = extractParam(c, "organizationId", OrganizationId)
    if (!organizationId) {
      throw new BadRequestError({ httpMessage: "Organization ID is required" })
    }

    const apiKeys = await Effect.runPromise(repos.apiKey.findByOrganizationId(organizationId))
    return c.json({ apiKeys }, 200)
  })

  // DELETE /organizations/:organizationId/api-keys/:id - Revoke API key
  app.delete("/:id", async (c) => {
    const repos = getRepos(c)
    const id = extractParam(c, "id", ApiKeyId)
    if (!id) {
      throw new BadRequestError({ httpMessage: "API Key ID is required" })
    }

    await Effect.runPromise(revokeApiKeyUseCase({ repository: repos.apiKey, cacheInvalidator })({ id }))
    return c.body(null, 204)
  })

  return app
}
