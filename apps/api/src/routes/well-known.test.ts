import { describe, expect, it } from "vitest"
import { type ApiTestContext, setupTestApi } from "../test-utils/create-test-app.ts"

describe("GET /.well-known/oauth-protected-resource", () => {
  setupTestApi()

  it<ApiTestContext>("returns 200 with no auth header (public route)", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/.well-known/oauth-protected-resource"))
    expect(res.status).toBe(200)
  })

  it<ApiTestContext>("returns the API origin as `resource` and the web origin as `authorization_servers`", async ({
    app,
  }) => {
    const res = await app.fetch(new Request("http://localhost/.well-known/oauth-protected-resource"))
    const body = (await res.json()) as { resource: string; authorization_servers: string[] }

    // Test env sets LAT_API_URL=http://localhost:3001, LAT_WEB_URL=http://localhost:3000.
    // Bare origin (not `${webUrl}/api/auth`) so the value matches the issuer BA
    // emits — strict OAuth clients (Zed) reject when issuer ≠ AS URL.
    expect(body.resource).toBe(process.env.LAT_API_URL)
    expect(body.authorization_servers).toEqual([process.env.LAT_WEB_URL])
  })

  it<ApiTestContext>("returns JSON content type", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/.well-known/oauth-protected-resource"))
    expect(res.headers.get("content-type")).toContain("application/json")
  })

  it<ApiTestContext>("RFC 9728 path-suffix form returns the same metadata", async ({ app }) => {
    // Zed and other strict MCP clients probe the path-suffixed form first.
    const res = await app.fetch(new Request("http://localhost/.well-known/oauth-protected-resource/v1/mcp"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { resource: string; authorization_servers: string[] }
    expect(body.resource).toBe(process.env.LAT_API_URL)
    expect(body.authorization_servers).toEqual([process.env.LAT_WEB_URL])
  })
})
