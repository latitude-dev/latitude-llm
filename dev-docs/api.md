# Public API

`apps/api` is Latitude's stable public REST surface. It runs as its own Hono process (default `localhost:3001`) and exposes every machine-facing capability of the product under `/v1`. The same routes power the auto-generated TypeScript SDK and the in-process MCP server — see [`sdk.md`](./sdk.md) and [`mcp.md`](./mcp.md).

For the step-by-step "how to add or change a route" recipe, see the [`api-endpoints` skill](../.agents/skills/api-endpoints/SKILL.md). This doc describes how the surface is *wired*; the skill describes how to *use* it.

## One declaration, four surfaces

Every endpoint is a single call to `defineOperation({ route, execute })` (or legacy `handler`-form) in `packages/operations` that fans out to:

- An HTTP route on the Hono router.
- An OpenAPI operation in `apps/api/openapi.json`.
- An MCP tool in `apps/api/mcp.json` (registered automatically; opt out with `tool: false`).
- A TypeScript SDK method (Fern reads the OpenAPI doc and emits one method per operation).

There is no second registration step for any of those surfaces. The `defineOperation` factory (`packages/operations/src/core/*`) and the manifest emitters derive them all from the same Zod schemas. Execute-form operations are additionally selectable as in-process agent tools via `defineToolset`. Schema descriptions (`.describe(...)`) propagate to both SDK JSDoc and MCP tool metadata — every field's description is product copy seen by SDK users *and* AI agents.

## Authentication

Routes under `/v1` accept **either** an organization-scoped API key **or** an OAuth2 access token. Both are opaque random strings carried as `Authorization: Bearer …`. The auth middleware tries validators in order:

```
authenticate(c) → AuthContext | 401
  bearer = extractBearerToken(c) ?? throw 401
  return authenticateWithApiKey(bearer)
      ?? authenticateWithOAuth(bearer)
      ?? 401
```

Both validators have a short negative-cache TTL (~5s), so an unknown bearer hits each underlying datastore at most once per cache window.

The one exception is `/v1/mcp`, which admits OAuth bearers only — see [`mcp.md`](./mcp.md). It runs in the same protected ring; the transport handler rejects an `api-key` `AuthContext` with a 401 before it starts a session.

Every 401 the error handler emits carries `WWW-Authenticate: Bearer resource_metadata="<LAT_API_URL>/.well-known/oauth-protected-resource"` (RFC 9728 §5.1), which is how a spec-following MCP client discovers the authorization server instead of guessing the well-known path. The GitHub webhook's signature 401 returns its response directly and is deliberately not a bearer challenge.

### `AuthContext` shape

```ts
export type AuthContext =
  | { method: "api-key"; userId: UserId /* "api-key:<keyId>" */; organizationId: OrganizationId }
  | { method: "oauth";   userId: UserId; organizationId: OrganizationId; oauthClientId: string;
                         scopes: ReadonlyArray<string>; expiresAt: Date }
```

The middleware writes the chosen variant onto `c.var.auth`. `c.var.organization` carries the resolved org. Routes that need a human actor (e.g. annotation `annotatorId`) read `c.var.auth.method === "oauth" ? c.var.auth.userId : null`.

### Validators

Both validators live in dedicated platform packages so they can be reused by other resource servers without pulling in HTTP middleware:

- `packages/platform/api-key-auth` — `validateApiKey(token, deps)`. Looks up the org-scoped API key, decrypts the AES-256-GCM-encrypted token, returns an `api-key` `AuthContext`.
- `packages/platform/oauth-token-auth` — `validateOAuthAccessToken(token, deps)`. Joins `oauth_access_tokens → oauth_applications`, rejects on expired token / disabled application / missing org binding, returns an `oauth` `AuthContext`. Pure Drizzle — no Better Auth dependency on the API side.

Both follow the same caching shape:

- Cache key is `sha256(token)`, never the raw bearer. Defense in depth against a Redis dump.
- TTL is `min(300s, secondsUntilExpiry)`. Cached entries can never outlive the underlying token.
- Expiry is re-checked on cache hit (belt-and-suspenders for clock skew or wrong TTL math).
- Fail-open on Redis errors: timeout → fall through to DB. DB is the source of truth.

## Middleware ring structure (`apps/api/src/routes/index.ts`)

```
attachSharedContext(db, redis, clickhouse, queue)   ← all routes

  RING 1 — public:
    /health
    /.well-known/oauth-protected-resource    ← static JSON discovery doc

  RING 2 — protected (unified auth):
    validationErrorMiddleware
    createAuthRateLimiter()              ← global IP-based brute-force guard
    createAuthMiddleware()               ← API-key OR OAuth dispatch
    createOrganizationContextMiddleware()

      /v1/...   ← all REST routes, with per-endpoint tier limiters
      /v1/mcp   ← MCP transport, per-request McpServer (OAuth bearers only)
```

