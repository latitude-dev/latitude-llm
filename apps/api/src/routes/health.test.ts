import { OpenAPIHono } from "@hono/zod-openapi"
import { beforeAll, describe, expect, it } from "vitest"
import { registerHealthRoute } from "./health.ts"

describe("GET /health", () => {
  let app: OpenAPIHono

  beforeAll(() => {
    app = new OpenAPIHono()
    registerHealthRoute({ app })
  })

  it("should return 200 with service name and ok status", async () => {
    const res = await app.fetch(new Request("http://localhost/health"))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toEqual({ service: "api", status: "ok" })
  })

  it("should return JSON content type", async () => {
    const res = await app.fetch(new Request("http://localhost/health"))
    expect(res.headers.get("content-type")).toContain("application/json")
  })
})
