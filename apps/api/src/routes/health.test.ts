import { describe, expect, it } from "vitest"
import { type ApiTestContext, setupTestApi } from "../test-utils/create-test-app.ts"

describe("GET /health", () => {
  setupTestApi()

  it<ApiTestContext>("should return 200 with service name and ok status", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/health"))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toEqual({ service: "api", status: "ok" })
  })

  it<ApiTestContext>("should return JSON content type", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/health"))
    expect(res.headers.get("content-type")).toContain("application/json")
  })
})
