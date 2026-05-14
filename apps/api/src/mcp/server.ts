import type { OpenAPIHono, z } from "@hono/zod-openapi"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import type { Context } from "hono"
import { API_VERSION, MCP_INFO } from "../constants.ts"
import type { AppEnv, ProtectedEnv } from "../types.ts"
import { splitFlatInput } from "./flatten-input.ts"
import { collectToolDescriptors } from "./registry.ts"

/**
 * Mounts the MCP transport endpoint on `routes` (which already lives behind
 * the unified auth + org-context middleware). Tool dispatch re-enters the
 * root Hono app via `app.fetch(internalRequest)` so every tool call runs
 * through the same middleware chain (validation, rate-limit, auth,
 * organization context). The outer `Authorization` and `X-Forwarded-For`
 * headers are forwarded so the inner request authenticates as the same
 * caller and counts against the same rate-limit bucket.
 *
 * The MCP mount path (`/mcp`) is internal to this function — when `routes`
 * is mounted at `/${API_VERSION}` on the root, the public URL becomes
 * `/v1/mcp`. The dispatcher prepends `/${API_VERSION}` to the descriptor's
 * router prefix when re-entering through `app.fetch()` — so a tool whose
 * registry entry has `routerPrefix: "/api-keys"` resolves to `/v1/api-keys`.
 *
 * Each request gets its own `McpServer` + `WebStandardStreamableHTTPServerTransport`
 * + `connect()` + tool registration loop. This is an SDK invariant in stateless
 * mode, not a stylistic choice:
 *
 *   1. `WebStandardStreamableHTTPServerTransport.handleRequest` throws on the
 *      second call when `sessionIdGenerator` is omitted — see
 *      `@modelcontextprotocol/sdk` `server/webStandardStreamableHttp.js:139-141`:
 *      "Stateless transport cannot be reused across requests."
 *   2. `Protocol.connect` throws on the second call against the same server —
 *      see `shared/protocol.js:215-218`: "Already connected to a transport."
 *
 * So we couldn't hoist either object to module scope even if we wanted to.
 * Switching to stateful mode (passing a `sessionIdGenerator`) would unlock a
 * boot-time singleton, but adds session lifecycle management (per-client GC,
 * sticky routing across instances) that an org-scoped REST surface doesn't
 * need — each tool call is independent.
 *
 * The per-request cost is a small `McpServer` constructor + N closure
 * allocations from the registration loop; dwarfed by the inner `app.fetch`
 * round-trip, which is the actual work.
 *
 * Tools are registered from the snapshot built by {@link collectToolDescriptors}.
 * The registry is populated at boot by `mountWithMcp(...)` calls in
 * `routes/index.ts`, so by the time the first request lands here every tool
 * is already known.
 *
 * TODO: add DNS-rebinding protection on this route (Host-header allowlist) as
 * defense-in-depth on top of bearer auth. Reject  with a JSON-RPC 403 when the
 * incoming Host isn't in the list. See the MCP SDK's `hostHeaderValidation`
 * helper for the standard shape.
 */
export const registerMcpRoute = ({
  app,
  routes,
}: {
  app: OpenAPIHono<AppEnv>
  routes: OpenAPIHono<ProtectedEnv>
}): void => {
  const toolDescriptors = collectToolDescriptors()

  routes.all("/mcp", async (c) => {
    const mcpServer = new McpServer(MCP_INFO, { instructions: MCP_INFO.instructions, capabilities: { tools: {} } })

    for (const tool of toolDescriptors) {
      // Capture each descriptor in the closure — the loop variable would
      // otherwise alias inside async callbacks once the iteration ends.
      const descriptor = tool

      mcpServer.registerTool(
        descriptor.name,
        {
          title: descriptor.title,
          description: descriptor.description,
          inputSchema: descriptor.input.schema.shape as z.ZodRawShape,
          outputSchema: descriptor.output?.schema.shape as z.ZodRawShape,
        },
        async (input: Record<string, unknown>) => {
          const { params, query, body } = splitFlatInput(input, descriptor.input.sources)
          const method = descriptor.httpMethod.toUpperCase()
          const url = buildInternalRequestUrl(c, descriptor, params, query)
          const headers = new Headers({
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: c.req.header("Authorization") ?? "",
            "X-Forwarded-For": c.req.header("X-Forwarded-For") ?? "",
          })

          const hasJsonBody = body !== undefined && !methodHasNoBody(descriptor.httpMethod)

          const response = await app.fetch(
            new Request(url, { method, headers, ...(hasJsonBody ? { body: JSON.stringify(body) } : {}) }),
          )
          const output = await response.text()

          const isError = !response.ok
          const isStructured = !!descriptor.output

          return {
            content: [{ type: "text" as const, text: output }],
            ...(isStructured && !isError ? { structuredContent: JSON.parse(output) } : {}),
            isError,
          }
        },
      )
    }

    // Stateless transport — `sessionIdGenerator` is omitted entirely, not set
    // to `undefined`, because the SDK's typed options reject `undefined` even
    // though the runtime supports it.
    const transport = new WebStandardStreamableHTTPServerTransport({})
    await mcpServer.connect(transport)
    return transport.handleRequest(c.req.raw)
  })
}

const NO_BODY_METHODS = new Set(["get", "head", "delete"])

const methodHasNoBody = (method: string): boolean => NO_BODY_METHODS.has(method.toLowerCase())

interface InternalRoute {
  readonly routerPrefix: string
  readonly pathTemplate: string
}

/**
 * One-shot builder for the absolute URL the MCP dispatcher passes to
 * `app.fetch(...)`. Composes the sub-app prefix + route template (with
 * `{name}` placeholders), substitutes path params, appends the query string,
 * prepends `/${API_VERSION}`, and resolves against the outer MCP request's
 * origin so Hono's path matcher sees a fully-qualified URL.
 */
const buildInternalRequestUrl = (
  c: Context,
  route: InternalRoute,
  params: Record<string, unknown>,
  query: Record<string, unknown>,
): string => {
  const path = route.pathTemplate
  const prefix = route.routerPrefix.replace(/\/$/, "")
  // `pathTemplate === "/"` collapses to the bare prefix — Hono treats
  // `/api-keys` and `/api-keys/` as distinct routes; ours mount un-trailing.
  let joined = path === "/" ? prefix : `${prefix}${path.startsWith("/") ? path : `/${path}`}`
  // Substitute `{name}` placeholders across the full joined string — params
  // can appear either in the route's own path (e.g. `/api-keys/{id}`) or in
  // the mount prefix (e.g. `/projects/{projectSlug}/annotations`).
  for (const [name, value] of Object.entries(params)) {
    joined = joined.replaceAll(`{${name}}`, encodeURIComponent(String(value)))
  }
  const subAppPath = joined === "" ? "/" : joined
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item))
    } else {
      search.append(key, String(value))
    }
  }
  const qs = search.toString()
  const internalPath = `/${API_VERSION}${subAppPath}${qs ? `?${qs}` : ""}`
  try {
    const outerUrl = new URL(c.req.url)
    return new URL(internalPath, outerUrl.origin).toString()
  } catch {
    // Fallback for runtimes where `c.req.url` is relative — shouldn't happen
    // with TanStack Start / Hono node-server, but defensible.
    return `http://localhost${internalPath}`
  }
}
