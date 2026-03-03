import { createFakeClickhouseClient, createFakePostgresPool } from "@platform/testkit"
import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import type { ApiDatabaseDependencies } from "../db-deps.ts"
import { registerHealthRoute } from "./health.ts"

describe("GET /health", () => {
  const createApp = (options: { postgresHealthy?: boolean; clickhouseHealthy?: boolean } = {}) => {
    const app = new Hono()
    const postgresPool = createFakePostgresPool({ healthy: options.postgresHealthy ?? true })
    const clickhouseClient = createFakeClickhouseClient({ healthy: options.clickhouseHealthy ?? true })

    const database: ApiDatabaseDependencies = {
      db: {} as ApiDatabaseDependencies["db"],
      pool: postgresPool as unknown as ApiDatabaseDependencies["pool"],
    }

    registerHealthRoute({
      app,
      database,
      clickhouse: clickhouseClient as never,
    })
    return app
  }

  describe("with healthy dependencies", () => {
    it("should return service status and health info", async () => {
      const app = createApp()
      const res = await app.fetch(new Request("http://localhost/health"))
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.service).toBe("api")
      expect(body.status).toBe("ok")
      expect(body.postgres.ok).toBe(true)
      expect(body.clickhouse.ok).toBe(true)
    })
  })

  describe("with unhealthy dependencies", () => {
    it("should return degraded status when postgres is unhealthy", async () => {
      const app = createApp({ postgresHealthy: false })
      const res = await app.fetch(new Request("http://localhost/health"))
      expect(res.status).toBe(503)

      const body = await res.json()
      expect(body.status).toBe("degraded")
      expect(body.postgres.ok).toBe(false)
      expect(body.clickhouse.ok).toBe(true)
    })

    it("should return degraded status when clickhouse is unhealthy", async () => {
      const app = createApp({ clickhouseHealthy: false })
      const res = await app.fetch(new Request("http://localhost/health"))
      expect(res.status).toBe(503)

      const body = await res.json()
      expect(body.status).toBe("degraded")
      expect(body.postgres.ok).toBe(true)
      expect(body.clickhouse.ok).toBe(false)
    })
  })

  describe("response format", () => {
    it("should return JSON content type", async () => {
      const app = createApp()
      const res = await app.fetch(new Request("http://localhost/health"))
      expect(res.headers.get("content-type")).toContain("application/json")
    })
  })
})
