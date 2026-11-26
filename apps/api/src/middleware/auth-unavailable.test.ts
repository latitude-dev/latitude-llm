import type { RedisClient } from "@platform/cache-redis"
import { closePostgres, createPostgresClient } from "@platform/db-postgres"
import { afterAll, describe, expect, it, vi } from "vitest"
import { OpenAPIHono } from "@hono/zod-openapi"
import type { AppEnv } from "../types.ts"

process.env.LAT_MASTER_ENCRYPTION_KEY ??= "75d697b90c1e46c13bd7f7343ab2b9a9e430cdcda05d47f055e1523d54d5409b"

const nodeSupportsUint8Hex = typeof Uint8Array.fromHex === "function"

const cache = new Map<string, string>()
const redis = {
  get: async (key: string) => cache.get(key) ?? null,
  setex: async (key: string, _ttl: number, value: string) => {
    cache.set(key, value)
    return "OK"
  },
  del: async (key: string) => (cache.delete(key) ? 1 : 0),
} as unknown as RedisClient

const unreachablePostgres = createPostgresClient({
  databaseUrl: "postgres://latitude:latitude@127.0.0.1:1/latitude",
  connectionTimeoutMs: 1000,
})

vi.mock("../clients.ts", () => ({
  getAdminPostgresClient: () => unreachablePostgres,
}))

const { createAuthMiddleware } = await import("./auth.ts")
const { destroyTouchBuffer } = await import("./touch-buffer.ts")
const { honoErrorHandler } = await import("./error-handler.ts")

const createApp = () => {
  const app = new OpenAPIHono<AppEnv>()
  app.onError(honoErrorHandler)
  app.use("*", async (c, next) => {
    c.set("redis", redis as AppEnv["Variables"]["redis"])
    await next()
  })
  app.use("*", createAuthMiddleware({ adminClient: unreachablePostgres, logTouchBuffer: false }))
  app.get("/v1/protected", (c) => c.json({ ok: true }))
  return app
}

describe.skipIf(!nodeSupportsUint8Hex)("auth middleware when Postgres is unavailable", () => {
  afterAll(async () => {
    await destroyTouchBuffer()
    await closePostgres(unreachablePostgres.pool)
  })

  it("answers 503 with Retry-After instead of dying when an API key cannot be checked", async () => {
    const token = "lat_some_valid_looking_key"
    const res = await createApp().request("/v1/protected", {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(503)
    expect(res.headers.get("Retry-After")).toBe("1")
    expect(cache.size).toBe(0)
  })
})
