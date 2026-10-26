import type { RedisClient } from "@platform/cache-redis"
import { closePostgres, createPostgresClient } from "@platform/db-postgres"
import { Hono } from "hono"
import { afterAll, describe, expect, it, vi } from "vitest"
import type { ProtectedEnv } from "../types.ts"

process.env.LAT_API_URL ??= "http://localhost:3001"

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

const createApp = () => {
  const app = new Hono<ProtectedEnv>()
  app.use("*", async (c, next) => {
    c.set("redis", redis)
    await next()
  })
  app.use(
    "*",
    createAuthMiddleware({
      adminClient: unreachablePostgres,
      logTouchBuffer: false,
    }),
  )
  app.get("/v1/protected", (c) => c.json({ ok: true }))
  return app
}

describe("auth middleware during database outage", () => {
  afterAll(async () => {
    await destroyTouchBuffer()
    await closePostgres(unreachablePostgres.pool)
  })

  it("answers 503 with Retry-After when credentials cannot be checked", async () => {
    const res = await createApp().request("/v1/protected", {
      headers: { Authorization: "Bearer lat_some_valid_looking_key" },
    })

    expect(res.status).toBe(503)
    expect(res.headers.get("Retry-After")).toBe("1")
    expect(cache.size).toBe(0)
  })
})
