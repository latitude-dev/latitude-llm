---
name: api-endpoints
description: Adding or changing routes in `apps/api`. One source of truth (`defineApiEndpoint` + a Zod schema) becomes an HTTP endpoint, an OpenAPI operation, an MCP tool, and a TS SDK method — descriptions and contracts must be written with all four readers in mind.
---

# Adding API endpoints

**When to use:** Adding a new endpoint to `apps/api`, changing an existing one, or wondering why `mcp.json` / `openapi.json` / the SDK aren't in sync.

## What you're really doing

Every endpoint in `apps/api` is **one declaration that fans out four ways**:

| Surface | Generated from | Consumed by |
| --- | --- | --- |
| HTTP route (Hono) | `route.method` + `route.path` + handler | curl, internal services |
| OpenAPI operation | `route.name` (→ `operationId`), `route.description`, request/response schemas | `apps/api/openapi.json` → Fern → TS SDK (`@latitude/sdk-typescript`) |
| MCP tool | `route.name`, `route.description`, flattened input + 2xx-JSON output schema | `apps/api/mcp.json`, runtime `/v1/mcp` transport |
| SDK method | Fern reads the OpenAPI doc | end-user TypeScript code |

You don't write three configs. You write one. The infra in `apps/api/src/mcp/*` derives the other surfaces.

This means: **the descriptions you put on routes and on schema fields are read by SDK users AND by AI agents calling the MCP**. Treat every `description` as user-facing copy. Vague or absent descriptions are bugs.

## Recipe: add a new route file

### 1. Create `apps/api/src/routes/<resource>.ts`

```ts
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { defineApiEndpoint } from "../mcp/index.ts"
import { errorResponse, jsonBody, jsonResponse, openApiResponses, PROTECTED_SECURITY } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

// Step 1: export the mount path as a const. `routes/index.ts` imports this so
// the path is declared exactly once.
export const widgetsPath = "/widgets"

// Step 2: bind the endpoint factory to the Env type AND the path.
const widgetEndpoint = defineApiEndpoint<OrganizationScopedEnv>(widgetsPath)

// Step 3: define the boundary schemas. EVERY field gets `.describe(...)` if its
// purpose isn't obvious from the name. Descriptions land in BOTH `openapi.json`
// (visible to SDK users via Fern-generated docstrings) and `mcp.json` (visible
// to AI agents listing the tools). See the schema-description rules below.
const WidgetSchema = z
  .object({
    id: z.string().describe("Stable identifier; safe to use as a primary key in client storage."),
    name: z.string().describe("Human-readable label, unique within an organization."),
    createdAt: z.string().describe("ISO-8601 timestamp of creation."),
  })
  .openapi("Widget") // ← this `.openapi("Name")` registers the schema as a named OpenAPI component. Different from `.openapi({ description })`.

const CreateWidgetBody = z
  .object({
    name: z.string().min(1).describe("Display name for the new widget. Must be non-empty."),
  })
  .openapi("CreateWidgetBody")

// Step 4: declare each operation with `defineApiEndpoint`.
const createWidget = widgetEndpoint({
  route: createRoute({
    method: "post",
    path: "/",
    name: "createWidget", // ← camelCase. Becomes OpenAPI `operationId` AND MCP tool name.
    summary: "Create widget", // ← short label; falls through to MCP tool `title`.
    description: "Creates a widget in the caller's organization. Returns the persisted record.",
    tags: ["Widgets"],
    security: PROTECTED_SECURITY,
    request: { body: jsonBody(CreateWidgetBody) },
    responses: openApiResponses({ status: 201, schema: WidgetSchema, description: "Widget created" }),
  }),
  handler: async (c) => {
    const { name } = c.req.valid("json")
    // ... use-case call ...
    return c.json({ id: "...", name, createdAt: new Date().toISOString() }, 201)
  },
})

const listWidgets = widgetEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listWidgets",
    summary: "List widgets",
    description: "Returns every widget in the caller's organization, ordered by creation date.",
    tags: ["Widgets"],
    security: PROTECTED_SECURITY,
    responses: {
      200: jsonResponse(z.object({ widgets: z.array(WidgetSchema) }).openapi("WidgetList"), "List of widgets"),
      401: errorResponse("Unauthorized"),
    },
  }),
  handler: async (c) => c.json({ widgets: [] }, 200),
})

// Step 5: export a factory that mounts every endpoint onto a fresh sub-app.
// `mountHttp` registers each tool-eligible endpoint with the MCP registry
// using the prefix baked in at factory time (step 2), so MCP picks them up.
export const createWidgetsRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()
  for (const ep of [createWidget, listWidgets]) ep.mountHttp(app)
  return app
}
```

### 2. Wire it up in `apps/api/src/routes/index.ts`

```ts
import { createWidgetsRoutes, widgetsPath } from "./widgets.ts"
// ...
routes.route(widgetsPath, createWidgetsRoutes())
```

Plain Hono mount — the MCP registration is a side effect of `mountHttp` inside `createWidgetsRoutes()`.

### 3. Regenerate manifests

```bash
pnpm openapi:emit   # rewrites apps/api/openapi.json
pnpm mcp:emit       # rewrites apps/api/mcp.json
```

Both files are checked in. CI guards against drift, so commit them alongside the route file.

The TS SDK regenerates from `openapi.json` via Fern (`pnpm generate:sdk`). Run it locally if your PR is supposed to expose the new method through the SDK — otherwise the next SDK release picks it up.

### 4. Tests

