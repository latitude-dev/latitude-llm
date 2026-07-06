---
name: api-endpoints
description: Adding or changing API operations in `@repo/operations`. One source of truth (`defineOperation` + a Zod schema) becomes an HTTP endpoint, an OpenAPI operation, an MCP tool, TS + Python SDK methods, a `latitude` CLI command, and an in-process agent tool — descriptions and contracts must be written with all of these readers in mind.
---

# Adding API operations

**When to use:** Adding a new operation to the public API, changing an existing one, or wondering why `mcp.json` / `openapi.json` / the SDK aren't in sync.

## Before you start — reuse the UI's logic via the domain layer

When you add a new operation, check whether the same action or read is already available in the web UI. The goal isn't full surface parity, it's not duplicating logic that the web already implements.

For each new operation, open **`apps/web/src/domains/<entity>/<entity>.functions.ts`**. Three cases:

- **The web's server fn already calls a domain use-case** (imports `*UseCase` from `@domain/*`): reuse that use-case in the operation. Don't reimplement the logic.
- **The web's server fn has the logic inline** (raw repository calls, validation, side effects in the server fn body itself): **extract it into a new domain use-case first**, then have both the web server fn AND your operation call it. The domain use-case becomes the shared seam.
- **The web's server fn delegates to a third-party API** like `getBetterAuth().api.*`: the API process can't reach the same in-process instance. Write a domain use-case that replicates that behavior (carefully — read the third-party source so your use-case matches its rules), then point both the web and the operation at the use-case. Adds parity tests so the migration doesn't silently drift.

The domain use-case is the shared seam between web and API. Duplicating logic in both surfaces creates drift — one gets a bug fix the other doesn't.

If the entity doesn't have a `.functions.ts` because the UI doesn't expose this action yet, you're designing fresh. That's fine; just don't lose the option to share later — put the business logic in a `@domain/*` use-case from the start rather than inline in the operation.

## What you're really doing

Every operation in `packages/operations` is **one declaration that fans out into every generated surface**:

| Surface | Generated from | Consumed by |
| --- | --- | --- |
| HTTP route (Hono) | `route.method` + `route.path` + `execute`/`handler` | curl, internal services — mounted by `apps/api` |
| OpenAPI operation | `route.name` (→ `operationId`), `route.description`, request/response schemas | `apps/api/openapi.json` — the source Fern reads for the SDKs + CLI |
| MCP tool | `route.name`, `route.description`, flattened input + 2xx-JSON output schema | `apps/api/mcp.json`, runtime `/v1/mcp` transport |
| TS + Python SDK methods | Fern reads `openapi.json`; `group`/`sdkMethod` name the method | end-user TypeScript (`@latitude-data/sdk`) and Python (`latitude-sdk`) code |
| `latitude` CLI command | Fern reads `openapi.json` | shell users + AI agents (`latitude <resource> <verb>`, `--help`, `--schema`) |
| In-process agent tool | `defineToolset({ groups })` selection over execute-form operations | internal AI agents (e.g. the signal-creation agent) — no HTTP, no tokens |

You don't write these configs separately. You write one. The machinery in `packages/operations/src/core/*` derives the MCP tool and agent tools, and Fern derives the SDKs + CLI from `openapi.json`.

This means: **the descriptions you put on routes and on schema fields are read by SDK users, by AI agents calling the MCP or an internal toolset, AND by CLI users (as `--help`/`--schema` text)**. Treat every `description` as user-facing copy. Vague or absent descriptions are bugs.

## Recipe: add a new operation module

### 1. Create `packages/operations/src/operations/<resource>.ts`

Prefer **execute-form** (`execute` + `typedResponses`) for new operations — it's transport-neutral, so the operation is eligible for in-process agent toolsets and gets a typed status/body union. `handler`-form (a raw Hono handler + `openApiResponses`) still exists on unconverted modules; convert opportunistically when touching one.

