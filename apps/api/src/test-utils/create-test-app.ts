import { generateId } from "@domain/shared"
import { postgresSchema } from "@platform/db-postgres"
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

  await database.db.insert(postgresSchema.user).values({
    id: userId,
    email: `${userId}@example.com`,
    name: "Test User",
    emailVerified: true,
    role: "user",
    banned: false,
  })

  await database.db.insert(postgresSchema.organization).values({
    id: organizationId,
    name: `Organization ${organizationId}`,
    slug: `org-${organizationId}`,
    creatorId: userId,
  })

  await database.db.insert(postgresSchema.member).values({
    id: memberId,
    organizationId,
    userId,
    role: "owner",
  })

  const encryptedToken = await Effect.runPromise(encrypt(apiKeyToken, TEST_ENCRYPTION_KEY))
  const tokenHash = await Effect.runPromise(hashToken(apiKeyToken))

  await database.db.insert(postgresSchema.apiKeys).values({
    id: authApiKeyId,
    organizationId,
    token: encryptedToken,
    tokenHash,
    name: "auth-key",
  })

  return { organizationId, apiKeyToken, authApiKeyId }
}
