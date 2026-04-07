import type { RedisClient } from "@platform/cache-redis"
import {
  closeInMemoryPostgres,
  createApiKeyFixture,
  createInMemoryPostgres,
  createOrganizationFixture,
  type InMemoryPostgres,
} from "@platform/testkit"
import { Effect } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { validateApiKey } from "./validate-api-key.ts"

/** `@repo/utils` crypto helpers require Node 25+ `Uint8Array` hex APIs (see `packages/utils/src/base64.ts`). */
const nodeSupportsUint8Hex = typeof Uint8Array.fromHex === "function"

const TEST_ENCRYPTION_KEY_HEX = "75d697b90c1e46c13bd7f7343ab2b9a9e430cdcda05d47f055e1523d54d5409b"
const TEST_ENCRYPTION_KEY = Buffer.from(TEST_ENCRYPTION_KEY_HEX, "hex")

const createFakeRedis = (): RedisClient => {
  const store = new Map<string, string>()
  return {
    get: async (key: string) => store.get(key) ?? null,
    setex: async (key: string, _ttl: number, value: string) => {
      store.set(key, value)
      return "OK"
    },
  } as unknown as RedisClient
}

describe("validateApiKey", () => {
  it("exports the shared validator used by api and ingest middleware", () => {
    expect(typeof validateApiKey).toBe("function")
  })
})

describe.skipIf(!nodeSupportsUint8Hex)("validateApiKey (integration, Node 25+)", () => {
  let database: InMemoryPostgres

  beforeAll(async () => {
    process.env.LAT_MASTER_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY_HEX
    database = await createInMemoryPostgres()
  })

  afterAll(async () => {
    await closeInMemoryPostgres(database)
  })

  it("returns org and key id for a valid token", async () => {
    const organization = await Effect.runPromise(createOrganizationFixture(database.postgresDb))
    const apiKey = await Effect.runPromise(
      createApiKeyFixture(database.postgresDb, {
        organizationId: organization.id,
        encryptionKey: TEST_ENCRYPTION_KEY,
      }),
    )

    const redis = createFakeRedis()
    const touched: string[] = []

    const result = await Effect.runPromise(
      validateApiKey(apiKey.token, {
        redis,
        adminClient: database.adminPostgresClient,
        onKeyValidated: (id) => touched.push(id),
      }),
    )

    expect(result).toEqual({ organizationId: apiKey.organizationId, keyId: apiKey.id })
    expect(touched).toEqual([apiKey.id])
  })

  it("returns null for an unknown token", async () => {
    const redis = createFakeRedis()
    const result = await Effect.runPromise(
      validateApiKey("lat_unknown", {
        redis,
        adminClient: database.adminPostgresClient,
      }),
    )
    expect(result).toBeNull()
  })

  it("matches ingest wiring: same validator without touch callback", async () => {
    const organization = await Effect.runPromise(createOrganizationFixture(database.postgresDb))
    const apiKey = await Effect.runPromise(
      createApiKeyFixture(database.postgresDb, {
        organizationId: organization.id,
        encryptionKey: TEST_ENCRYPTION_KEY,
      }),
    )

    const result = await Effect.runPromise(
      validateApiKey(apiKey.token, {
        redis: createFakeRedis(),
        adminClient: database.adminPostgresClient,
      }),
    )

    expect(result).toEqual({ organizationId: apiKey.organizationId, keyId: apiKey.id })
  })
})
