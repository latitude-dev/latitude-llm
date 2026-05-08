import { generateApiKeyToken } from "@domain/api-keys"
import { generateId } from "@domain/shared"
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

const insertApiKey = async (database: InMemoryPostgres, organizationId: string, token: string) => {
  const tokenHash = await Effect.runPromise(hash(token))
  const encryptedToken = await Effect.runPromise(encrypt(token, TEST_ENCRYPTION_KEY))
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

const insertOAuthApplicationAndToken = async (
  database: InMemoryPostgres,
  organizationId: string,
  userId: string,
  accessToken: string,
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
    accessToken,
    clientId,
    userId,
    accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    scopes: "openid",
  })
  return { clientId }
}

describe("auth middleware dispatch", () => {
  setupTestApi()

  it<ApiTestContext>("authenticates a valid API-key bearer", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const token = generateApiKeyToken()
    await insertApiKey(database, tenant.organizationId, token)

    const res = await app.fetch(
      new Request("http://localhost/v1/api-keys", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(200)
  })

  it<ApiTestContext>("authenticates a valid OAuth access-token bearer", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const token = crypto.randomUUID()
    await insertOAuthApplicationAndToken(database, tenant.organizationId, tenant.userId, token)

    const res = await app.fetch(
      new Request("http://localhost/v1/api-keys", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(200)
  })

  it<ApiTestContext>("rejects an unknown bearer (no API-key match, no OAuth match)", async ({ app, database }) => {
    await createTenantSetup(database)

    const res = await app.fetch(
      new Request("http://localhost/v1/api-keys", {
        headers: { Authorization: `Bearer ${crypto.randomUUID()}` },
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
    const token = crypto.randomUUID()

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
      accessToken: token,
      clientId,
      userId: tenant.userId,
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scopes: "openid",
    })

    const res = await app.fetch(
      new Request("http://localhost/v1/api-keys", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(401)
  })
})