- HTTP-level integration tests live in `apps/api/src/routes/<resource>.test.ts`. Test through `app.fetch()` so middleware runs end-to-end.
- MCP-level integration tests for new tools live in `apps/api/src/mcp/server.test.ts` (see the existing `createApiKey` / `listApiKeys` / `revokeApiKey` cases). Add a case there if the route exposes behavior worth pinning at the MCP layer too.

## Schema descriptions — the rule that matters most

**Every field in every request/response schema needs a description unless the field name is self-explanatory.** Descriptions reach two distinct audiences:

- **SDK users** read them as TypeScript JSDoc on the generated SDK methods (Fern emits them as `@param` / property comments).
- **AI agents** read them via the MCP tool's `inputSchema` / `outputSchema` to decide what to put in a tool call.

Write each description as one short sentence in present tense, like a microcopy label. Examples:

```ts
// Good — tells the agent what the value is FOR
name: z.string().describe("Human-readable label, unique within an organization."),
nextCursor: z
  .string()
  .nullable()
  .describe("Opaque cursor for the next page. `null` when there are no more pages."),

// Not great — restates the field name
name: z.string().describe("The name."),

// Bad — no description at all on a non-obvious field
filters: filterSetSchema, // ← what shape? what semantics? agent has to guess.
```

### `.describe()` vs `.meta()` vs `.openapi()`

| API | When to use |
| --- | --- |
| `.describe("…")` | Default for field-level descriptions. Sugar for `.meta({ description })`. Visible to OpenAPI AND MCP. |
| `.meta({ description, examples, default, ... })` | Equivalent to `.describe()` plus JSON-Schema-standard fields (`examples`, `default`, `title`). Visible to both surfaces. |
| `.openapi("Name")` | **Schema-component registration only** — gives the schema a name under `components.schemas` in OpenAPI. Required for Fern to emit reusable types. Has nothing to do with descriptions. |
| `.openapi({ description, format, example, ... })` | **OpenAPI-only metadata** — `format`, `example`, `param: { in, name }`, etc. Lives in the openapi-extension WeakMap and **does not propagate to MCP**. Avoid for descriptions; use only for things that have no Zod-native equivalent. |

**TL;DR**: prefer `.describe()` / `.meta()`. Use `.openapi("Name")` to register named schema components. Reach for `.openapi({...})` for fields ONLY when you need an OpenAPI-only knob like `format: "uri"`.

If you find yourself writing `.openapi({ description })`, replace it with `.describe()` — descriptions hidden in the openapi WeakMap are invisible to MCP clients, which silently degrades agent UX.

## Choosing route names and shapes

- **`name`** is camelCase, verb-first, and reads like an SDK method: `createApiKey`, `listProjects`, `assignSavedSearch`. Avoid resource-prefixed names that read awkwardly as SDK calls (`apiKeysList` → use `listApiKeys`).
- **`description`** on the route is the single-line tool/method blurb. Treat it as the first sentence an SDK user or AI agent sees when discovering the operation.
- **`summary`** is optional, shorter, and becomes the MCP tool `title`. Falls back to `name` when omitted.

## Opting out of MCP per-route

Some routes shouldn't be tools — they make sense for HTTP/SDK clients but not for AI agents (e.g. internal lifecycle endpoints, web-only callbacks). Pass `tool: false`:

```ts
const internalReindex = widgetEndpoint({
  route: createRoute({ ... }),
  handler: async (c) => { ... },
  tool: false, // ← HTTP route is mounted, MCP tool is skipped
})
```

## Verification checklist

Run before opening the PR:

```bash
pnpm --filter @app/api typecheck
pnpm --filter @app/api test
pnpm openapi:emit && git diff --exit-code apps/api/openapi.json   # no drift
pnpm mcp:emit && git diff --exit-code apps/api/mcp.json           # no drift
```

Spot-check both manifests by hand: open `apps/api/mcp.json` and `apps/api/openapi.json`, find your operation, confirm every field has a `description`. If something is missing, it'll silently degrade SDK docs and agent UX — fix it at the Zod schema, not in the JSON output.

## Where the machinery lives

If you need to debug the auto-generation pipeline:

- `apps/api/src/mcp/define-endpoint.ts` — `defineApiEndpoint` factory; baked-in `prefix`, `mountHttp` registers with the MCP registry on tool-eligible mounts.
- `apps/api/src/mcp/registry.ts` — module-global endpoint registry; `collectToolDescriptors()` emits the snapshot used by both the runtime MCP transport and `mcp:emit`.
- `apps/api/src/mcp/server.ts` — per-request MCP server, dispatches each tool call back through `rootApp.fetch()` so the full middleware chain (auth, rate-limit, org-context, validation) re-runs on every inner call.
- `apps/api/scripts/emit-openapi.ts` / `apps/api/scripts/emit-mcp.ts` — boot the route registry with stub clients and serialize the manifests.
- `apps/api/src/openapi/schemas.ts` and `apps/api/src/openapi/pagination.ts` — shared boundary primitives (security scheme, `Paginated(...)`, common param schemas).

## Related skills

- [code-style](../code-style/SKILL.md) — Zod-first contracts, naming conventions, literal-union enums.
- [architecture-boundaries](../architecture-boundaries/SKILL.md) — web vs API split, machine-facing surface invariants.
- [authentication](../authentication/SKILL.md) — how `c.var.auth` / `c.var.organization` get populated on protected routes.
- [testing](../testing/SKILL.md) — Vitest harness layout, `setupTestApi` for HTTP-level integration tests.
