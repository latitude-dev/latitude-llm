import {
  ApiKeyCacheInvalidator,
  ApiKeyRepository,
  type GenerateApiKeyInput,
  generateApiKeyUseCase,
  revokeApiKeyUseCase,
} from "@domain/api-keys"
import { ApiKeyId } from "@domain/shared"
import type { RedisClient } from "@platform/cache-redis"
import { createApiKeyPostgresRepository, runCommand } from "@platform/db-postgres"
import { BadRequestError } from "@repo/utils"
import { Effect } from "effect"
import { Hono } from "hono"
import type { OrganizationScopedEnv } from "../types.ts"

const createApiKeyCacheInvalidator = (redis: RedisClient) => ({
  delete: (tokenHash: string) =>
    Effect.tryPromise({
      try: () => redis.del(`apikey:${tokenHash}`),
      catch: () => {
        // Silently ignore - DB is source of truth
      },
    }).pipe(Effect.orDie),
})

export const createApiKeysRoutes = () => {
  const app = new Hono<OrganizationScopedEnv>()

  const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === "object" && value !== null
  }

  // POST /organizations/:organizationId/api-keys - Generate API key
  app.post("/", async (c) => {
    const organizationId = c.var.organization.id
    const body = await c.req.json()

    if (!isObjectRecord(body)) {
      throw new BadRequestError({ httpMessage: "Invalid request body" })
    }

    if (typeof body.name !== "string") {
      throw new BadRequestError({ httpMessage: "Name is required", field: "name" })
    }

    const input: GenerateApiKeyInput = {
      organizationId,
      name: body.name,
    }

    const apiKey = await runCommand(
      c.var.db,
      organizationId,
    )(async (txDb) =>
      Effect.runPromise(
        generateApiKeyUseCase(input).pipe(
          Effect.provideService(ApiKeyRepository, createApiKeyPostgresRepository(txDb)),
        ),
      ),
    )
    return c.json(apiKey, 201)
  })

  // GET /organizations/:organizationId/api-keys - List API keys
  app.get("/", async (c) => {
    const organizationId = c.var.organization.id

    const apiKeys = await runCommand(
      c.var.db,
      organizationId,
    )(async (txDb) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* ApiKeyRepository
          return yield* repo.findAll()
        }).pipe(Effect.provideService(ApiKeyRepository, createApiKeyPostgresRepository(txDb))),
      ),
    )
    return c.json({ apiKeys }, 200)
  })

  // DELETE /organizations/:organizationId/api-keys/:id - Revoke API key
  app.delete("/:id", async (c) => {
    const organizationId = c.var.organization.id
    const idParam = c.req.param("id")
    const id = idParam ? ApiKeyId(idParam) : null
    if (!id) {
      throw new BadRequestError({ httpMessage: "API Key ID is required" })
    }

    await runCommand(
      c.var.db,
      organizationId,
    )(async (txDb) =>
      Effect.runPromise(
        revokeApiKeyUseCase({ id }).pipe(
          Effect.provideService(ApiKeyRepository, createApiKeyPostgresRepository(txDb)),
          Effect.provideService(ApiKeyCacheInvalidator, createApiKeyCacheInvalidator(c.var.redis)),
        ),
      ),
    )
    return c.body(null, 204)
  })

  return app
}
