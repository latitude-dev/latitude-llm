import {
  API_KEY_TOKEN_PREFIX,
  applyApiKeyTokenPrefix,
  generateApiKeyToken,
  stripApiKeyTokenPrefix,
} from "@domain/api-keys"
import { generateId } from "@domain/shared"
import { OAUTH_ACCESS_TOKEN_PREFIX } from "@platform/db-postgres"
import { apiKeys } from "@platform/db-postgres/schema/api-keys"
import { oauthAccessTokens, oauthApplications } from "@platform/db-postgres/schema/better-auth"
import type { InMemoryPostgres } from "@platform/testkit"
import { encrypt, hash } from "@repo/utils"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import {
  type ApiTestContext,
  createTenantSetup,
  setupTestApi,
  TEST_ENCRYPTION_KEY,
} from "../test-utils/create-test-app.ts"

// Inserts a row with the raw (un-prefixed) token, mirroring how the production
// repository persists. Pass either the prefixed bearer or the raw form — this
// helper strips before hashing/encrypting so the on-disk shape matches
// production regardless.
const insertApiKey = async (database: InMemoryPostgres, organizationId: string, token: string) => {
  const rawToken = stripApiKeyTokenPrefix(token)
  const tokenHash = await Effect.runPromise(hash(rawToken))
  const encryptedToken = await Effect.runPromise(encrypt(rawToken, TEST_ENCRYPTION_KEY))
  const id = generateId()
  await database.db.insert(apiKeys).values({
    id,
    organizationId,
    token: encryptedToken,
    tokenHash,
    name: "test-key",
  })
  return { id }
}

// Mirrors the production write path: BA stores the raw access_token (no
// `loa_` prefix). The bearer the client receives is `loa_<rawToken>` thanks
// to the response rewriter on the web; the validator strips the prefix before
// the lookup, so the row only ever holds the raw value.
const insertOAuthApplicationAndToken = async (
  database: InMemoryPostgres,
  organizationId: string,
  userId: string,
  rawAccessToken: string,
) => {
  const clientId = `mcp-client-${generateId()}`
  await database.db.insert(oauthApplications).values({
    id: generateId(),
    clientId,
    name: "Test MCP Client",
    organizationId,
    userId,
    disabled: false,
  })
  await database.db.insert(oauthAccessTokens).values({
    id: generateId(),
    accessToken: rawAccessToken,
    clientId,
    userId,
    accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    scopes: "openid",
  })
  return { clientId }
}

describe("auth middleware dispatch", () => {
  setupTestApi()

  it<ApiTestContext>("authenticates a `lak_`-prefixed token via the API-key validator", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    // `generateApiKeyToken()` returns the raw value (UUID); the bearer carries
    // the prefix. Storage and validation operate on the raw value internally.
    const rawToken = generateApiKeyToken()
    const bearer = applyApiKeyTokenPrefix(rawToken)
    expect(bearer.startsWith(API_KEY_TOKEN_PREFIX)).toBe(true)
    await insertApiKey(database, tenant.organizationId, rawToken)

    const res = await app.fetch(
      new Request("http://localhost/v1/api-keys", {
        headers: { Authorization: `Bearer ${bearer}` },
      }),
    )
    expect(res.status).toBe(200)
  })

  it<ApiTestContext>("authenticates a legacy un-prefixed UUID token via the fallback path", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    // `tenant.apiKeyToken` is a plain UUID — pre-prefix-rollout shape.
    expect(tenant.apiKeyToken.startsWith(API_KEY_TOKEN_PREFIX)).toBe(false)

    const res = await app.fetch(
      new Request("http://localhost/v1/api-keys", {
        headers: { Authorization: `Bearer ${tenant.apiKeyToken}` },
      }),
    )
    expect(res.status).toBe(200)
  })

  it<ApiTestContext>("authenticates a `loa_`-prefixed token via the OAuth validator", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    // DB stores the raw value; the bearer carries the prefix.
    const rawToken = crypto.randomUUID()
    await insertOAuthApplicationAndToken(database, tenant.organizationId, tenant.userId, rawToken)

    const res = await app.fetch(
      new Request("http://localhost/v1/api-keys", {
        headers: { Authorization: `Bearer ${OAUTH_ACCESS_TOKEN_PREFIX}${rawToken}` },
      }),
    )
    expect(res.status).toBe(200)
  })

  it<ApiTestContext>("rejects an unknown `lak_` token without falling through to OAuth", async ({ app, database }) => {
    await createTenantSetup(database)
    const bogus = `${API_KEY_TOKEN_PREFIX}${crypto.randomUUID()}`

    const res = await app.fetch(
      new Request("http://localhost/v1/api-keys", {
        headers: { Authorization: `Bearer ${bogus}` },
      }),
    )
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("rejects an unknown `loa_` token without falling through to API key", async ({
    app,
    database,
  }) => {
    await createTenantSetup(database)
    const bogus = `loa_${crypto.randomUUID()}`

    const res = await app.fetch(
      new Request("http://localhost/v1/api-keys", {
        headers: { Authorization: `Bearer ${bogus}` },
      }),
    )
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("rejects an unknown un-prefixed token after both validators reject it", async ({
    app,
    database,
  }) => {
    await createTenantSetup(database)
    const bogus = crypto.randomUUID()

    const res = await app.fetch(
      new Request("http://localhost/v1/api-keys", {
        headers: { Authorization: `Bearer ${bogus}` },
      }),
    )
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("rejects requests with no Authorization header", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/v1/api-keys"))
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("rejects an OAuth token whose application has no organization binding", async ({
    app,
    database,
  }) => {
    // The MCP register flow creates an oauth_applications row with a NULL
    // organization_id — the bind happens later at consent. A token issued
    // before consent would have NULL on the joined row; the validator must
    // refuse it (the auth middleware can't pick a tenant context out of NULL).
    const tenant = await createTenantSetup(database)
    const rawToken = crypto.randomUUID()

    const clientId = `mcp-client-${generateId()}`
    await database.db.insert(oauthApplications).values({
      id: generateId(),
      clientId,
      name: "Unbound MCP Client",
      organizationId: null,
      userId: tenant.userId,
      disabled: false,
    })
    await database.db.insert(oauthAccessTokens).values({
      id: generateId(),
      accessToken: rawToken,
      clientId,
      userId: tenant.userId,
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scopes: "openid",
    })

    const res = await app.fetch(
      new Request("http://localhost/v1/api-keys", {
        headers: { Authorization: `Bearer ${OAUTH_ACCESS_TOKEN_PREFIX}${rawToken}` },
      }),
    )
    expect(res.status).toBe(401)
  })
})