```ts
import { createRoute, z } from "@hono/zod-openapi"
import { Effect } from "effect"
import { defineOperation } from "../core/define-operation.ts"
import type { OperationModule } from "../core/mount.ts"
import { jsonBody, PROTECTED_SECURITY, typedResponses } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

// Step 1: declare the mount path once; the module carries it.
const widgetsPath = "/widgets"

// Step 2: bind the operation factory to the Env type AND the path.
const widgetOperation = defineOperation<OrganizationScopedEnv>(widgetsPath)

// Step 3: define the boundary schemas. EVERY field gets `.describe(...)` if its
// purpose isn't obvious from the name. Descriptions land in `openapi.json`
// (SDK docstrings), `mcp.json` (MCP tools), and agent toolsets.
const WidgetSchema = z
  .object({
    id: z.string().describe("Stable identifier; safe to use as a primary key in client storage."),
    name: z.string().describe("Human-readable label, unique within an organization."),
    createdAt: z.string().describe("ISO-8601 timestamp of creation."),
  })
  .openapi("Widget") // ← registers a named OpenAPI component (needed by Fern). Different from `.openapi({ description })`.

const CreateWidgetBody = z
  .object({
    name: z.string().min(1).describe("Display name for the new widget. Must be non-empty."),
  })
  .openapi("CreateWidgetBody")

// Step 4: declare each operation.
const createWidget = widgetOperation({
  route: createRoute({
    method: "post",
    path: "/",
    name: "createWidget", // ← camelCase. Becomes OpenAPI `operationId` AND MCP tool name.
    annotations: { readOnlyHint: false, destructiveHint: false }, // ← required; see "Tool annotations" below.
    tags: ["Widgets"],
    group: "widgets", // ← SDK group (x-fern-sdk-group-name) AND agent-toolset selector. Declare right after `tags`.
    sdkMethod: "create", // ← SDK method name inside the group (x-fern-sdk-method-name).
    summary: "Create widget", // ← short label; falls through to MCP tool `title`.
    description: "Creates a widget in the caller's organization. Returns the persisted record.",
    security: PROTECTED_SECURITY,
    request: { body: jsonBody(CreateWidgetBody) },
    responses: typedResponses({ status: 201, schema: WidgetSchema, description: "Widget created" }),
  }),
  rateLimitTier: "low", // ← declarative; apps/api maps it to middleware at mount time.
  execute: (input, ctx) =>
    Effect.gen(function* () {
      // input.body / input.params / input.query are pre-validated; ctx carries
      // organization, auth, and clients. Pipe your layers exactly as before:
      // .pipe(withPostgres(..., ctx.postgresClient, ctx.organization.id), withTracing)
      const widget = yield* createWidgetUseCase({ name: input.body.name })
      return { status: 201, body: toResponse(widget) } as const
    }).pipe(/* withPostgres(...), withTracing */),
})

// Step 5: export the module — mount order within `operations` is meaningful
// (Hono matches static-before-param routes in registration order).
export const widgetsModule: OperationModule = {
  path: widgetsPath,
  operations: [createWidget],
}
```

Execute-form notes:

- **`typedResponses`** is the literal-keyed twin of `openApiResponses` (identical runtime output). It makes the `{ status, body }` union checkable: declared non-2xx variants (400/401/404) are returnable values; domain failures left in the Effect error channel re-throw and reach `honoErrorHandler` exactly as in handler-form. Keep its response keys literal — deriving them from a generic collapses the inference under tsgo (see the comment on `typedResponses`).
- **`ctx`** (`OperationContext`) carries `organization`, `auth`, and the platform clients — everything the old `c.var` provided. Tenancy is baked in: the organization is resolved before `execute` runs and is never part of the input.
- **`input`** contains only the sections the route declares (`params` / `query` / `body`), already validated.

### 2. Register the module in `packages/operations/src/operations/index.ts`

Add the import and one entry to `operationModules`. **Position = mount position**: `openapi.json` path order and `mcp.json` tool order derive from it, so append new modules at the end unless there's a routing reason not to.

### 3. Regenerate manifests

```bash
pnpm openapi:emit   # rewrites apps/api/openapi.json
pnpm mcp:emit       # rewrites apps/api/mcp.json
```

Both files are checked in. CI guards against drift, so commit them alongside the module.

The TS + Python SDKs and the `latitude` CLI all regenerate from `openapi.json` via Fern — `pnpm generate:sdk` (both SDKs), `pnpm generate:cli` (CLI), or `pnpm generate:all` (all three; needs Docker + a Rust toolchain for the CLI). CI (`api-manifests.yml`) regenerates all of them and fails on drift, so run `pnpm generate:all` and commit the results when your PR changes the surface — otherwise the drift check goes red.

