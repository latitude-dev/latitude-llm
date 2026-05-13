import {
  type ApiKey,
  ApiKeyNotFoundError,
  ApiKeyRepository,
  generateApiKeyUseCase,
  maskApiKeyToken,
  revokeApiKeyUseCase,
  updateApiKeyUseCase,
} from "@domain/api-keys"
import { ApiKeyId } from "@domain/shared"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { ApiKeyCacheInvalidatorLive } from "@platform/api-key-auth"
import { ApiKeyRepositoryLive, OutboxEventWriterLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineApiEndpoint } from "../mcp/index.ts"
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
    id: z.string().describe("Stable API-key identifier."),
    organizationId: z.string().describe("Organization that owns this API key."),
    name: z.string().describe("Human-readable name."),
    token: z
      .string()
      .describe(
        "The full API key token. Returned by create / get / update — store it securely; treat it as a password.",
      ),
    lastUsedAt: z
      .string()
      .nullable()
      .describe("ISO-8601 timestamp of the most recent successful authentication. `null` until first use."),
    deletedAt: z
      .string()
      .nullable()
      .describe("ISO-8601 timestamp at which the key was revoked. `null` while the key is active."),
    createdAt: z.string().describe("ISO-8601 timestamp of creation."),
    updatedAt: z.string().describe("ISO-8601 timestamp of the last metadata update (rename, revoke, last-used touch)."),
  })
  .openapi("ApiKey")

const ListItemSchema = z
  .object({
    id: z.string().describe("Stable API-key identifier."),
    organizationId: z.string().describe("Organization that owns this API key."),
    name: z.string().describe("Human-readable name."),
    token: z
      .string()
      .describe("Masked token preview safe to display in lists. Use `GET /api-keys/{id}` to retrieve the full token."),
    lastUsedAt: z
      .string()
      .nullable()
      .describe("ISO-8601 timestamp of the most recent successful authentication. `null` until first use."),
    deletedAt: z
      .string()
      .nullable()
      .describe("ISO-8601 timestamp at which the key was revoked. `null` while the key is active."),
    createdAt: z.string().describe("ISO-8601 timestamp of creation."),
    updatedAt: z.string().describe("ISO-8601 timestamp of the last metadata update."),
  })
  .openapi("ApiKeyListItem")

const ListResponseSchema = z.object({ apiKeys: z.array(ListItemSchema) }).openapi("ApiKeyList")

const CreateApiKeyBody = z
  .object({
    name: z.string().min(1).describe("Human-readable name for the API key. Used to distinguish keys in the UI."),
  })
  .openapi("CreateApiKeyBody")

const UpdateApiKeyBody = z
  .object({
    name: z.string().min(1).describe("New human-readable name for the API key."),
  })
  .openapi("UpdateApiKeyBody")

const toResponse = (apiKey: ApiKey) => ({
  id: apiKey.id as string,
  organizationId: apiKey.organizationId as string,
  name: apiKey.name,
  token: apiKey.token,
  lastUsedAt: apiKey.lastUsedAt ? apiKey.lastUsedAt.toISOString() : null,
  deletedAt: apiKey.deletedAt ? apiKey.deletedAt.toISOString() : null,
  createdAt: apiKey.createdAt.toISOString(),
  updatedAt: apiKey.updatedAt.toISOString(),
})

