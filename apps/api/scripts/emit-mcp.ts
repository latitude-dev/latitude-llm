/**
 * Emits the MCP tool manifest to `apps/api/mcp.json`.
 *
 * Mirrors `emit-openapi.ts`: boots the route registry the same way `server.ts`
 * does — minus the HTTP listener, observability, and real client wiring — then
 * walks the populated MCP endpoint registry and writes one descriptor per tool.
 *
 * The manifest is checked in alongside `openapi.json` and guarded against drift
 * in CI. It's the source of truth for MCP-client tooling and SDK generation.
 */
import { writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { OpenAPIHono, z } from "@hono/zod-openapi"
import { collectToolDescriptors } from "../src/mcp/index.ts"
import { registerRoutes } from "../src/routes/index.ts"
import type { AppEnv } from "../src/types.ts"

// Route registration only stores route metadata; the handler closures never run
// during manifest emission, so opaque stubs for the clients are safe here.
const STUB = {} as never

const app = new OpenAPIHono<AppEnv>()

registerRoutes(app, {
  database: STUB,
  adminDatabase: STUB,
  clickhouse: STUB,
  redis: STUB,
  queuePublisher: { publish: () => STUB, close: () => STUB } as never,
  logTouchBuffer: false,
})

const tools = collectToolDescriptors().map((tool) => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  inputSchema: z.toJSONSchema(tool.input.schema, { target: "draft-2020-12" }),
  // `outputSchema` is optional in the MCP spec; we omit the property entirely
  // (rather than emitting `null`) for 204 / no-JSON-body routes so clients can
  // rely on `"outputSchema" in tool` to mean "structured output is available".
  ...(tool.output ? { outputSchema: z.toJSONSchema(tool.output.schema, { target: "draft-2020-12" }) } : {}),
}))

const manifest = {
  name: "Latitude API",
  version: "1.0.0",
  tools,
}

const here = dirname(fileURLToPath(import.meta.url))
const outPath = resolve(here, "../mcp.json")

await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8")
console.log(`MCP manifest written to ${outPath} (${tools.length} tools)`)
