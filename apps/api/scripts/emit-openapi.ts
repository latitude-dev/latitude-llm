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
import { API_GLOBAL_PARAMETERS, API_INFO, API_SECURITY_SCHEME } from "../src/constants.ts"
import { registerRoutes } from "../src/routes/index.ts"
import type { AppEnv } from "../src/types.ts"

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const

/**
 * A global's own flag must not collide with the per-operation flag it backs, or the
 * CLI reads it through a path whose env fallback is compiled out of release builds.
 * See `dev-docs/api.md`.
 */
const globalFlagName = (target: string) => `global${target.charAt(0).toUpperCase()}${target.slice(1)}`

const envFallbackNote = (env: string) => `The CLI can also read this from the \`${env}\` environment variable.`

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

app.openAPIRegistry.registerComponent("securitySchemes", "ApiKeyAuth", API_SECURITY_SCHEME)

const { servers, ...info } = API_INFO
const spec = app.getOpenAPI31Document({
  openapi: "3.1.0",
  info,
  servers,
  "x-fern-global-parameters": API_GLOBAL_PARAMETERS.map((parameter) => ({
    ...parameter,
    "parameter-name": globalFlagName(parameter.target),
  })),
})

// Opt each operation into the path globals it templates, and tell readers of the
// parameter it backs where else the value can come from. See `dev-docs/api.md`.
const pathGlobals = API_GLOBAL_PARAMETERS.filter((parameter) => parameter.in === "path")
for (const pathItem of Object.values(spec.paths ?? {})) {
  for (const method of HTTP_METHODS) {
    const operation = pathItem[method]
    if (!operation) continue
    const optIns: string[] = []
    for (const global of pathGlobals) {
      const targeted = operation.parameters?.find(
        (parameter) => "in" in parameter && parameter.in === "path" && parameter.name === global.target,
      )
      if (!targeted || !("in" in targeted)) continue
      optIns.push(global.name)
      const existing = targeted.description?.trim()
      const sentence = existing && !/[.!?]$/.test(existing) ? `${existing}.` : existing
      targeted.description = [sentence, envFallbackNote(global.env)].filter(Boolean).join(" ")
    }
    if (optIns.length > 0) operation["x-fern-global-parameter"] = optIns
  }
}

const here = dirname(fileURLToPath(import.meta.url))
const outPath = resolve(here, "../openapi.json")

await writeFile(outPath, `${JSON.stringify(spec, null, 2)}\n`, "utf-8")
console.log(`OpenAPI spec written to ${outPath}`)
