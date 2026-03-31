import {
  type ApiKey,
  ApiKeyCacheInvalidator,
  ApiKeyRepository,
  generateApiKeyUseCase,
  revokeApiKeyUseCase,
} from "@domain/api-keys"
import { ApiKeyId } from "@domain/shared"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { RedisClient } from "@platform/cache-redis"
import { ApiKeyRepositoryLive, withPostgres } from "@platform/db-postgres"
import { Effect } from "effect"
import {
  errorResponse,
  jsonBody,
  jsonResponse,
  OrgAndIdParamsSchema,
  OrgParamsSchema,
  openApiNoContentResponses,
  openApiResponses,
  PROTECTED_SECURITY,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const ResponseSchema = z
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

const ListItemSchema = z
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

const ListResponseSchema = z.object({ apiKeys: z.array(ListItemSchema) }).openapi("ApiKeyList")

const RequestSchema = z
  .object({
    name: z.string().min(1).openapi({ description: "Human-readable name for the API key" }),
  })
  .openapi("CreateApiKeyBody")

const toResponse = (apiKey: ApiKey) => ({
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

const toListItemResponse = (apiKey: ApiKey) => ({
  id: apiKey.id as string,
  organizationId: apiKey.organizationId as string,
  name: apiKey.name,
  lastUsedAt: apiKey.lastUsedAt ? apiKey.lastUsedAt.toISOString() : null,
  deletedAt: apiKey.deletedAt ? apiKey.deletedAt.toISOString() : null,
  createdAt: apiKey.createdAt.toISOString(),
  updatedAt: apiKey.updatedAt.toISOString(),
})

const generateRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["API Keys"],
  summary: "Generate API key",
  description: "Generates a new API key for the organization. The token is only returned once — store it securely.",
  security: PROTECTED_SECURITY,
  request: {
    params: OrgParamsSchema,
    body: jsonBody(RequestSchema),
  },
  responses: openApiResponses({ status: 201, schema: ResponseSchema, description: "API key generated" }),
})

const listRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["API Keys"],
  summary: "List API keys",
  description: "Returns all API keys for the organization. Tokens are not included in the list response.",
  security: PROTECTED_SECURITY,
  request: { params: OrgParamsSchema },
  responses: {
    200: jsonResponse(ListResponseSchema, "List of API keys"),
    401: errorResponse("Unauthorized"),
  },
})

const revokeRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["API Keys"],
  summary: "Revoke API key",
  description: "Soft-deletes an API key, immediately invalidating it.",
  security: PROTECTED_SECURITY,
  request: { params: OrgAndIdParamsSchema },
  responses: openApiNoContentResponses({ description: "API key revoked" }),
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
  const app = new OpenAPIHono<OrganizationScopedEnv>()

  app.openapi(generateRoute, async (c) => {
    const { name } = c.req.valid("json")

    const apiKey = await Effect.runPromise(
      generateApiKeyUseCase({ name }).pipe(
        withPostgres(ApiKeyRepositoryLive, c.var.postgresClient, c.var.organization.id),
      ),
    )
    return c.json(toResponse(apiKey), 201)
  })

  app.openapi(listRoute, async (c) => {
    const apiKeys = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ApiKeyRepository
        return yield* repo.findAll()
      }).pipe(withPostgres(ApiKeyRepositoryLive, c.var.postgresClient, c.var.organization.id)),
    )
    return c.json({ apiKeys: apiKeys.map(toListItemResponse) }, 200)
  })

  app.openapi(revokeRoute, async (c) => {
    const { id: idParam } = c.req.valid("param")

    await Effect.runPromise(
      revokeApiKeyUseCase({ id: ApiKeyId(idParam) }).pipe(
        Effect.provideService(ApiKeyCacheInvalidator, createApiKeyCacheInvalidator(c.var.redis)),
        withPostgres(ApiKeyRepositoryLive, c.var.postgresClient, c.var.organization.id),
      ),
    )
    return c.body(null, 204)
  })

  return app
}
