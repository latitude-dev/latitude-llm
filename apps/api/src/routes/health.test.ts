import { OpenAPIHono } from "@hono/zod-openapi"
import { beforeAll, describe, expect, it } from "vitest"
import { getClickhouseClient, getPostgresClient } from "../clients.ts"
import { registerHealthRoute } from "./health.ts"

describe("GET /health", () => {
  let app: OpenAPIHono

  beforeAll(() => {
    // Create fresh OpenAPIHono app for each test suite
    app = new OpenAPIHono()
    registerHealthRoute({
      app,
      database: getPostgresClient(),
      clickhouse: getClickhouseClient(),
    })
  })

  describe("with database connections", () => {
    // These tests require LAT_DATABASE_URL and CLICKHOUSE_URL to be set
    // Run with: pnpm --filter @app/api test
    // The .env.test file at repo root is automatically loaded by vitest config

    it("should return service status and health info", async () => {
      const res = await app.fetch(new Request("http://localhost/health"))
      // Status can be 200 (healthy) or 503 (degraded) depending on DB availability
      expect([200, 503]).toContain(res.status)

      const body = await res.json()
      expect(body.service).toBe("api")
      expect(body.status).toMatch(/^(ok|degraded)$/)
    })

    it("should include postgres health status", async () => {
      const res = await app.fetch(new Request("http://localhost/health"))
      const body = await res.json()

      expect(body.postgres).toBeDefined()
      expect(body.postgres).toHaveProperty("ok")
    })

    it("should include clickhouse health status", async () => {
      const res = await app.fetch(new Request("http://localhost/health"))
      const body = await res.json()

      expect(body.clickhouse).toBeDefined()
      expect(body.clickhouse).toHaveProperty("ok")
    })
  })

  describe("response format", () => {
    it("should return JSON content type", async () => {
      const res = await app.fetch(new Request("http://localhost/health"))
      expect(res.headers.get("content-type")).toContain("application/json")
    })
  })
})
