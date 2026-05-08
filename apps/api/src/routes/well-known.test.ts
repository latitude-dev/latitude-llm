import { describe, expect, it } from "vitest"
import { type ApiTestContext, setupTestApi } from "../test-utils/create-test-app.ts"

describe("GET /.well-known/oauth-protected-resource", () => {
  setupTestApi()

  it<ApiTestContext>("returns 200 with no auth header (public route)", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/.well-known/oauth-protected-resource"))
    expect(res.status).toBe(200)
  })

  it<ApiTestContext>("returns the API origin as `resource` and the web AS as `authorization_servers`", async ({
    app,
  }) => {
    const res = await app.fetch(new Request("http://localhost/.well-known/oauth-protected-resource"))
    const body = (await res.json()) as { resource: string; authorization_servers: string[] }

    // Test env sets LAT_API_URL=http://localhost:3001, LAT_WEB_URL=http://localhost:3000.
    expect(body.resource).toBe(process.env.LAT_API_URL)
    expect(body.authorization_servers).toEqual([`${process.env.LAT_WEB_URL}/api/auth`])
  })

  it<ApiTestContext>("returns JSON content type", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/.well-known/oauth-protected-resource"))
    expect(res.headers.get("content-type")).toContain("application/json")
  })
})
