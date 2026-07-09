import { generateApiKeyToken } from "@domain/api-keys"
import { generateId } from "@domain/shared"
import { apiKeys } from "@platform/db-postgres/schema/api-keys"
import { projects } from "@platform/db-postgres/schema/projects"
import { createApiKeyAuthHeaders, type InMemoryPostgres } from "@platform/testkit"
import { encrypt, hash } from "@repo/utils"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import {
  type ApiTestContext,
  createOAuthTenantSetup,
  createTenantSetup,
  setupTestApi,
  TEST_ENCRYPTION_KEY,
} from "../test-utils/create-test-app.ts"

/**
 * Integration tests for `/v1/mcp`. Drive the MCP transport with raw JSON-RPC
 * envelopes so we don't take a dependency on the MCP-client SDK in tests —
 * the wire shape is small and stable.
 *
 * The transport's `handleRequest` returns a `Response`. For request/response
 * tools (no streaming), it can either:
 *   (a) return a JSON body directly when the client sends `Accept: application/json`
 *       OR the transport was constructed with `enableJsonResponse: true`, or
 *   (b) return an SSE stream otherwise.
 *
 * We use `Accept: application/json, text/event-stream` (per the MCP spec)
 * which lets the transport pick. In our stateless setup it returns SSE; the
 * tests parse a single `data:` event.
 */

const insertApiKey = async (database: InMemoryPostgres, organizationId: string, token: string) => {
  const tokenHash = await Effect.runPromise(hash(token))
  const encryptedToken = await Effect.runPromise(encrypt(token, TEST_ENCRYPTION_KEY))
  const id = generateId()
  await database.db.insert(apiKeys).values({
    id,
    organizationId,
    token: encryptedToken,
    tokenHash,
    name: "test-key",
  })
  return { id }
}

const insertProject = async (database: InMemoryPostgres, organizationId: string) => {
  const id = generateId()
  const slug = `proj-${id.slice(0, 8)}`
  await database.db.insert(projects).values({ id, organizationId, name: "MCP Project", slug })
  return { id, slug }
}

const PROTOCOL_VERSION = "2025-03-26"

const sendMcpRequest = async (app: ApiTestContext["app"], authToken: string, body: object): Promise<Response> => {
  return app.fetch(
    new Request("http://localhost/v1/mcp", {
      method: "POST",
      headers: {
        ...createApiKeyAuthHeaders(authToken),
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(body),
    }),
  )
}

/**
 * The MCP streamable HTTP transport returns SSE for non-initialize responses
 * by default. Pull the single `data:` line out and parse the JSON-RPC payload.
 */
const readSseJsonRpc = async (response: Response): Promise<{ result?: unknown; error?: unknown }> => {
  const text = await response.text()
  const dataLine = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("data:"))
  if (!dataLine) throw new Error(`Expected an SSE data: line in response, got: ${text.slice(0, 200)}`)
  return JSON.parse(dataLine.slice("data:".length).trim())
}