Public routes are bodyless metadata documents — never product data. Everything that touches an organization runs under the protected ring.

## Per-route rate limiting

`createTierRateLimiter(tier)` is keyed on `c.var.organization.id`, so one tenant's traffic can't eat another's quota. Tiers are declared per operation via the `rateLimitTier` field; `mountOperationModules` attaches the middleware per `(method, path)` pair and throws on a missing tier at mount (and emit) time.

| Tier | Quota (per org/min) | Typical use |
| --- | --- | --- |
| `low` | 100 | Default. ID-keyed CRUD, simple lookups, account/settings reads. |
| `medium` | 60 | Mutations with non-trivial side effects (email, fan-out writes). |
| `high` | 15 | Bulk reads with filter/search/vector load. |
| `ultra` | 3 | Imports, exports, monitor-signal — anything that enqueues a heavy job or sends email. |
| `max` | 1 | Unauthenticated or abuse-prone surfaces (paired with a global limiter). |

Default to `low`. Pick a tighter tier only when an endpoint genuinely warrants it.

## Manifests on disk

`apps/api/openapi.json` and `apps/api/mcp.json` are checked into the repo. They're the contract the SDK and MCP server consume, so they need to stay in sync with the route source.

```bash
pnpm openapi:emit   # rewrites apps/api/openapi.json
pnpm mcp:emit       # rewrites apps/api/mcp.json
```

CI guards drift via `.github/workflows/api-manifests.yml`: on every PR, both emitters run and `git diff --exit-code` fails the job if the committed manifests don't match the regenerated ones.

## Global parameters

