import { generateId } from "@domain/shared"
import type { RedisClient } from "@platform/cache-redis"
import type { PostgresDb } from "@platform/db-postgres"
import { oauthAccessTokens, oauthApplications } from "@platform/db-postgres/schema/better-auth"
import {
  closeInMemoryPostgres,
  createInMemoryPostgres,
  createOrganizationFixture,
  createUserFixture,
  type InMemoryPostgres,
} from "@platform/testkit"
import { Effect } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { validateOAuthAccessToken } from "./validate-oauth-token.ts"

/**
 * `@repo/utils` crypto helpers require Node 25+ `Uint8Array` hex APIs (mirrors
 * the same skip in `@platform/api-key-auth`'s tests). When the host Node is
 * older the integration block is skipped; the `exports the validator` smoke
 * test still runs everywhere.
 */
const nodeSupportsUint8Hex = typeof Uint8Array.fromHex === "function"

const createFakeRedis = (): RedisClient => {
  const store = new Map<string, string>()
  return {
    get: async (key: string) => store.get(key) ?? null,
    setex: async (key: string, _ttl: number, value: string) => {
      store.set(key, value)
      return "OK"
    },
    del: async (key: string) => {
      store.delete(key)
      return 1
    },
  } as unknown as RedisClient
}

interface OAuthSetup {
  readonly accessToken: string
  readonly tokenRowId: string
  readonly clientId: string
  readonly userId: string
  readonly organizationId: string
}

interface InsertOAuthSetupOptions {
  readonly organizationId: string | null
  readonly disabled?: boolean
  /** Default: 5 minutes from now. */
  readonly accessTokenExpiresAt?: Date
  readonly scopes?: string
}

/**
 * Insert one `oauth_applications` + one `oauth_access_tokens` row pointing at
 * a fresh user. Lets each test set the disabled flag, expiry, and bound org
 * independently so we can hit each rejection branch.
 */
const insertOAuthSetup = async (db: PostgresDb, options: InsertOAuthSetupOptions): Promise<OAuthSetup> => {
  const userFixture = await Effect.runPromise(createUserFixture(db))
  const userId = userFixture.id
  const clientId = `client-${generateId()}`
  const accessToken = `loa_${generateId()}_${generateId()}`
  const refreshToken = `lor_${generateId()}_${generateId()}`
  const tokenRowId = generateId()

  await db.insert(oauthApplications).values({
    id: generateId(),
    name: "Test MCP Client",
    icon: null,
    metadata: null,
    clientId,
    clientSecret: "secret",
    redirectUrls: "http://localhost/cb",
    type: "public",
    disabled: options.disabled ?? false,
    userId,
    organizationId: options.organizationId,
  })

  const expiresAt = options.accessTokenExpiresAt ?? new Date(Date.now() + 5 * 60_000)
  await db.insert(oauthAccessTokens).values({
    id: tokenRowId,
    accessToken,
    refreshToken,
    accessTokenExpiresAt: expiresAt,
    refreshTokenExpiresAt: new Date(expiresAt.getTime() + 60 * 60_000),
    clientId,
    userId,
    scopes: options.scopes ?? "openid profile",
  })

  return {
    accessToken,
    tokenRowId,
    clientId,
    userId,
    organizationId: options.organizationId ?? "",
  }
}

describe("validateOAuthAccessToken", () => {
  it("exports the validator", () => {
    expect(typeof validateOAuthAccessToken).toBe("function")
  })
})

describe.skipIf(!nodeSupportsUint8Hex)("validateOAuthAccessToken (integration, Node 25+)", () => {
  let database: InMemoryPostgres

  beforeAll(async () => {
    database = await createInMemoryPostgres()
  })

  afterAll(async () => {
    await closeInMemoryPostgres(database)
  })

  it("returns the resolved auth result for a valid token bound to an org", async () => {
    const organization = await Effect.runPromise(createOrganizationFixture(database.postgresDb))
    const setup = await insertOAuthSetup(database.postgresDb, {
      organizationId: organization.id,
    })

    const redis = createFakeRedis()
    const touched: string[] = []

    const result = await Effect.runPromise(
      validateOAuthAccessToken(setup.accessToken, {
        redis,
        adminClient: database.adminPostgresClient,
        onTokenValidated: (id) => touched.push(id),
      }),
    )

    expect(result).not.toBeNull()
    expect(result?.userId).toBe(setup.userId)
    expect(result?.organizationId).toBe(organization.id)
    expect(result?.oauthClientId).toBe(setup.clientId)
    expect(result?.scopes).toEqual(["openid", "profile"])
    expect(touched).toEqual([setup.tokenRowId])
  })

  it("returns null for an unknown token", async () => {
    const redis = createFakeRedis()

    const result = await Effect.runPromise(
      validateOAuthAccessToken("loa_unknown_token", {
        redis,
        adminClient: database.adminPostgresClient,
      }),
    )

    expect(result).toBeNull()
  })

  it("returns null for an expired token", async () => {
    const organization = await Effect.runPromise(createOrganizationFixture(database.postgresDb))
    const setup = await insertOAuthSetup(database.postgresDb, {
      organizationId: organization.id,
      accessTokenExpiresAt: new Date(Date.now() - 60_000),
    })

    const redis = createFakeRedis()

    const result = await Effect.runPromise(
      validateOAuthAccessToken(setup.accessToken, {
        redis,
        adminClient: database.adminPostgresClient,
      }),
    )

    expect(result).toBeNull()
  })

  it("returns null when the application is disabled", async () => {
    const organization = await Effect.runPromise(createOrganizationFixture(database.postgresDb))
    const setup = await insertOAuthSetup(database.postgresDb, {
      organizationId: organization.id,
      disabled: true,
    })

    const redis = createFakeRedis()

    const result = await Effect.runPromise(
      validateOAuthAccessToken(setup.accessToken, {
        redis,
        adminClient: database.adminPostgresClient,
      }),
    )

    expect(result).toBeNull()
  })

  it("returns null when the application is not bound to any org (NULL organization_id)", async () => {
    // The exact failure mode for an MCP client that registered but never
    // completed the consent flow — `oauth_applications.organization_id` stays
    // NULL and the validator must reject any tokens issued against it.
    const setup = await insertOAuthSetup(database.postgresDb, {
      organizationId: null,
    })

    const redis = createFakeRedis()

    const result = await Effect.runPromise(
      validateOAuthAccessToken(setup.accessToken, {
        redis,
        adminClient: database.adminPostgresClient,
      }),
    )

    expect(result).toBeNull()
  })

  it("serves a cached result without calling onTokenValidated again", async () => {
    const organization = await Effect.runPromise(createOrganizationFixture(database.postgresDb))
    const setup = await insertOAuthSetup(database.postgresDb, {
      organizationId: organization.id,
    })

    const redis = createFakeRedis()
    const touched: string[] = []
    const deps = {
      redis,
      adminClient: database.adminPostgresClient,
      onTokenValidated: (id: string) => touched.push(id),
    }

    // First call — DB hit, touch fires.
    await Effect.runPromise(validateOAuthAccessToken(setup.accessToken, deps))
    expect(touched).toEqual([setup.tokenRowId])

    // Second call — cache hit, no second touch.
    const cached = await Effect.runPromise(validateOAuthAccessToken(setup.accessToken, deps))
    expect(cached?.userId).toBe(setup.userId)
    expect(touched).toEqual([setup.tokenRowId])
  })
})
