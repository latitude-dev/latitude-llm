import { OAUTH_ACCESS_TOKEN_PREFIX, OAUTH_REFRESH_TOKEN_PREFIX } from "@platform/db-postgres"
import { describe, expect, it } from "vitest"
import { rewriteOAuthTokenResponse } from "./oauth-token-prefix-rewriter.ts"

const tokenEndpoint = "https://app.example.com/api/auth/mcp/token"

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

describe("rewriteOAuthTokenResponse", () => {
  it("prefixes `access_token` and `refresh_token` in a 200 response from /api/auth/mcp/token", async () => {
    const request = new Request(tokenEndpoint, { method: "POST" })
    const response = jsonResponse(200, {
      access_token: "raw-access",
      refresh_token: "raw-refresh",
      token_type: "Bearer",
      expires_in: 3600,
    })

    const rewritten = await rewriteOAuthTokenResponse(request, response)
    const body = (await rewritten.json()) as Record<string, unknown>

    expect(body.access_token).toBe(`${OAUTH_ACCESS_TOKEN_PREFIX}raw-access`)
    expect(body.refresh_token).toBe(`${OAUTH_REFRESH_TOKEN_PREFIX}raw-refresh`)
    expect(body.token_type).toBe("Bearer")
    expect(body.expires_in).toBe(3600)
  })

  it("recomputes Content-Length to match the prefixed body", async () => {
    const request = new Request(tokenEndpoint, { method: "POST" })
    const response = jsonResponse(200, { access_token: "raw" })

    const rewritten = await rewriteOAuthTokenResponse(request, response)
    const body = await rewritten.text()

    expect(rewritten.headers.get("Content-Length")).toBe(String(new TextEncoder().encode(body).byteLength))
  })

  it("does not double-prefix tokens that are already prefixed", async () => {
    const request = new Request(tokenEndpoint, { method: "POST" })
    const already = `${OAUTH_ACCESS_TOKEN_PREFIX}existing`
    const response = jsonResponse(200, { access_token: already })

    const rewritten = await rewriteOAuthTokenResponse(request, response)
    const body = (await rewritten.json()) as Record<string, unknown>
    expect(body.access_token).toBe(already)
  })

  it("returns the original response untouched when the URL is not the token endpoint", async () => {
    const request = new Request("https://app.example.com/api/auth/get-session", { method: "POST" })
    const response = jsonResponse(200, { access_token: "raw-access" })

    const rewritten = await rewriteOAuthTokenResponse(request, response)
    expect(rewritten).toBe(response)
  })

  it("returns the original response untouched on GET requests (token endpoint is POST-only)", async () => {
    const request = new Request(tokenEndpoint, { method: "GET" })
    const response = jsonResponse(200, { access_token: "raw-access" })

    const rewritten = await rewriteOAuthTokenResponse(request, response)
    expect(rewritten).toBe(response)
  })

  it("returns the original response untouched on error responses", async () => {
    const request = new Request(tokenEndpoint, { method: "POST" })
    const errorBody = { error: "invalid_grant", error_description: "code expired" }
    const response = jsonResponse(401, errorBody)

    const rewritten = await rewriteOAuthTokenResponse(request, response)
    expect(rewritten).toBe(response)
    expect(await rewritten.json()).toEqual(errorBody)
  })

  it("returns the original response untouched when content-type isn't JSON", async () => {
    const request = new Request(tokenEndpoint, { method: "POST" })
    const response = new Response("ok", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    })

    const rewritten = await rewriteOAuthTokenResponse(request, response)
    expect(rewritten).toBe(response)
  })

  it("returns the original response untouched when the body isn't valid JSON", async () => {
    const request = new Request(tokenEndpoint, { method: "POST" })
    const response = new Response("not json", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })

    const rewritten = await rewriteOAuthTokenResponse(request, response)
    expect(rewritten).toBe(response)
  })

  it("returns the original response untouched when neither token field is present", async () => {
    const request = new Request(tokenEndpoint, { method: "POST" })
    const response = jsonResponse(200, { token_type: "Bearer", expires_in: 3600 })

    const rewritten = await rewriteOAuthTokenResponse(request, response)
    expect(rewritten).toBe(response)
  })

  it("preserves status, statusText, and other headers", async () => {
    const request = new Request(tokenEndpoint, { method: "POST" })
    const response = new Response(JSON.stringify({ access_token: "raw" }), {
      status: 200,
      statusText: "OK",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    })

    const rewritten = await rewriteOAuthTokenResponse(request, response)
    expect(rewritten.status).toBe(200)
    expect(rewritten.statusText).toBe("OK")
    expect(rewritten.headers.get("Cache-Control")).toBe("no-store")
    expect(rewritten.headers.get("Content-Type")).toBe("application/json")
  })

  it("only prefixes access_token when refresh_token isn't returned (auth-code response)", async () => {
    const request = new Request(tokenEndpoint, { method: "POST" })
    const response = jsonResponse(200, { access_token: "raw" })

    const rewritten = await rewriteOAuthTokenResponse(request, response)
    const body = (await rewritten.json()) as Record<string, unknown>
    expect(body.access_token).toBe(`${OAUTH_ACCESS_TOKEN_PREFIX}raw`)
    expect(body).not.toHaveProperty("refresh_token")
  })
})
