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
import { ApiKeyRepositoryLive, OutboxEventWriterLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import {
  errorResponse,
  IdParamsSchema,
  jsonBody,
  jsonResponse,
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

// Fern uses `x-fern-sdk-group-name` + `x-fern-sdk-method-name` to derive the
// SDK resource namespace (`client.apiKeys.*`) and method names
// (`.create` / `.list` / `.revoke`) independently of the OpenAPI `tag` and
// `operationId`. Without these explicit overrides:
//   - a multi-word tag like "API Keys" makes Fern fall back to concatenating
//     the operationId into method names (`apiKeysList` instead of `.list`);
//   - a single-word tag like "ApiKeys" forces Fern to lowercase the whole
//     resource path (`apikeys/` directory), which then breaks the case-
//     sensitive filesystem on CI (macOS APFS is case-insensitive and hides
//     the problem locally).
// Extending each route's config with the Fern vendor extensions sidesteps
// both tag-based heuristics entirely.
const apiKeysFernGroup = (methodName: string) =>
  ({
    "x-fern-sdk-group-name": "apiKeys",
    "x-fern-sdk-method-name": methodName,
  }) as const

const generateRoute = createRoute({
  method: "post",
  path: "/",
  operationId: "apiKeys.create",
  tags: ["API Keys"],
  ...apiKeysFernGroup("create"),
  summary: "Generate API key",
  description: "Generates a new API key for the organization. The token is only returned once — store it securely.",
  security: PROTECTED_SECURITY,
  request: {
    body: jsonBody(RequestSchema),
  },
  responses: openApiResponses({ status: 201, schema: ResponseSchema, description: "API key generated" }),
})

const listRoute = createRoute({
  method: "get",
  path: "/",
  operationId: "apiKeys.list",
  tags: ["API Keys"],
  ...apiKeysFernGroup("list"),
  summary: "List API keys",
  description: "Returns all API keys for the organization. Tokens are not included in the list response.",
  security: PROTECTED_SECURITY,
  responses: {
    200: jsonResponse(ListResponseSchema, "List of API keys"),
    401: errorResponse("Unauthorized"),
  },
})

const revokeRoute = createRoute({
  method: "delete",
  path: "/{id}",
  operationId: "apiKeys.revoke",
  tags: ["API Keys"],
  ...apiKeysFernGroup("revoke"),
  summary: "Revoke API key",
  description: "Soft-deletes an API key, immediately invalidating it.",
  security: PROTECTED_SECURITY,
  request: { params: IdParamsSchema },
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
        withPostgres(
          Layer.mergeAll(ApiKeyRepositoryLive, OutboxEventWriterLive),
          c.var.postgresClient,
          c.var.organization.id,
        ),
        withTracing,
      ),
    )
    return c.json(toResponse(apiKey), 201)
  })

  app.openapi(listRoute, async (c) => {
    const apiKeys = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ApiKeyRepository
        return yield* repo.list()
      }).pipe(withPostgres(ApiKeyRepositoryLive, c.var.postgresClient, c.var.organization.id), withTracing),
    )
    return c.json({ apiKeys: apiKeys.map(toListItemResponse) }, 200)
  })

  app.openapi(revokeRoute, async (c) => {
    const { id: idParam } = c.req.valid("param")

    await Effect.runPromise(
      revokeApiKeyUseCase({ id: ApiKeyId(idParam) }).pipe(
        Effect.provideService(ApiKeyCacheInvalidator, createApiKeyCacheInvalidator(c.var.redis)),
        withPostgres(ApiKeyRepositoryLive, c.var.postgresClient, c.var.organization.id),
        withTracing,
      ),
    )
    return c.body(null, 204)
  })

  return app
}
