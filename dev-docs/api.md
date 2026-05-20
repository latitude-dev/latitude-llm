# Public API

`apps/api` is Latitude's stable public REST surface. It runs as its own Hono process (default `localhost:3001`) and exposes every machine-facing capability of the product under `/v1`. The same routes power the auto-generated TypeScript SDK and the in-process MCP server — see [`sdk.md`](./sdk.md) and [`mcp.md`](./mcp.md).

For the step-by-step "how to add or change a route" recipe, see the [`api-endpoints` skill](../.agents/skills/api-endpoints/SKILL.md). This doc describes how the surface is *wired*; the skill describes how to *use* it.

## One declaration, four surfaces

Every endpoint is a single call to `defineApiEndpoint({ route, handler })` that fans out to:

- An HTTP route on the Hono router.
- An OpenAPI operation in `apps/api/openapi.json`.
- An MCP tool in `apps/api/mcp.json` (registered automatically; opt out with `tool: false`).
- A TypeScript SDK method (Fern reads the OpenAPI doc and emits one method per operation).

There is no second registration step for any of those surfaces. The `defineApiEndpoint` factory and the manifest emitters in `apps/api/src/mcp/*` derive them all from the same Zod schemas. Schema descriptions (`.describe(...)`) propagate to both SDK JSDoc and MCP tool metadata — every field's description is product copy seen by SDK users *and* AI agents.

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
      /v1/mcp   ← MCP transport, per-request McpServer
```

Public routes are bodyless metadata documents — never product data. Everything that touches an organization runs under the protected ring.

## Per-route rate limiting

`createTierRateLimiter(tier)` is keyed on `c.var.organization.id`, so one tenant's traffic can't eat another's quota. Tiers are attached per `(method, path)` pair via the variadic argument to `mountHttp`, not via `app.use(prefix, …)` — the latter is path-matched (not method-matched) and stacks unpredictably.

| Tier | Quota (per org/min) | Typical use |
| --- | --- | --- |
| `low` | 100 | Default. ID-keyed CRUD, simple lookups, account/settings reads. |
| `medium` | 60 | Mutations with non-trivial side effects (email, fan-out writes). |
| `high` | 15 | Bulk reads with filter/search/vector load. |
| `critical` | 3 | Imports, exports, monitor-issue — anything that enqueues a heavy job or sends email. |

Default to `low`. Pick a tighter tier only when an endpoint genuinely warrants it.

## Manifests on disk

`apps/api/openapi.json` and `apps/api/mcp.json` are checked into the repo. They're the contract the SDK and MCP server consume, so they need to stay in sync with the route source.

```bash
pnpm openapi:emit   # rewrites apps/api/openapi.json
pnpm mcp:emit       # rewrites apps/api/mcp.json
```

CI guards drift via `.github/workflows/api-manifests.yml`: on every PR, both emitters run and `git diff --exit-code` fails the job if the committed manifests don't match the regenerated ones.

## Sharing logic with the web

`apps/web` and `apps/api` both orchestrate the same domain use-cases — they're parallel consumers of `packages/domain/*`, not nested (the web does not call through to the API for its own product features). When you add an endpoint that mirrors a web action, reuse the existing `@domain/<entity>/use-cases/*` use-case rather than reimplementing the policy in the API route. If the web has the logic inline in a server fn, extract it to a use-case first.

The domain use-case is the shared seam. Anything that duplicates business rules in both surfaces is drift waiting to happen.

## Tests

- HTTP-level integration tests live alongside each route file: `apps/api/src/routes/<resource>.test.ts`. They exercise the endpoint through `app.fetch()` so the entire middleware chain runs.
- MCP-level tests for the dispatcher behavior live in `apps/api/src/mcp/server.test.ts`.
- Auth middleware behavior is pinned in `apps/api/src/middleware/auth.test.ts`.

The test harness (`apps/api/src/test-utils/create-test-app.ts`) boots the full app with an in-memory Postgres (PGlite), an in-memory ClickHouse (chdb), a fake Redis, and stub queue/workflow clients — no external services required.

## Where the code lives

| | Path |
| --- | --- |
| Routes | `apps/api/src/routes/` |
| `defineApiEndpoint`, registry, MCP server | `apps/api/src/mcp/` |
| Shared OpenAPI primitives (`Paginated`, `PROTECTED_SECURITY`, `jsonBody`) | `apps/api/src/openapi/` |
| Auth + rate-limit middleware | `apps/api/src/middleware/` |
| Manifest emitters | `apps/api/scripts/{emit-openapi,emit-mcp}.ts` |
| API-key validator | `packages/platform/api-key-auth/` |
| OAuth access-token validator | `packages/platform/oauth-token-auth/` |

## Related docs

- [`mcp.md`](./mcp.md) — MCP server architecture and the OAuth discovery flow.
- [`sdk.md`](./sdk.md) — TypeScript SDK pipeline (Fern config, versioning, exclusions).
- [`authentication.md`](./authentication.md) — web-side Better Auth, sessions, OAuth consent page.
- [`api-endpoints` skill](../.agents/skills/api-endpoints/SKILL.md) — concrete recipe for adding routes.
