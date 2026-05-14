import {
  getOAuthKeyUseCase,
  listOAuthKeysUseCase,
  type OAuthKey,
  OAuthKeyNotFoundError,
  revokeOAuthKeyUseCase,
} from "@domain/oauth-keys"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { OAuthKeyRepositoryLive, withPostgres } from "@platform/db-postgres"
import { OAuthTokenCacheInvalidatorLive } from "@platform/oauth-token-auth"
import { withTracing } from "@repo/observability"
import { Effect } from "effect"
import { defineApiEndpoint } from "../mcp/index.ts"
import { jsonResponse, openApiNoContentResponses, openApiResponses, PROTECTED_SECURITY } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

// OAuth keys are the `(client, user)` connections users grant to OAuth /
// MCP clients (Claude Code, Cursor, Codex…) via the consent flow at
// `app.latitude.so/auth/consent`. The API exposes read + revoke surfaces;
// creation is impossible by design (rows are minted by the consent UX).
//
// **Response contract**: never expose `access_token`, `refresh_token`,
// hashed-token, or any masked-token field. Only the metadata in
// `OAuthKey` is returned. Unlike API keys, there's no flow where the
// caller would copy a token from this surface.
const ResponseSchema = z
  .object({
    id: z.string().describe("Stable OAuth key identifier."),
    clientId: z.string().describe("Identifier of the OAuth client the key was issued to."),
    clientName: z.string().nullable().describe("Display name of the OAuth client."),
    clientIcon: z.string().nullable().describe("Icon URL of the OAuth client."),
    userId: z.string().describe("Identifier of the user the key belongs to."),
    userName: z.string().nullable().describe("Display name of the user. `null` until the user completes onboarding."),
    userEmail: z.string().describe("Email of the user."),
    lastActivityAt: z
      .string()
      .nullable()
      .describe("ISO-8601 timestamp of the last refresh on the key. `null` if the key has never been used."),
    connectedAt: z.string().describe("ISO-8601 timestamp at which the key was connected."),
    disabled: z.boolean().describe("Whether the key has been disabled."),
  })
  .openapi("OAuthKey")

const ListResponseSchema = z.object({ oauthKeys: z.array(ResponseSchema) }).openapi("OAuthKeyList")

const OAuthKeyParamsSchema = z.object({
  oauthKeyId: z.string().min(1).describe("OAuth key identifier."),
})

// Fern groups so the generated SDK lands at `client.oauthKeys.{list,get,revoke}`.
const oauthKeysFernGroup = (methodName: string) =>
  ({
    "x-fern-sdk-group-name": "oauthKeys",
    "x-fern-sdk-method-name": methodName,
  }) as const

const toResponse = (key: OAuthKey) => ({
  id: key.id,
  clientId: key.clientId,
  clientName: key.clientName,
  clientIcon: key.clientIcon,
  userId: key.userId,
  userName: key.userName,
  userEmail: key.userEmail,
  lastActivityAt: key.lastActivityAt ? key.lastActivityAt.toISOString() : null,
  connectedAt: key.connectedAt.toISOString(),
  disabled: key.disabled,
})

/**
 * Splits the composite id on the LAST colon. `userId` is a CUID2 (no
 * colons), so the tail is always the user id and the head — even if it
 * contains colons — is the OAuth client_id. Returns `null` for malformed
 * input so handlers can 404 cleanly.
 */
const parseCompositeId = (id: string): { clientId: string; userId: string } | null => {
  const i = id.lastIndexOf(":")
  if (i <= 0 || i === id.length - 1) return null
  return { clientId: id.slice(0, i), userId: id.slice(i + 1) }
}

export const oauthKeysPath = "/oauth-keys"

const oauthKeyEndpoint = defineApiEndpoint<OrganizationScopedEnv>(oauthKeysPath)

const listOAuthKeys = oauthKeyEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listOAuthKeys",
    tags: ["OAuth Keys"],
    ...oauthKeysFernGroup("list"),
    summary: "List OAuth keys",
    description: "Returns every OAuth key (like MCP clients) connected to the organization.",
    security: PROTECTED_SECURITY,
    responses: { 200: jsonResponse(ListResponseSchema, "List of OAuth keys") },
  }),
  handler: async (c) => {
    const keys = await Effect.runPromise(
      listOAuthKeysUseCase().pipe(
        withPostgres(OAuthKeyRepositoryLive, c.var.postgresClient, c.var.organization.id),
        withTracing,
      ),
    )
    return c.json({ oauthKeys: keys.map(toResponse) }, 200)
  },
})

const getOAuthKey = oauthKeyEndpoint({
  route: createRoute({
    method: "get",
    path: "/{oauthKeyId}",
    name: "getOAuthKey",
    tags: ["OAuth Keys"],
    ...oauthKeysFernGroup("get"),
    summary: "Get OAuth key",
    description: "Returns a single OAuth key (like MCP clients) by id.",
    security: PROTECTED_SECURITY,
    request: { params: OAuthKeyParamsSchema },
    responses: openApiResponses({ status: 200, schema: ResponseSchema, description: "OAuth key" }),
  }),
  handler: async (c) => {
    const { oauthKeyId } = c.req.valid("param")
    const parsed = parseCompositeId(oauthKeyId)
    if (!parsed) {
      throw new OAuthKeyNotFoundError({ clientId: oauthKeyId, userId: "" })
    }

    const key = await Effect.runPromise(
      getOAuthKeyUseCase(parsed).pipe(
        withPostgres(OAuthKeyRepositoryLive, c.var.postgresClient, c.var.organization.id),
        withTracing,
      ),
    )
    return c.json(toResponse(key), 200)
  },
})

const revokeOAuthKey = oauthKeyEndpoint({
  route: createRoute({
    method: "delete",
    path: "/{oauthKeyId}",
    name: "revokeOAuthKey",
    tags: ["OAuth Keys"],
    ...oauthKeysFernGroup("revoke"),
    summary: "Revoke OAuth key",
    description: "Revokes an OAuth key (like MCP clients). The connected client immediately loses access.",
    security: PROTECTED_SECURITY,
    request: { params: OAuthKeyParamsSchema },
    responses: openApiNoContentResponses({ description: "OAuth key revoked" }),
  }),
  handler: async (c) => {
    const { oauthKeyId } = c.req.valid("param")
    const parsed = parseCompositeId(oauthKeyId)
    if (!parsed) {
      throw new OAuthKeyNotFoundError({ clientId: oauthKeyId, userId: "" })
    }

    await Effect.runPromise(
      revokeOAuthKeyUseCase(parsed).pipe(
        Effect.provide(OAuthTokenCacheInvalidatorLive(c.var.redis)),
        withPostgres(OAuthKeyRepositoryLive, c.var.postgresClient, c.var.organization.id),
        withTracing,
      ),
    )
    return c.body(null, 204)
  },
})

export const createOAuthKeysRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()
  for (const ep of [listOAuthKeys, getOAuthKey, revokeOAuthKey]) ep.mountHttp(app)
  return app
}
