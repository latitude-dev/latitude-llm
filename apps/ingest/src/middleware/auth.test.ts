import type { RedisClient } from "@platform/cache-redis"
import { closePostgres, createPostgresClient } from "@platform/db-postgres"
import { Hono } from "hono"
import { afterAll, describe, expect, it, vi } from "vitest"
import type { IngestEnv } from "../types.ts"

// The rest of the environment is healthy: only Postgres is down.
process.env.LAT_MASTER_ENCRYPTION_KEY ??= "75d697b90c1e46c13bd7f7343ab2b9a9e430cdcda05d47f055e1523d54d5409b"

const cache = new Map<string, string>()
const redis = {
  get: async (key: string) => cache.get(key) ?? null,
  setex: async (key: string, _ttl: number, value: string) => {
    cache.set(key, value)
    return "OK"
  },
  del: async (key: string) => (cache.delete(key) ? 1 : 0),
} as unknown as RedisClient

// Every query fails to connect, like during a Postgres outage.
const unreachablePostgres = createPostgresClient({
  databaseUrl: "postgres://latitude:latitude@127.0.0.1:1/latitude",
  connectionTimeoutMs: 1000,
})

vi.mock("../clients.ts", () => ({
  getAdminPostgresClient: () => unreachablePostgres,
  getRedisClient: () => redis,
}))

const { authMiddleware } = await import("./auth.ts")
const { destroyTouchBuffer } = await import("./touch-buffer.ts")

const createApp = () => {
  const app = new Hono<IngestEnv>()
  app.post("/v1/traces", authMiddleware, (c) => c.json({}, 200))
  return app
}

describe("ingest auth middleware", () => {
  afterAll(async () => {
    await destroyTouchBuffer()
    await closePostgres(unreachablePostgres.pool)
  })

  it("answers 503 with Retry-After, not 401, when the key cannot be checked", async () => {
    const res = await createApp().request("/v1/traces", {
      method: "POST",
      headers: { Authorization: "Bearer lat_some_valid_looking_key" },
    })

    expect(res.status).toBe(503)
    expect(res.headers.get("Retry-After")).toBe("1")
    expect(cache.size).toBe(0)
  })

  it("still answers 401 without a bearer token", async () => {
    const res = await createApp().request("/v1/traces", { method: "POST" })

    expect(res.status).toBe(401)
  })
})