const toListItemResponse = (apiKey: ApiKey) => ({
  id: apiKey.id as string,
  organizationId: apiKey.organizationId as string,
  name: apiKey.name,
  token: maskApiKeyToken(apiKey.token),
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

export const apiKeysPath = "/api-keys"

const apiKeyEndpoint = defineApiEndpoint<OrganizationScopedEnv>(apiKeysPath)

const createApiKey = apiKeyEndpoint({
  route: createRoute({
    method: "post",
    path: "/",
    name: "createApiKey",
    tags: ["API Keys"],
    ...apiKeysFernGroup("create"),
    summary: "Generate API key",
    description: "Generates a new API key for the organization. The token is only returned once — store it securely.",
    security: PROTECTED_SECURITY,
    request: {
      body: jsonBody(CreateApiKeyBody),
    },
    responses: openApiResponses({ status: 201, schema: ResponseSchema, description: "API key generated" }),
  }),
  handler: async (c) => {
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
  },
})

const listApiKeys = apiKeyEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listApiKeys",
    tags: ["API Keys"],
    ...apiKeysFernGroup("list"),
    summary: "List API keys",
    description: "Returns all API keys for the organization. Tokens are not included in the list response.",
    security: PROTECTED_SECURITY,
    responses: {
      200: jsonResponse(ListResponseSchema, "List of API keys"),
      401: errorResponse("Unauthorized"),
    },
  }),
  handler: async (c) => {
    const apiKeys = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ApiKeyRepository
        return yield* repo.list()
      }).pipe(withPostgres(ApiKeyRepositoryLive, c.var.postgresClient, c.var.organization.id), withTracing),
    )
    return c.json({ apiKeys: apiKeys.map(toListItemResponse) }, 200)
  },
})

const getApiKey = apiKeyEndpoint({
  route: createRoute({
    method: "get",
    path: "/{id}",
    name: "getApiKey",
    tags: ["API Keys"],
    ...apiKeysFernGroup("get"),
    summary: "Get API key",
    description:
      "Returns a single API key including the full unmasked `token`. Useful for retrieving a stored token by id without rotating it.",
    security: PROTECTED_SECURITY,
    request: { params: IdParamsSchema },
    responses: openApiResponses({ status: 200, schema: ResponseSchema, description: "API key" }),
  }),
  handler: async (c) => {
    const { id: idParam } = c.req.valid("param")

    const apiKey = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ApiKeyRepository
        return yield* repo
          .findById(ApiKeyId(idParam))
          .pipe(Effect.catchTag("NotFoundError", () => Effect.fail(new ApiKeyNotFoundError({ id: ApiKeyId(idParam) }))))
      }).pipe(withPostgres(ApiKeyRepositoryLive, c.var.postgresClient, c.var.organization.id), withTracing),
    )
    return c.json(toResponse(apiKey), 200)
  },
})

const updateApiKey = apiKeyEndpoint({
  route: createRoute({
    method: "patch",
    path: "/{id}",
    name: "updateApiKey",
    tags: ["API Keys"],
    ...apiKeysFernGroup("update"),
    summary: "Update API key",
    description: "Renames an API key. The token itself is immutable — use create + revoke if you need a new value.",
    security: PROTECTED_SECURITY,
    request: { params: IdParamsSchema, body: jsonBody(UpdateApiKeyBody) },
    responses: openApiResponses({ status: 200, schema: ResponseSchema, description: "API key updated" }),
  }),
  handler: async (c) => {
    const { id: idParam } = c.req.valid("param")
    const { name } = c.req.valid("json")

    const apiKey = await Effect.runPromise(
      updateApiKeyUseCase({ id: ApiKeyId(idParam), name }).pipe(
        withPostgres(ApiKeyRepositoryLive, c.var.postgresClient, c.var.organization.id),
        withTracing,
      ),
    )
    return c.json(toResponse(apiKey), 200)
  },
})

const revokeApiKey = apiKeyEndpoint({
  route: createRoute({
    method: "delete",
    path: "/{id}",
    name: "revokeApiKey",
    tags: ["API Keys"],
    ...apiKeysFernGroup("revoke"),
    summary: "Revoke API key",
    description: "Revokes an API key.",
    security: PROTECTED_SECURITY,
    request: { params: IdParamsSchema },
    responses: openApiNoContentResponses({ description: "API key revoked" }),
  }),
  handler: async (c) => {
    const { id: idParam } = c.req.valid("param")

    await Effect.runPromise(
      revokeApiKeyUseCase({ id: ApiKeyId(idParam) }).pipe(
        Effect.provide(ApiKeyCacheInvalidatorLive(c.var.redis)),
        withPostgres(ApiKeyRepositoryLive, c.var.postgresClient, c.var.organization.id),
        withTracing,
      ),
    )
    return c.body(null, 204)
  },
})

export const createApiKeysRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()
  for (const ep of [createApiKey, listApiKeys, getApiKey, updateApiKey, revokeApiKey]) ep.mountHttp(app)
  return app
}
