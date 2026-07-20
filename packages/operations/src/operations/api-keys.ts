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
import { createRoute, z } from "@hono/zod-openapi"
import { ApiKeyCacheInvalidatorLive } from "@platform/api-key-auth"
import { ApiKeyRepositoryLive, OutboxEventWriterLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineOperation } from "../core/define-operation.ts"
import type { OperationModule } from "../core/mount.ts"
import {
  errorResponse,
  jsonBody,
  jsonResponse,
  openApiNoContentResponses,
  PROTECTED_SECURITY,
  typedResponses,
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
      .describe(
        "Masked token preview safe to display in lists. Use `GET /api-keys/{apiKeyId}` to retrieve the full token.",
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
    updatedAt: z.string().describe("ISO-8601 timestamp of the last metadata update."),
  })
  .openapi("ApiKeyListItem")

const ListResponseSchema = z.object({ apiKeys: z.array(ListItemSchema) }).openapi("ApiKeyList")

const ApiKeyIdParamsSchema = z.object({
  apiKeyId: z.string().min(1).describe("API-key identifier."),
})

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

const apiKeysPath = "/api-keys"

const apiKeyEndpoint = defineOperation<OrganizationScopedEnv>(apiKeysPath)

const createApiKey = apiKeyEndpoint({
  route: createRoute({
    method: "post",
    path: "/",
    name: "createApiKey",
    tags: ["API Keys"],
    group: "apiKeys",
    sdkMethod: "create",
    summary: "Generate API key",
    description: "Generates a new API key for the organization. The token is only returned once — store it securely.",
    security: PROTECTED_SECURITY,
    request: {
      body: jsonBody(CreateApiKeyBody),
    },
    responses: typedResponses({ status: 201, schema: ResponseSchema, description: "API key generated" }),
  }),
  access: "write",
  rateLimitTier: "high",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const apiKey = yield* generateApiKeyUseCase({ name: input.body.name, isSandbox: false })
      return { status: 201, body: toResponse(apiKey) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ApiKeyRepositoryLive, OutboxEventWriterLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const listApiKeys = apiKeyEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listApiKeys",
    tags: ["API Keys"],
    group: "apiKeys",
    sdkMethod: "list",
    summary: "List API keys",
    description: "Returns all API keys for the organization. Tokens are not included in the list response.",
    security: PROTECTED_SECURITY,
    responses: {
      200: jsonResponse(ListResponseSchema, "List of API keys"),
      401: errorResponse("Unauthorized"),
    },
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (_input, ctx) =>
    Effect.gen(function* () {
      const repo = yield* ApiKeyRepository
      const apiKeys = yield* repo.list()
      return { status: 200, body: { apiKeys: apiKeys.map(toListItemResponse) } } as const
    }).pipe(withPostgres(ApiKeyRepositoryLive, ctx.postgresClient, ctx.organization.id), withTracing),
})

const getApiKey = apiKeyEndpoint({
  route: createRoute({
    method: "get",
    path: "/{apiKeyId}",
    name: "getApiKey",
    tags: ["API Keys"],
    group: "apiKeys",
    sdkMethod: "get",
    summary: "Get API key",
    description:
      "Returns a single API key including the full unmasked `token`. Useful for retrieving a stored token by id without rotating it.",
    security: PROTECTED_SECURITY,
    request: { params: ApiKeyIdParamsSchema },
    responses: typedResponses({ status: 200, schema: ResponseSchema, description: "API key" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { apiKeyId } = input.params
      const repo = yield* ApiKeyRepository
      const apiKey = yield* repo
        .findById(ApiKeyId(apiKeyId))
        .pipe(Effect.catchTag("NotFoundError", () => Effect.fail(new ApiKeyNotFoundError({ id: ApiKeyId(apiKeyId) }))))
      return { status: 200, body: toResponse(apiKey) } as const
    }).pipe(withPostgres(ApiKeyRepositoryLive, ctx.postgresClient, ctx.organization.id), withTracing),
})

const updateApiKey = apiKeyEndpoint({
  route: createRoute({
    method: "patch",
    path: "/{apiKeyId}",
    name: "updateApiKey",
    tags: ["API Keys"],
    group: "apiKeys",
    sdkMethod: "update",
    summary: "Update API key",
    description: "Renames an API key. The token itself is immutable — use create + revoke if you need a new value.",
    security: PROTECTED_SECURITY,
    request: { params: ApiKeyIdParamsSchema, body: jsonBody(UpdateApiKeyBody) },
    responses: typedResponses({ status: 200, schema: ResponseSchema, description: "API key updated" }),
  }),
  access: "destructive",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const apiKey = yield* updateApiKeyUseCase({ id: ApiKeyId(input.params.apiKeyId), name: input.body.name })
      return { status: 200, body: toResponse(apiKey) } as const
    }).pipe(withPostgres(ApiKeyRepositoryLive, ctx.postgresClient, ctx.organization.id), withTracing),
})

const revokeApiKey = apiKeyEndpoint({
  route: createRoute({
    method: "delete",
    path: "/{apiKeyId}",
    name: "revokeApiKey",
    tags: ["API Keys"],
    group: "apiKeys",
    sdkMethod: "revoke",
    summary: "Revoke API key",
    description: "Revokes an API key.",
    security: PROTECTED_SECURITY,
    request: { params: ApiKeyIdParamsSchema },
    responses: openApiNoContentResponses({ description: "API key revoked" }),
  }),
  access: "destructive",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    revokeApiKeyUseCase({ id: ApiKeyId(input.params.apiKeyId) }).pipe(
      Effect.provide(ApiKeyCacheInvalidatorLive(ctx.redis)),
      withPostgres(ApiKeyRepositoryLive, ctx.postgresClient, ctx.organization.id),
      withTracing,
      Effect.as({ status: 204 } as const),
    ),
})

export const apiKeysModule: OperationModule = {
  path: apiKeysPath,
  operations: [createApiKey, listApiKeys, getApiKey, updateApiKey, revokeApiKey],
}