describe("/v1/mcp", () => {
  setupTestApi()

  it<ApiTestContext>("rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(
      new Request("http://localhost/v1/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "t", version: "0" } },
        }),
      }),
    )
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("initialize returns the server info + capabilities", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const res = await sendMcpRequest(app, tenant.apiKeyToken, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "t", version: "0" } },
    })
    expect(res.status).toBe(200)
    const payload = (await readSseJsonRpc(res)) as {
      result?: { serverInfo?: { name?: string; version?: string }; capabilities?: { tools?: object } }
    }
    expect(payload.result?.serverInfo?.name).toBe("Latitude")
    expect(payload.result?.capabilities?.tools).toBeDefined()
  })

  it<ApiTestContext>("tools/list returns the registered API-key tools", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const res = await sendMcpRequest(app, tenant.apiKeyToken, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    })
    expect(res.status).toBe(200)
    const payload = (await readSseJsonRpc(res)) as { result?: { tools?: ReadonlyArray<{ name: string }> } }
    const toolNames = payload.result?.tools?.map((t) => t.name) ?? []
    expect(toolNames).toEqual(expect.arrayContaining(["createApiKey", "listApiKeys", "revokeApiKey"]))
  })

  it<ApiTestContext>("tools/list includes the tool-analytics tools", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const res = await sendMcpRequest(app, tenant.apiKeyToken, { jsonrpc: "2.0", id: 20, method: "tools/list" })
    expect(res.status).toBe(200)
    const payload = (await readSseJsonRpc(res)) as { result?: { tools?: ReadonlyArray<{ name: string }> } }
    const toolNames = payload.result?.tools?.map((t) => t.name) ?? []
    expect(toolNames).toEqual(expect.arrayContaining(["listTools", "getTool", "getToolCallHistogram", "listToolCalls"]))
  })

  it<ApiTestContext>("tools/list includes the monitor tools", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const res = await sendMcpRequest(app, tenant.apiKeyToken, { jsonrpc: "2.0", id: 24, method: "tools/list" })
    expect(res.status).toBe(200)
    const payload = (await readSseJsonRpc(res)) as { result?: { tools?: ReadonlyArray<{ name: string }> } }
    const toolNames = payload.result?.tools?.map((t) => t.name) ?? []
    expect(toolNames).toEqual(
      expect.arrayContaining([
        "listMonitors",
        "createMonitor",
        "getMonitor",
        "updateMonitor",
        "listMonitorIncidents",
        "muteMonitor",
        "unmuteMonitor",
        "deleteMonitor",
      ]),
    )
  })

  it<ApiTestContext>("tools/list includes the user-analytics tools", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const res = await sendMcpRequest(app, tenant.apiKeyToken, { jsonrpc: "2.0", id: 22, method: "tools/list" })
    expect(res.status).toBe(200)
    const payload = (await readSseJsonRpc(res)) as { result?: { tools?: ReadonlyArray<{ name: string }> } }
    const toolNames = payload.result?.tools?.map((t) => t.name) ?? []
    expect(toolNames).toEqual(
      expect.arrayContaining(["listUsers", "getUser", "getUsersOverview", "getUserActivity", "listUserSignals"]),
    )
  })

  it<ApiTestContext>("tools/call dispatches listUsers with a path param through the inner request", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const project = await insertProject(database, tenant.organizationId)

    const res = await sendMcpRequest(app, tenant.apiKeyToken, {
      jsonrpc: "2.0",
      id: 23,
      method: "tools/call",
      params: { name: "listUsers", arguments: { projectSlug: project.slug } },
    })
    expect(res.status).toBe(200)
    const payload = (await readSseJsonRpc(res)) as {
      result?: { content?: ReadonlyArray<{ type: string; text: string }>; isError?: boolean }
    }
    expect(payload.result?.isError).toBeFalsy()
    const parsed = JSON.parse(payload.result?.content?.[0]?.text ?? "") as { items: unknown[]; totalCount: number }
    expect(parsed.items).toEqual([])
    expect(parsed.totalCount).toBe(0)
  })

  it<ApiTestContext>("tools/call dispatches listTools with a path param through the inner request", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const project = await insertProject(database, tenant.organizationId)

    const res = await sendMcpRequest(app, tenant.apiKeyToken, {
      jsonrpc: "2.0",
      id: 21,
      method: "tools/call",
      params: { name: "listTools", arguments: { projectSlug: project.slug } },
    })
    expect(res.status).toBe(200)
    const payload = (await readSseJsonRpc(res)) as {
      result?: { content?: ReadonlyArray<{ type: string; text: string }>; isError?: boolean }
    }
    expect(payload.result?.isError).toBeFalsy()
    const parsed = JSON.parse(payload.result?.content?.[0]?.text ?? "") as {
      totals: { traces: number }
      tools: unknown[]
    }
    expect(parsed.tools).toEqual([])
    expect(parsed.totals.traces).toBe(0)
  })

  it<ApiTestContext>("tools/call dispatches into the HTTP route via the middleware chain", async ({
    app,
    database,
  }) => {
    const tenant = await createOAuthTenantSetup(database)
    // Seed two extra API keys so the listApiKeys tool returns >= 3 entries
    // (the auth key from `createTenantSetup` plus these two).
    await insertApiKey(database, tenant.organizationId, generateApiKeyToken())
    await insertApiKey(database, tenant.organizationId, generateApiKeyToken())

    const res = await sendMcpRequest(app, tenant.oauthAccessToken, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "listApiKeys", arguments: {} },
    })
    expect(res.status).toBe(200)
    const payload = (await readSseJsonRpc(res)) as {
      result?: { content?: ReadonlyArray<{ type: string; text: string }>; isError?: boolean }
    }
    expect(payload.result?.isError).toBeFalsy()
    const text = payload.result?.content?.[0]?.text ?? ""
    const parsed = JSON.parse(text) as { apiKeys: ReadonlyArray<{ id: string; organizationId: string }> }
    expect(parsed.apiKeys.length).toBeGreaterThanOrEqual(3)
    // Tenant isolation through the inner middleware chain — every row's org
    // matches the caller's org.
    for (const key of parsed.apiKeys) {
      expect(key.organizationId).toBe(tenant.organizationId)
    }
  })

  it<ApiTestContext>("tools/call creates and reads a monitor with structured content", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const project = await insertProject(database, tenant.organizationId)

    const createRes = await sendMcpRequest(app, tenant.apiKeyToken, {
      jsonrpc: "2.0",
      id: 25,
      method: "tools/call",
      params: {
        name: "createMonitor",
        arguments: {
          projectSlug: project.slug,
          body: {
            name: "MCP monitor",
            description: "Created through MCP transport",
            target: { type: "session", id: null, filterSet: {}, query: null },
            trigger: "match",
            metric: { kind: "count" },
            severity: "medium",
          },
        },
      },
    })
    expect(createRes.status).toBe(200)
    const createdPayload = (await readSseJsonRpc(createRes)) as {
      result?: {
        structuredContent?: { slug?: string; target?: { stream?: string; metric?: { kind?: string } } }
        content?: ReadonlyArray<{ type: string; text: string }>
        isError?: boolean
      }
    }
    expect(createdPayload.result?.isError).toBeFalsy()
    expect(createdPayload.result?.structuredContent?.slug).toBe("mcp-monitor")
    expect(createdPayload.result?.structuredContent?.target?.stream).toBe("sessions")
    expect(createdPayload.result?.structuredContent?.target?.metric?.kind).toBe("count")

    const listRes = await sendMcpRequest(app, tenant.apiKeyToken, {
      jsonrpc: "2.0",
      id: 26,
      method: "tools/call",
      params: { name: "listMonitors", arguments: { projectSlug: project.slug, search: "MCP monitor" } },
    })
    expect(listRes.status).toBe(200)
    const listPayload = (await readSseJsonRpc(listRes)) as {
      result?: { structuredContent?: { items?: ReadonlyArray<{ slug: string }> }; isError?: boolean }
    }
    expect(listPayload.result?.isError).toBeFalsy()
    expect(listPayload.result?.structuredContent?.items?.map((item) => item.slug)).toContain("mcp-monitor")
  })

  it<ApiTestContext>("tools/call with a body-only tool forwards JSON body through the inner request", async ({
    app,
    database,
  }) => {
    const tenant = await createOAuthTenantSetup(database)
    const res = await sendMcpRequest(app, tenant.oauthAccessToken, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "createApiKey", arguments: { name: "from-mcp" } },
    })
    expect(res.status).toBe(200)
    const payload = (await readSseJsonRpc(res)) as {
      result?: { content?: ReadonlyArray<{ type: string; text: string }>; isError?: boolean }
    }
    expect(payload.result?.isError).toBeFalsy()
    const created = JSON.parse(payload.result?.content?.[0]?.text ?? "{}") as {
      name: string
      organizationId: string
      token: string
    }
    expect(created.name).toBe("from-mcp")
    expect(created.organizationId).toBe(tenant.organizationId)
    expect(typeof created.token).toBe("string")
    expect(created.token.length).toBeGreaterThan(0)
  })

  it<ApiTestContext>("tools/call surfaces inner-route errors as isError content (404 from cross-tenant id)", async ({
    app,
    database,
  }) => {
    const tenantA = await createOAuthTenantSetup(database)
    const tenantB = await createTenantSetup(database)
    // Try to revoke tenant B's API key with tenant A's OAuth bearer — the inner
    // route's org-scoped repository returns 404, which surfaces as isError.
    const res = await sendMcpRequest(app, tenantA.oauthAccessToken, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "revokeApiKey", arguments: { id: tenantB.authApiKeyId } },
    })
    expect(res.status).toBe(200)
    const payload = (await readSseJsonRpc(res)) as { result?: { isError?: boolean } }
    expect(payload.result?.isError).toBe(true)
  })
})
