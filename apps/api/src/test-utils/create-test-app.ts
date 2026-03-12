import { generateId } from "@domain/shared"
import { encrypt, hashToken } from "@repo/utils"
import { Effect } from "effect"
import { Hono } from "hono"
import { getRedisClient } from "../clients.ts"
import { createAuthMiddleware } from "../middleware/auth.ts"
import { honoErrorHandler } from "../middleware/error-handler.ts"
import { createOrganizationContextMiddleware } from "../middleware/organization-context.ts"
import type { OrganizationScopedEnv } from "../types.ts"
import type { InMemoryPostgres } from "./in-memory-postgres.ts"
import { createRlsMiddleware } from "./in-memory-postgres.ts"

export const TEST_ENCRYPTION_KEY_HEX = "75d697b90c1e46c13bd7f7343ab2b9a9e430cdcda05d47f055e1523d54d5409b"
export const TEST_ENCRYPTION_KEY = Buffer.from(TEST_ENCRYPTION_KEY_HEX, "hex")

/**
 * Create a protected Hono sub-app wired with the in-memory PGlite database,
 * auth middleware (using the same db as admin), and RLS enforcement.
 * Callers mount their own route handlers on the returned sub-app.
 */
export const createProtectedApp = (database: InMemoryPostgres) => {
  const app = new Hono()
  app.onError(honoErrorHandler)

  const protectedRoutes = new Hono<OrganizationScopedEnv>()

  protectedRoutes.use("*", async (c, next) => {
    c.set("db", database.postgresDb)
    c.set("postgresClient", database.postgresClient)
    c.set("redis", getRedisClient())
    await next()
  })

  protectedRoutes.use("*", createAuthMiddleware({ adminClient: database.postgresClient }))
  protectedRoutes.use("*", createRlsMiddleware(database.client))
  protectedRoutes.use("/:organizationId/*", createOrganizationContextMiddleware())

  return { app, protectedRoutes }
}

interface TenantSetup {
  readonly organizationId: string
  readonly apiKeyToken: string
  readonly authApiKeyId: string
}

export const createTenantSetup = async (database: InMemoryPostgres): Promise<TenantSetup> => {
  const userId = generateId()
  const organizationId = generateId()
  const apiKeyToken = crypto.randomUUID()
  const authApiKeyId = generateId()
  const memberId = generateId()

  // Insert user using parameterized query
  await database.client.query(
    "INSERT INTO latitude.user (id, email, name, email_verified, role, banned, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())",
    [userId, `${userId}@example.com`, "Test User", true, "user", false],
  )

  // Insert organization using parameterized query
  await database.client.query(
    "INSERT INTO latitude.organization (id, name, slug, creator_id, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())",
    [organizationId, `Organization ${organizationId}`, `org-${organizationId}`, userId],
  )

  // Insert member using parameterized query
  await database.client.query(
    "INSERT INTO latitude.member (id, organization_id, user_id, role, created_at) VALUES ($1, $2, $3, $4, NOW())",
    [memberId, organizationId, userId, "owner"],
  )

  // Insert API key using parameterized query
  const encryptedToken = await Effect.runPromise(encrypt(apiKeyToken, TEST_ENCRYPTION_KEY))
  const tokenHash = await Effect.runPromise(hashToken(apiKeyToken))
  await database.client.query(
    "INSERT INTO latitude.api_keys (id, organization_id, token, token_hash, name, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())",
    [authApiKeyId, organizationId, encryptedToken, tokenHash, "auth-key"],
  )

  return { organizationId, apiKeyToken, authApiKeyId }
}