**Always use these `pnpm` scripts — never run `fern generate` directly.** The `generate:sdk:*` scripts pin `--version` (from the SDK's `package.json` / `pyproject.toml`) so the version Fern bakes into the generated Python `client_wrapper.py` `User-Agent` is deterministic; a bare `fern generate` omits it and re-stamps a registry-derived version ("last published + a patch"), which flaps the drift check on every SDK publish. See [`fern/README.md`](../../../fern/README.md).

**Publishing the regenerated surface is version-gated per package — and the CLI is the easy one to miss.** Regeneration only rewrites the generated *source*; each package publishes on push to `development` only when its version advances, and the three track it differently. The SDKs read a manifest: bump `version` in `packages/sdk/typescript/package.json` (TS → npm; publishes when it differs from `npm view`) and in `packages/sdk/python/pyproject.toml` (Python → PyPI; publishes when the version isn't on PyPI). **The CLI has no manifest to bump — its version is the top `## [X.Y.Z]` entry in `packages/cli/CHANGELOG.md`** (its `Cargo.toml` ships `0.0.0`, patched at build via `cargo set-version`), and `publish-cli.yml` no-ops unless that top version has no `cli-<version>` release yet. Since new operations add SDK methods *and* CLI commands, **whenever you bump the SDK versions for new surface, add a matching new `## [X.Y.Z]` entry to `packages/cli/CHANGELOG.md` in the same change** — otherwise the CLI regenerates with the new commands but never ships.

### 4. Tests

- HTTP-level integration tests live in `apps/api/src/routes/<resource>.test.ts` — they stay in `apps/api` on purpose, testing through `registerRoutes` + `app.fetch()` so the full middleware chain (auth, org context, rate limiting, error mapping) runs end-to-end.
- MCP-level integration tests for new tools live in `apps/api/src/mcp/server.test.ts`. Add a case there if the operation exposes behavior worth pinning at the MCP layer too.
- The operation machinery itself (factory, execute wrapper, mount, toolsets) is unit-tested in `packages/operations/src/core/*.test.ts`.
- If the operation joins an agent toolset's group, the toolset's manifest snapshot (`packages/operations/src/toolsets/__snapshots__/*.manifest.json`) will change — review and commit the diff deliberately; that diff IS the "this operation now flows to an agent" review surface.

## Schema descriptions — the rule that matters most

**Every field in every request/response schema needs a description unless the field name is self-explanatory.** Descriptions reach four distinct audiences:

- **SDK users** read them as TypeScript JSDoc / Python docstrings on the generated SDK methods (Fern emits them as `@param` / property comments).
- **AI agents** read them via the MCP tool's `inputSchema` / `outputSchema` — and internal agents read the same schemas through toolsets — to decide what to put in a tool call.
- **CLI users** read them as `--help` text and machine-readable `--schema` output on the generated `latitude` commands.

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

### Don't leak internal implementation into descriptions

User-facing descriptions (route `description`, schema `.describe()`, response `description`) are read by SDK users and AI agents. They aren't release notes for our backend. Keep them about the *contract*, not how we implement it.

Concretely, avoid:

- **Storage mechanics**: "soft-deletes", "hard-deletes", "marks as deleted", "removes from cache", "writes to outbox", "RLS-scoped", "via the admin connection". Just say "deletes" / "revokes" / "creates".
- **Side-effect details on related data**: "Traces remain in storage but the project no longer appears in lists.", "The associated rows are kept for auditing." If the caller can't observe it through the API, don't mention it.
- **Internal table or column names**, queue names, worker names, event-bus topics.
- **Comments about why the code is structured a certain way** — those belong in code comments, not in `description:`.

Examples:

```ts
// Bad — leaks soft-delete + retention behavior of an unrelated entity
description: "Soft-deletes a project by slug. Traces remain in storage but the project no longer appears in lists."
// Good
description: "Deletes a project by slug."

// Bad — describes the mechanism
description: "Revokes an API key by setting deletedAt and busting the Redis cache."
// Good
description: "Revokes an API key."
```

Same rule for the verbs used in route/operation `summary`: "Delete project" beats "Soft-delete project".

## Rate limiting — every operation declares its own tier

`rateLimitTier` is a **required-in-practice** field on the operation args: `mountOperationModules` throws at mount time on a missing tier, and the emit scripts boot the same assembly, so an undeclared tier can't ship. `apps/api` maps the tier to `createTierRateLimiter(tier)` middleware attached to **this exact (method, path) pair only**, keyed on the authenticated org id (not IP), so one tenant's traffic doesn't eat another's quota and a stricter tier on `DELETE /:id` doesn't fire on `GET /:id`.

### Picking a tier

Default to `low`. Most CRUD operations don't need more — `low` is 100 req/min/org, which comfortably covers SDK polling, MCP tool calls, and human-driven dashboards. Step up only when the operation genuinely warrants tighter limits.

| Tier | Quota (per org / min) | Pick this when… |
| --- | --- | --- |
| `low` | 100 | **The default**: id-keyed CRUD, list of bounded size, simple lookups, account/settings reads. Most operations land here. |
| `medium` | 60 | Mutations with non-trivial side effects, and moderate analytics reads. |
| `high` | 15 | Bulk reads with filter / search / semantic / vector load that scan large data sets per request. |
| `ultra` | 3 | Workflow-kicking ops: imports, exports, monitor-signal, anything that sends email or enqueues a heavy job. |
| `max` | 1 | Unauthenticated or abuse-prone surfaces (used with extra global limiting; see `routes/bootstrap.ts`). |

Don't be harsh. A tighter tier doesn't make the API safer in any meaningful way for cheap operations — it just frustrates legitimate callers. When in doubt, pick `low` and bump it later if a specific operation shows up in incident traffic.

## Choosing route names and shapes

- **`name`** is camelCase, verb-first, and reads like an SDK method: `createApiKey`, `listProjects`, `assignSavedSearch`. Avoid resource-prefixed names that read awkwardly as SDK calls (`apiKeysList` → use `listApiKeys`).
- **`group` / `sdkMethod`** name the Fern SDK surface (`client.<group>.<sdkMethod>()`) and are renamed in place to the `x-fern-*` extensions — declare them right after `tags` (emitted key order follows declaration order, and the checked-in `openapi.json` is diffed byte-for-byte in CI). `group` doubles as the agent-toolset selector.
- **`description`** on the route is the single-line tool/method blurb. Treat it as the first sentence an SDK user or AI agent sees when discovering the operation.
- **`summary`** is optional, shorter, and becomes the MCP tool `title`. Falls back to `name` when omitted.

## Tool annotations — declare read/destructive intent

Every tool-eligible operation **must** carry an `annotations` object on its `createRoute` config (alongside `name` / `summary` / `description`). It maps to the MCP spec's [`ToolAnnotations`](https://modelcontextprotocol.io/specification) and tells MCP clients how cautious to be before calling the tool. `readOnlyHint` and `destructiveHint` are **required** — TypeScript won't let you define an operation without them; the other two hints are optional. (`title` is intentionally not settable here — it's already derived from `summary`/`name`.)

```ts
annotations: { readOnlyHint: false, destructiveHint: true },
```

**The spec's framing for `destructiveHint`.** The MCP spec splits writes into **additive** vs **destructive**: a write is *destructive* if it can **delete or overwrite** existing values (the prior value is lost), and *additive* if it only adds without touching what's already there. That's why an in-place `update*` is `destructiveHint: true` even though it isn't a delete — overwriting a stored name/settings/cell replaces the previous value. The spec also says `destructiveHint` is **only meaningful when `readOnlyHint` is `false`**, and it **defaults to `true`** — so when you're unsure about a non-additive write, prefer `true`.

| Hint | Meaning | Set it to… |
| --- | --- | --- |
| `readOnlyHint` (required) | The tool only reads; it never writes/mutates anything. | `true` for pure reads (GET lists, gets, analytics, histograms — even when the request uses POST for a complex query body). `false` for anything with a side effect: writes, deletes, enqueued jobs, emails, generated export artifacts. |
| `destructiveHint` (required) | A write may delete or overwrite existing data. Only meaningful when `readOnlyHint` is `false`. | `true` for deletes/revokes/removes and in-place updates that overwrite prior values. `false` for purely additive creates/inserts, and for reversible state toggles (mute/unmute, monitor/unmonitor, resolve, restore, reorder). For read-only tools, set `false`. |
| `idempotentHint` (optional) | Repeating an identical call has no effect beyond the first. | Usually omit. |
| `openWorldHint` (optional) | The tool touches entities outside the caller's Latitude organization. | Usually omit (our surface is org-scoped). |

Rules of thumb:

- **Reads** (`GET`, or `POST` used only to carry a search/filter body) → `{ readOnlyHint: true, destructiveHint: false }`.
- **Creates / inserts / additive actions** (`create*`, `insert*`, `add*`, `invite*`, `import*`) → `{ readOnlyHint: false, destructiveHint: false }`.
- **In-place updates** (`update*`, edits that overwrite stored values) → `{ readOnlyHint: false, destructiveHint: true }`.
- **Deletes / revokes / removes** → `{ readOnlyHint: false, destructiveHint: true }`.
- **Reversible state toggles** (`mute*`/`unmute*`, `monitor*`/`unmonitor*`, `resolve*`, `restore*`, `reorder*`) → `{ readOnlyHint: false, destructiveHint: false }` — they change state but don't destroy data.
- **Exports** that enqueue a job, send an email, or write an artifact are **not** read-only → `{ readOnlyHint: false, destructiveHint: false }`.

When you add or modify a tool operation, set these to match what the implementation actually does — a wrong `readOnlyHint`/`destructiveHint` misleads agents about how risky the call is. Beyond MCP clients, `readOnlyHint` is **load-bearing for agent toolsets**: `defineToolset` refuses non-read-only operations, so a wrong hint either leaks a mutation to an agent or blocks a legitimate read. The annotations are stripped before the route reaches the OpenAPI generator, so they appear only in `mcp.json` and the live MCP transport, never in `openapi.json`.

## Agent toolsets — exposing operations to internal AI agents

`defineToolset` (in `packages/operations/src/core/toolset.ts`) selects operations by `group` and shapes them as in-process tools (`invoke(rawFlatInput, ctx)` — validate, split, `execute`; no HTTP, no tokens). Selection is asserted at definition time: every group must match, every exclude must exist, and every selected operation must be tool-eligible, `readOnlyHint: true`, and execute-form. Concrete toolsets live in `packages/operations/src/toolsets/` (they can't live in `@domain/*` — that would create a package cycle, since `@repo/operations` imports domain packages).

Adding an operation to a selected group automatically adds it to the toolset — the toolset's checked-in manifest snapshot test fails until you regenerate and commit it, which is the deliberate review gate. Tenancy note for toolset consumers: build `OperationContext` from an already-resolved organization; the model-visible input never carries org identity.

## Opting out of MCP per-route

Some operations shouldn't be tools — they make sense for HTTP/SDK clients but not for AI agents (e.g. internal lifecycle endpoints, web-only callbacks). Pass `tool: false`:

```ts
const internalReindex = widgetOperation({
  route: createRoute({ ... }),
  handler: async (c) => { ... },
  tool: false, // ← HTTP route is mounted, MCP tool is skipped
})
```

## Verification checklist

Run before opening the PR:

```bash
pnpm --filter @repo/operations typecheck && pnpm --filter @repo/operations test
pnpm --filter @app/api typecheck
pnpm --filter @app/api test
pnpm openapi:emit && git diff --exit-code apps/api/openapi.json   # no drift
pnpm mcp:emit && git diff --exit-code apps/api/mcp.json           # no drift
```

Spot-check both manifests by hand: open `apps/api/mcp.json` and `apps/api/openapi.json`, find your operation, confirm every field has a `description`. If something is missing, it'll silently degrade SDK docs and agent UX — fix it at the Zod schema, not in the JSON output. In `mcp.json`, also confirm your tool's `annotations.readOnlyHint` / `annotations.destructiveHint` match what the implementation actually does (see "Tool annotations" above).

## Where the machinery lives

If you need to debug the auto-generation pipeline:

- `packages/operations/src/core/define-operation.ts` — `defineOperation` factory; baked-in `prefix`, dual `execute`/`handler` form, in-place `group`/`sdkMethod` → x-fern rename, `mountHttp` registers with the MCP registry on tool-eligible mounts.
- `packages/operations/src/core/execute.ts` — `OperationInput`/`OperationOutput` inference and the generated Hono handler around `execute`.
- `packages/operations/src/core/mount.ts` — `mountOperationModules`; applies `rateLimitTier` middleware, throws on missing tiers.
- `packages/operations/src/core/registry.ts` — module-global operation registry; `collectToolDescriptors()` emits the snapshot used by both the runtime MCP transport and `mcp:emit`.
- `packages/operations/src/core/toolset.ts` / `core/invoke.ts` — agent toolset selection + in-process invocation.
- `packages/operations/src/operations/index.ts` — the ordered module manifest (mount order lives here).
- `apps/api/src/mcp/server.ts` — per-request MCP server, dispatches each tool call back through `rootApp.fetch()` so the full middleware chain (auth, rate-limit, org-context, validation) re-runs on every inner call.
- `apps/api/scripts/emit-openapi.ts` / `apps/api/scripts/emit-mcp.ts` — boot the route registry with stub clients and serialize the manifests.
- `packages/operations/src/openapi/schemas.ts` and `openapi/pagination.ts` — shared boundary primitives (security scheme, `typedResponses`, `Paginated(...)`, common param schemas).

## Related skills

- [code-style](../code-style/SKILL.md) — Zod-first contracts, naming conventions, literal-union enums.
- [architecture-boundaries](../architecture-boundaries/SKILL.md) — web vs API split, machine-facing surface invariants.
- [authentication](../authentication/SKILL.md) — how `c.var.auth` / `c.var.organization` get populated on protected routes.
- [testing](../testing/SKILL.md) — Vitest harness layout, `setupTestApi` for HTTP-level integration tests.