A **global parameter** is a value a generated client resolves once instead of on every call. We declare them in `API_GLOBAL_PARAMETERS` (`apps/api/src/constants.ts`); `emit-openapi.ts` writes them to the spec root as [`x-fern-global-parameters`](https://buildwithfern.com/learn/api-definitions/openapi/extensions/global-parameters).

Today there is exactly one: `projectSlug`, which 119 of our 139 operations take as a path parameter. It lets CLI users export `LATITUDE_PROJECT_SLUG` once instead of passing `--project-slug` to every command.

```
--project-slug (per-operation flag)  →  --global-project-slug  →  $LATITUDE_PROJECT_SLUG
```

Leftmost wins. Nothing about the underlying parameter changes: it stays `required: true` in `openapi.json` and a non-optional string in the IR. `target` just names the `{…}` slot in the path template that the resolved value fills at request-build time. The CLI never enforces path parameters at parse time (only multipart fields are clap-`required`), so omitting the flag parses fine and the global injects the value before the URL is rendered.

Three settings are load-bearing and easy to "simplify" into a bug:

- **`apply: explicit`** — a path global is injected into every operation that opts in. Under `apply: auto` that means *all* operations, and one with no `{projectSlug}` in its template would carry the value as a stray query parameter (`/v1/projects?projectSlug=…`). `emit-openapi.ts` derives the per-operation `x-fern-global-parameter` opt-in from the parameters each operation already declares, so the two can't drift.
- **`parameter-name`** — derived in `emit-openapi.ts` as `global<Target>` (`globalProjectSlug` → `--global-project-slug`), never left to default. The global's flag must avoid `--project-slug`. When a global's flag name collides with a per-operation flag, the generator can't register it `global(true)` (clap rejects duplicate long names), so it attaches it per-leaf and skips the colliding commands, falling back to reading `env` itself. That fallback hangs off `try_get_one` returning `Err` for an unknown arg id — and clap's `verify_arg` is entirely inside `#[cfg(debug_assertions)]`, so a release build returns `Ok(None)` and never reaches it. The env var works in `cargo build` and silently fails in every shipped binary. A non-colliding name keeps the arg on the `global(true)` path, where clap's own `.env()` does the work. Name it after the target it backs and the feature dies in release only. This is not a regression to downgrade around: before generator 0.38.3 a colliding global had no env fallback at all.
- **`env`** — the only reason to prefer this extension over [`x-fern-sdk-variables`](https://buildwithfern.com/learn/api-definitions/openapi/extensions/sdk-variables), which derives its env var from the variable name (`PROJECT_SLUG`, unprefixed) with no way to override it.

### Surface support

`x-fern-global-parameters` is **CLI-only today**. The Fern CLI lowers it into the IR (`globalParameters`, carrying `env`, `apply` and the `parameter-name` alias), but the TypeScript and Python SDK generators ignore it — Fern's own `seed/ts-sdk/x-fern-global-parameters` fixture still destructures the path parameter out of the request object, and its client options expose no global. Our SDK output is byte-identical with and without the extension. So SDK callers still pass `projectSlug` per method, and `LATITUDE_PROJECT_SLUG` does nothing there. If Fern adds SDK support later, it arrives on a regeneration with no spec change.

`emit-openapi.ts` also appends `envFallbackNote(env)` to the description of each parameter a global backs, so `--project-slug`'s own help names the environment variable. That note is worded for the CLI on purpose: descriptions propagate to SDK JSDoc, where the variable does nothing.

One rough edge remains upstream: per-command `--help` still lists the backed parameter under **Required parameters** and spells it into the usage line even when the environment satisfies it, and `--schema` omits the global entirely because its flag is registered hidden.

## Sharing logic with the web

`apps/web` and `@repo/operations` both orchestrate the same domain use-cases — they're parallel consumers of `packages/domain/*`, not nested (the web does not call through to the API for its own product features). When you add an endpoint that mirrors a web action, reuse the existing `@domain/<entity>/use-cases/*` use-case rather than reimplementing the policy in the API route. If the web has the logic inline in a server fn, extract it to a use-case first.

The domain use-case is the shared seam. Anything that duplicates business rules in both surfaces is drift waiting to happen.

## Tests

- HTTP-level integration tests live alongside each route file: `apps/api/src/routes/<resource>.test.ts`. They exercise the endpoint through `app.fetch()` so the entire middleware chain runs.
- MCP-level tests for the dispatcher behavior live in `apps/api/src/mcp/server.test.ts`.
- Auth middleware behavior is pinned in `apps/api/src/middleware/auth.test.ts`.

The test harness (`apps/api/src/test-utils/create-test-app.ts`) boots the full app with an in-memory Postgres (PGlite), an in-memory ClickHouse (chdb), a fake Redis, and stub queue/workflow clients — no external services required.

## Route classes and their exclusion levels

Not every route belongs on every generated surface. There are three levels, and the mechanism *is* the guarantee — CI's manifest-drift gate makes each one permanent.

| Level | Mechanism | Present on | Example |
| --- | --- | --- | --- |
| 1 | plain `app.post(...)` | HTTP only | `/v1/webhooks/github`, `/v1/private/partners/:partnerId/accounts` |
| 2 | `createRoute` + `app.openapi` | HTTP, OpenAPI, SDK, CLI — not MCP | `/v1/account/bootstrap` |
| 3 | `defineOperation` | everything, plus in-process agent toolsets | `packages/operations/src/operations/*` |

`app.doc` only walks `app.openapi`-registered routes, Fern only reads `openapi.json`, and the MCP registry only holds `defineOperation` entries — so a level-1 route is provably absent from all of them.

**`/v1/private/*` is a route class, not just a prefix.** These are private partner endpoints: level 1, mounted on `v1` ahead of the auth wall, authenticated by per-partner HMAC request signing instead of a bearer token, and never documented. See [`partners.md`](./partners.md).

## Where the code lives

| | Path |
| --- | --- |
| Operation modules | `packages/operations/src/operations/` |
| `defineOperation`, registry, execute/mount/toolset machinery | `packages/operations/src/core/` |
| MCP HTTP transport | `apps/api/src/mcp/server.ts` |
| Shared OpenAPI primitives (`Paginated`, `PROTECTED_SECURITY`, `jsonBody`, `typedResponses`) | `packages/operations/src/openapi/` |
| Non-operation routes (health, well-known, bootstrap, partners) | `apps/api/src/routes/` |
| Auth + rate-limit middleware | `apps/api/src/middleware/` |
| Manifest emitters | `apps/api/scripts/{emit-openapi,emit-mcp}.ts` |
| API-key validator | `packages/platform/api-key-auth/` |
| OAuth access-token validator | `packages/platform/oauth-token-auth/` |

## Trace detail shape

`GET /v1/projects/{projectId}/traces/{traceId}` returns `TraceDetail` with a `conversation` array (OpenTelemetry GenAI messages) instead of separate `system_instructions`, `input_messages`, and `output_messages`. The single field carries the full multi-turn history the domain stores in `TraceDetail.allMessages`. Span detail endpoints are unchanged — they still expose per-span `inputMessages` / `outputMessages`. See [`spans.md`](./spans.md) for how the canonical conversation is built and consumed internally.

## Related docs

- [`mcp.md`](./mcp.md) — MCP server architecture and the OAuth discovery flow.
- [`sdk.md`](./sdk.md) — TypeScript SDK pipeline (Fern config, versioning, exclusions).
- [`authentication.md`](./authentication.md) — web-side Better Auth, sessions, OAuth consent page.
- [`agent-data-access.md`](./agent-data-access.md) — the `queryAnalytics` / `querySpans` analytics read surface exposed through these routes.
- [`partners.md`](./partners.md) — the private, HMAC-authenticated `/v1/private/*` partner surface.
- [`api-endpoints` skill](../.agents/skills/api-endpoints/SKILL.md) — concrete recipe for adding routes.
