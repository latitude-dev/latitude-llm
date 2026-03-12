import {
  type ApiKey,
  ApiKeyCacheInvalidator,
  ApiKeyRepository,
  generateApiKeyUseCase,
  revokeApiKeyUseCase,
} from "@domain/api-keys"
import { ApiKeyId } from "@domain/shared"
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import type { RedisClient } from "@platform/cache-redis"
import { ApiKeyRepositoryLive, SqlClientLive } from "@platform/db-postgres"
import { Effect } from "effect"
import { ErrorSchema, OrgAndIdParamsSchema, OrgParamsSchema, PROTECTED_SECURITY } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const ApiKeySchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    name: z.string(),
    token: z
      .string()
      .openapi({ description: "The API key token. Only included in the creation response — store it securely." }),
    tokenHash: z.string(),
    lastUsedAt: z.string().nullable(),
    deletedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("ApiKey")

const ApiKeyListItemSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    name: z.string(),
    lastUsedAt: z.string().nullable(),
    deletedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("ApiKeyListItem")

const CreateApiKeyBodySchema = z
  .object({
    name: z.string().min(1).openapi({ description: "Human-readable name for the API key" }),
  })
  .openapi("CreateApiKeyBody")

const toApiKeyResponse = (apiKey: ApiKey) => ({
  id: apiKey.id as string,
  organizationId: apiKey.organizationId as string,
  name: apiKey.name,
  token: apiKey.token,
  tokenHash: apiKey.tokenHash,
  lastUsedAt: apiKey.lastUsedAt ? apiKey.lastUsedAt.toISOString() : null,
  deletedAt: apiKey.deletedAt ? apiKey.deletedAt.toISOString() : null,
  createdAt: apiKey.createdAt.toISOString(),
  updatedAt: apiKey.updatedAt.toISOString(),
})

const toApiKeyListItemResponse = (apiKey: ApiKey) => ({
  id: apiKey.id as string,
  organizationId: apiKey.organizationId as string,
  name: apiKey.name,
  lastUsedAt: apiKey.lastUsedAt ? apiKey.lastUsedAt.toISOString() : null,
  deletedAt: apiKey.deletedAt ? apiKey.deletedAt.toISOString() : null,
  createdAt: apiKey.createdAt.toISOString(),
  updatedAt: apiKey.updatedAt.toISOString(),
})

const generateApiKeyRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["API Keys"],
  summary: "Generate API key",
  description: "Generates a new API key for the organization. The token is only returned once — store it securely.",
  security: PROTECTED_SECURITY,
  request: {
    params: OrgParamsSchema,
    body: {
      content: { "application/json": { schema: CreateApiKeyBodySchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: ApiKeySchema } },
      description: "API key generated",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Validation error",
    },
    401: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Unauthorized",
    },
  },
})

const listApiKeysRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["API Keys"],
  summary: "List API keys",
  description: "Returns all API keys for the organization. Tokens are not included in the list response.",
  security: PROTECTED_SECURITY,
  request: {
    params: OrgParamsSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ apiKeys: z.array(ApiKeyListItemSchema) }).openapi("ApiKeyList"),
        },
      },
      description: "List of API keys",
    },
    401: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Unauthorized",
    },
  },
})

const revokeApiKeyRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["API Keys"],
  summary: "Revoke API key",
  description: "Soft-deletes an API key, immediately invalidating it.",
  security: PROTECTED_SECURITY,
  request: {
    params: OrgAndIdParamsSchema,
  },
  responses: {
    204: {
      description: "API key revoked",
    },
    401: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Unauthorized",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "API key not found",
    },
  },
})

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
  const app = new OpenAPIHono<OrganizationScopedEnv>({
    defaultHook(result, c) {
      if (!result.success) {
        const error = result.error.issues.map((i) => i.message).join(", ")
        return c.json({ error }, 400)
      }
    },
  })

  app.openapi(generateApiKeyRoute, async (c) => {
    const { name } = c.req.valid("json")

    const apiKey = await Effect.runPromise(
      generateApiKeyUseCase({ name }).pipe(
        Effect.provide(ApiKeyRepositoryLive),
        Effect.provide(SqlClientLive(c.var.postgresClient, c.var.organization.id)),
      ),
    )
    return c.json(toApiKeyResponse(apiKey), 201)
  })

  app.openapi(listApiKeysRoute, async (c) => {
    const apiKeys = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ApiKeyRepository
        return yield* repo.findAll()
      }).pipe(
        Effect.provide(ApiKeyRepositoryLive),
        Effect.provide(SqlClientLive(c.var.postgresClient, c.var.organization.id)),
      ),
    )
    return c.json({ apiKeys: apiKeys.map(toApiKeyListItemResponse) }, 200)
  })

  app.openapi(revokeApiKeyRoute, async (c) => {
    const { id: idParam } = c.req.valid("param")

    await Effect.runPromise(
      revokeApiKeyUseCase({ id: ApiKeyId(idParam) }).pipe(
        Effect.provide(ApiKeyRepositoryLive),
        Effect.provideService(ApiKeyCacheInvalidator, createApiKeyCacheInvalidator(c.var.redis)),
        Effect.provide(SqlClientLive(c.var.postgresClient, c.var.organization.id)),
      ),
    )
    return c.body(null, 204)
  })

  return app
}
