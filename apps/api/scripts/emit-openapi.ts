/**
 * Emits the OpenAPI 3.1 spec to `apps/api/openapi.json`.
 *
 * Used by the SDK pipeline (Fern-generated `@latitude-data/sdk`) and
 * sanity-checked in CI to guard against drift between the runtime routes and
 * the on-disk spec. Boot the app shell the same way `server.ts` does — minus
 * the HTTP listener, observability init, and real client wiring — so the
 * emitted spec matches what the real server would serve at `GET /openapi.json`.
 */
import { writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { OpenAPIHono } from "@hono/zod-openapi"
import { registerRoutes } from "../src/routes/index.ts"
import type { AppEnv } from "../src/types.ts"

// Route registration only stores route metadata; the handler closures never
// run during emission, so opaque stubs for the clients are safe here.
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

app.openAPIRegistry.registerComponent("securitySchemes", "ApiKeyAuth", {
  type: "http",
  scheme: "bearer",
  description: "Organization-scoped API key",
})

const spec = app.getOpenAPI31Document({
  openapi: "3.1.0",
  info: {
    title: "Latitude API",
    version: "1.0.0",
    description: "The Latitude public API. Authenticate using an API key via the `Authorization: Bearer` header.",
  },
  servers: [{ url: "https://api.latitude.so", description: "Production" }],
})

const here = dirname(fileURLToPath(import.meta.url))
const outPath = resolve(here, "../openapi.json")

await writeFile(outPath, `${JSON.stringify(spec, null, 2)}\n`, "utf-8")
console.log(`OpenAPI spec written to ${outPath}`)
