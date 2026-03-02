import { Hono } from "hono"
import { beforeAll, describe, expect, it } from "vitest"
import { registerHealthRoute } from "./health.ts"

describe("GET /health", () => {
  let app: Hono

  beforeAll(() => {
    // Create fresh Hono app for each test suite
    app = new Hono()
    registerHealthRoute({ app })
  })

  describe("with database connections", () => {
    // These tests require DATABASE_URL and CLICKHOUSE_URL to be set
    // Run with: DATABASE_URL=postgres://... pnpm test

    it("should return service status", async () => {
      const res = await app.fetch(new Request("http://localhost/health"))
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.service).toBe("api")
      expect(body.status).toBeDefined()
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
