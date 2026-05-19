# Plan: MCP server, OAuth2, and expanded API surface

## Context

Latitude's public surface today is the Hono REST API at `apps/api`, authenticated by an organization-scoped API key. Human users (and the auto-generated TS SDK) work fine on this. AI agents do not — they want an MCP server they can mount, and the OAuth2 flow MCP clients (Claude Code, Cursor, Codex) implement out of the box.

This plan ships three intertwined deliverables:

1. **An auto-generated MCP server** mounted at `/v1/mcp` inside `apps/api`, with tools derived **from the same `@hono/zod-openapi` route definitions** that already power the REST surface. No second source of truth.
2. **Organization-scoped OAuth2** via better-auth's `mcp` plugin (which delegates to its OIDC Provider plugin), layered alongside the existing API-key auth. A user signing in through an MCP client picks an org on a custom consent page; the issued token is bound to that one org for its lifetime.
3. **A much wider product surface** through HTTP — Account, Members, Projects, API Keys, Traces, Annotations, Scores, Saved Searches, Issues, Datasets — so the SDK and MCP can do almost anything the webapp can.

Stack confirmed: `better-auth@1.6.9` (catalog), `@better-auth/core@1.6.9`, `@better-auth/stripe@1.6.9`, and `@modelcontextprotocol/sdk@1.29.0` (commented in `pnpm-workspace.yaml`, to be uncommented in M1).

## Decisions

| # | Decision | Notes |
| - | - | - |
| D1 | **Keep our custom API-key system; add OAuth2 alongside.** Add a code-level `TODO` referencing migration to better-auth's `apiKey` plugin once we're ready. | BA's `apiKey` plugin (per docs) supports **organization-owned API keys** via `references` config. Our keys today are already org-scoped; migrating would unify under one auth backend. Out of scope for this plan. |
| D2 | **MCP at `/v1/mcp` inside `apps/api`.** Not a separate process. | Reuses existing middleware chain (validation, rate-limit, auth, org-context), Effect layers, and Zod schemas. |
| D3 | **Better Auth lives only on the web app.** The API does **not** mount BA. The web's existing BA instance gains the `mcp()` plugin (so `/api/auth/mcp/authorize`, `/api/auth/mcp/token`, `/api/auth/mcp/register`, `/api/auth/oauth2/consent`, and `/api/auth/.well-known/*` are all served by the web). The API only serves `/v1/mcp` plus a tiny static `/.well-known/oauth-protected-resource` advertising the web origin as the AS. Token validation on the API reads `oauth_access_token` directly from shared Postgres via Drizzle — no BA call. | RFC 9728 explicitly allows the AS to live on a different origin than the protected resource. Keeping OAuth on the web origin means the user's browser never crosses origins during sign-in/consent — the existing session cookie on the web is reused as-is. The MCP client only crosses origins for the final `Authorization: Bearer …` API call, which is a header (not a cookie). **No reverse proxy needed in dev or prod.** |
| D4 | **No token prefixes — fall-through dispatch instead.** API keys and OAuth access tokens are both opaque random strings stored verbatim in their respective tables. The auth middleware tries the API-key validator first, falls through to the OAuth validator, and 401s if neither matches. No `lak_` / `loa_` / `lor_` prefixes anywhere — no request rewriters, no response rewriters, no repository-level apply/strip helpers, no validator-level strip. | Simpler everything: one extra Redis + DB round-trip on the OAuth happy path is the entire trade-off, and both validators have a short negative-cache TTL so a known-bad bearer only hits the DB once per cache window. Avoids the in-DB-vs-on-wire mismatch (BA stores raw, BA refresh-grant looks up raw — anything else needs adapter wraps or wire rewriters that we'd have to keep symmetric). |
| D5 | **OAuth org binding via a typed `organization_id` column on `oauth_applications`** — not a new join table, and not the BA `metadata` JSON. At consent time, the web's `/auth/consent` page writes the picked org id directly into the `organization_id` column. The API's auth middleware joins `oauth_access_tokens → oauth_applications` and reads `a.organization_id` from shared Postgres. | Mirrors the existing `api_keys.organization_id + RLS` pattern (single column + FK + soft-delete-aware RLS policy). RLS is enabled scoped by `organization_id`: the settings/keys page on web reads through the regular tenant-scoped connection and only sees MCP clients bound to the active org; abandoned `/api/auth/mcp/register` rows (NULL `organization_id`) are invisible to all tenant queries by design. Token validation on the API uses the admin Postgres connection (same as `api_keys.findByTokenHash`) so it can resolve the bound org without any `set_organization_id` precondition. The two related tables (`oauth_access_tokens`, `oauth_consents`) stay RLS-free because they're only read either via the admin-bypass path (token validation) or via JOIN through the RLS-protected application — defense in depth without RLS-via-EXISTS overhead on the hot path. |
| D6 | **Custom consent page at `${webUrl}/auth/consent`** (NOT `/oauth/consent`). The MCP plugin's `oidcConfig.consentPage` redirects there. The page is a TanStack Start route that reads `?consent_code=…&client_id=…&scope=…`, lists the user's orgs, lets them pick one, then runs a server fn that (a) validates user is a member of the chosen org, (b) updates `oauth_applications.organization_id` for the matching `client_id` (via Drizzle on the web's admin Postgres connection — admin needed to bypass RLS while writing the very binding RLS will check against), and (c) calls `betterAuth.api.oauth2Consent({ accept: true, consent_code })` in-process. | All on web — no cross-process call, no API involvement. `/auth/*` is the existing non-reserved namespace on the web app (`/auth/invite` lives there); `/api/auth/*` is reserved for the BA HTTP handler. |
| D7 | **Slugs regenerate on rename.** Saved-searches already does this (`update-saved-search.ts:62-71` regenerates the slug when the name changes). Apply the same to **projects, organizations, issues, datasets** — anywhere a slug is derived from a name. | URL stability is sacrificed in exchange for slug-tracks-name semantics. Matches the existing pattern; consistency wins. |
| D8 | **`TracesRefSchema` (plural-form sibling of `TraceRefSchema`)** in `packages/domain/spans/src/helpers/trace-ref.ts`. Mirrors the single-trace shape but swaps `by: "id"` → `by: "ids"` and the request-body field name `trace` → `traces`. **No hard cap on resolved trace count** — the UI exports up to 178k today, so the API must not be more restrictive. (A future cap can live in the UI if needed.) | New `resolveTraceIdsFromRef(tracesRef, ctx)` returns `Effect<readonly TraceId[]>`. For `by: "filters"`, paginate through `TraceRepository.listByProjectId` until exhausted. |
| D9 | **Per-route rate-limit tiers** keyed on `c.var.organization.id`. Four presets: `low` 100/min, `medium` (default) 60/min, `high` 15/min, `critical` 3/min. Applied at the route-mount site (`routes.use(prefix, createTierRateLimiter("high"))`). | Org-keyed (not IP) so one tenant can't starve another. Lower than my earlier defaults — the user knows their throughput envelope. |
| D10 | **Per-entity OpenAPI schema files** under `apps/api/src/openapi/entities/<name>.ts`. One named core schema per entity (`.openapi("Project")`); create/update bodies derived via `.pick`/`.omit`/`.partial`. | Stops MCP and HTTP from re-deriving schemas. Stops Fern from emitting two `Project` components. |
| D11 | **MCP toolkit**: `@modelcontextprotocol/sdk@1.29.0` directly + an in-house ~350 LOC adapter modeled on `mattzcarey/hono-mcp-server`'s pattern (decorator metadata + `app.fetch()` dispatch). Uncomment the SDK entry in `pnpm-workspace.yaml` catalog. | Confirmed via the upstream `src/mcp.ts`: route handlers carry per-route metadata; `extractRoutes` walks `app.routes`; tool execution invokes `app.fetch()` internally. We adopt the dispatch pattern but bind metadata through `defineApiEndpoint(...)` (the helper described in D12) rather than a `registerTool` middleware decorator, because our routes already declare `route` + `handler` together via `createRoute`/`app.openapi`. |
| D12 | **`defineApiEndpoint(...)` (renamed from `defineApiOperation`)**. Signature: `{ route: R, handler: RouteHandler<R, E>, tool?: boolean }`. `tool` defaults to `true`. We extend the `createRoute` config so `name: string` (camelCase) and `description: string` are **both required**; `operationId` is set internally from `name` (the existing `operationId` field is dropped from external API). The tool's name = `route.name`; the tool's description = `route.description`; the tool's input/output schema is derived from `route.request` / `route.responses` (flattened — see "MCP auto-generation" below). | Single authoring site per endpoint. The required `name` makes camelCase tool naming deterministic; the required `description` enforces good docs. |
| D13 | **Per-request `McpServer` instance**, stateless transport (`WebStandardStreamableHttpServerTransport`). Tool dispatch uses **`app.fetch(internalRequest)`** to re-enter Hono so the entire middleware chain runs again. Forward `Authorization` and IP headers to preserve auth + rate-limit semantics on the inner call. | Free reuse of the existing middleware chain. Matches the `hono-mcp-server` pattern. |
| D14 | **API key list shows masked tokens** (e.g. `658***********1ceb` — first 4 + asterisks + last 4). **Create returns the full unmasked token.** **Get details returns the full unmasked token** (decrypts via `LAT_MASTER_ENCRYPTION_KEY`) — same as the webapp behavior. | Matches today's UI. Tokens are already AES-256-GCM-encrypted at rest; the `getApiKey` use-case decrypts via the existing repository mapper. |
| D15 | **Issue "monitor" / "unmonitor"** are evaluation-lifecycle operations (start/soft-delete the per-issue `optimizeEvaluationWorkflow` evaluation), extracted from web server-fns into `@domain/evaluations/use-cases/{monitor,unmonitor}-issue.ts`. Monitor body is empty. | Confirmed by reading `apps/web/src/domains/evaluations/evaluation-alignment.functions.ts`. |
| D16 | **Skip the CSV-import-from-file endpoint entirely** (drop from this plan). Leave a `TODO(file-imports)` comment on the dataset routes file describing that we still need a definition for how to upload binary files (CSV today, parquet tomorrow). | Avoids designing multipart now. The "import from traces" endpoint covers the common case. |
| D17 | **Export endpoints are async + email**. The endpoint validates that the `recipientEmail` belongs to a user in the requesting organization, enqueues the export worker, and returns 202. The worker emails a download link. The HTTP response carries no trace/dataset/issue data. | Matches the existing webapp behavior. |
| D18 | **Pagination across the whole API uses one shape** — same as traces/issues today. `Paginated(Item, "PaginatedItem")` returns `{ items, nextCursor, hasMore }`. Projects list (currently flat `{ projects: [...] }`) gets migrated. | Consistency for both SDK and MCP consumers. |
| D19 | **`/v1/mcp` lives behind the unified auth middleware.** The MCP discovery endpoints (`/auth/.well-known/oauth-protected-resource`, `/auth/.well-known/oauth-authorization-server`) live in the **public** ring (BA owns them). Add convenience root-level redirects from `/.well-known/oauth-*` → `/auth/.well-known/oauth-*` because some MCP clients query the root. | Matches what BA's docs recommend. |

## Endpoint inventory

Authoritative list of every HTTP route the plan introduces — per resource, with verb + path. The milestone sections below describe the *work* (use-cases, migrations, schema changes); this section is the *contract*. When in doubt about whether something is in scope, check here first.

```
Members
    - List Members                                              [GET /members]
    - Get Member details                                        [GET /members/{memberId}]
    - Invite Member                                             [POST /members]
    - Update Member                                             [PATCH /members/{memberId}]
        - Role
    - Remove Member                                             [DELETE /members/{memberId}]
Projects
    - List Projects                                             [GET /projects]
    - Get Project details                                       [GET /projects/{projectSlug}]
    - Create Project                                            [POST /projects]
    - Update Project                                            [PATCH /projects/{projectSlug}]
        - Name
        - Settings
        - Flaggers
    - Delete Project                                            [DELETE /projects/{projectSlug}]
API Keys
    - List API Keys (masked)                                    [GET /api-keys]
    - Get API Key details (unmasked)                            [GET /api-keys/{apiKeyId}]
    - Create API Key                                            [POST /api-keys]
    - Update API Key                                            [PATCH /api-keys/{apiKeyId}]
        - Name
    - Delete API Key                                            [DELETE /api-keys/{apiKeyId}]
OAuth Keys                                                       (no tokens ever leave the server — see notes)
    - List OAuth Keys                                           [GET /oauth-keys]
    - Get OAuth Key details                                     [GET /oauth-keys/{oauthKeyId}]
    - Revoke OAuth Key                                          [DELETE /oauth-keys/{oauthKeyId}]
Traces
    - List Traces (including all filters,                       [GET /projects/{projectSlug}/traces]
                   including semantic search filter,
                   keyset pagination)
    - Get Trace details                                         [GET /projects/{projectSlug}/traces/{traceId}]
    - Export Trace/s (via TraceRef/s) (bulk)                    [POST /projects/{projectSlug}/traces/export]
Annotations
    - Create Annotation (via TraceRef)                          [POST /projects/{projectSlug}/annotations]
Scores
    - Create Score (via TraceRef)                               [POST /projects/{projectSlug}/scores]
Searches (saved searches)
    - List Searches                                             [GET /projects/{projectSlug}/searches]
    - Get Search details                                        [GET /projects/{projectSlug}/searches/{searchSlug}]
    - Create Search (including all filters,                     [POST /projects/{projectSlug}/searches]
                     including semantic search filter,
                     just creates does not return traces)
    - Update Search                                             [PATCH /projects/{projectSlug}/searches/{searchSlug}]
        - Name
        - Filters
    - Delete Search                                             [DELETE /projects/{projectSlug}/searches/{searchSlug}]
    - Assign Search to Member                                   [POST /projects/{projectSlug}/searches/{searchSlug}/assign]
Issues
    - List Issues (including all filters,                       [GET /projects/{projectSlug}/issues]
                   keyset pagination)
    - Get Issue details                                         [GET /projects/{projectSlug}/issues/{issueSlug}]
    - Resolve Issue/s (bulk)                                    [POST /projects/{projectSlug}/issues/resolve]
    - Unresolve Issue/s (bulk)                                  [POST /projects/{projectSlug}/issues/unresolve]
    - Ignore Issue/s (bulk)                                     [POST /projects/{projectSlug}/issues/ignore]
    - Unignore Issue/s (bulk)                                   [POST /projects/{projectSlug}/issues/unignore]
    - Monitor (or realign) Issue                                [POST /projects/{projectSlug}/issues/{issueSlug}/monitor]
    - Unmonitor Issue                                           [POST /projects/{projectSlug}/issues/{issueSlug}/unmonitor]
    - Export Issue/s (bulk)                                     [POST /projects/{projectSlug}/issues/export]
Incidents
    - List Incidents (optional from/to + filters by              [GET /projects/{projectSlug}/incidents]
                      sourceTypes, sourceId, kinds, severities)
Datasets
    - List Datasets                                             [GET /projects/{projectSlug}/datasets]
    - Get Dataset details                                       [GET /projects/{projectSlug}/datasets/{datasetSlug}]
    - Create Dataset                                            [POST /projects/{projectSlug}/datasets]
    - Update Dataset                                            [PATCH /projects/{projectSlug}/datasets/{datasetSlug}]
        - Name
    - Delete Dataset                                            [DELETE /projects/{projectSlug}/datasets/{datasetSlug}]
    - List Row/s (including the search query filter,            [GET /projects/{projectSlug}/datasets/{datasetSlug}/rows]
                  keyset pagination)
    - Add Row/s (bulk)                                          [POST /projects/{projectSlug}/datasets/{datasetSlug}/rows]
    - Remove Rows/s (bulk)                                      [DELETE /projects/{projectSlug}/datasets/{datasetSlug}/rows]
    - Import Row/s from File (CSV)                              [POST /projects/{projectSlug}/datasets/{datasetSlug}/rows/import/files]
    - Import Row/s from Traces (via TraceRef/s) (bulk)          [POST /projects/{projectSlug}/datasets/{datasetSlug}/rows/import/traces]
    - Export Rows/s (bulk)                                      [POST /projects/{projectSlug}/datasets/{datasetSlug}/rows/export]
```

**Explicitly out of scope (UI-only):**

- Transfer organization ownership — high-blast-radius, kept on the web with extra confirmation.
- Cancel pending member invitation — covered by the web's invitation lifecycle. Reconsider if real demand emerges.
- Separate "list pending invitations" endpoint — pending invites surface through the web; the API stays focused on confirmed members.
- Create / update OAuth Keys via API — these rows only come into existence through the OAuth consent flow on the web; an API surface to mint them would either bypass the consent UX or duplicate it. The DELETE endpoint exists because revocation is a legitimate machine-driven action (rotating credentials, automation).

**Notes on the OAuth Keys API responses:** never expose `oauth_access_tokens.access_token`, `refresh_token`, or any other secret. The list / get responses return the same metadata the web's OAuth Keys table renders today (client name + icon, authorizing user, `connectedAt`, `disabled`) and nothing else — even masked tokens are out, since unlike API keys there's no flow where the caller would copy a token from this surface.

## Architecture

### Process layout (cross-origin, cookie-free)

```
┌──────────────────────────────────────┐      ┌────────────────────────────────────┐
│ apps/web — app.latitude.so           │      │ apps/api — api.latitude.so         │
│ (TanStack Start)                     │      │ (Hono / OpenAPIHono)               │
│                                      │      │                                    │
│  /login              sign-in UI      │      │  /v1/...   REST + ApiKey/OAuth     │
│  /welcome            org-picker      │      │  /v1/mcp   MCP transport           │
│  /auth/consent       OAuth consent   │      │                                    │
│  /api/auth/*         BA handler      │      │  /.well-known/oauth-protected-     │
│    (incl. mcp/authorize, mcp/token,  │      │     resource                       │
│     mcp/register, oauth2/consent,    │      │     → static JSON pointing at      │
│     .well-known/*)                   │      │       app.latitude.so/api/auth     │
│                                      │      │                                    │
│  getBetterAuth() ◄───────────────────┼─┐    │  no Better Auth here               │
└──────────────────────────────────────┘ │    │                                    │
                                         │    │  validateOAuthAccessToken(token)   │
                                         │    │    ↓ Drizzle SELECT                │
                                         │    │  oauth_access_token JOIN           │
                                         │    │  oauth_application                 │
                                         │    └────────────────────────┬───────────┘
                                         │                             │
                          ┌──────────────▼─────────────────────────────▼──────┐
                          │ packages/platform/db-postgres                     │
                          │   schemas (shared, both processes import):        │
                          │     users, sessions, organizations, members,      │
                          │     invitations, oauthApplication,                │
                          │     oauthAccessToken, oauthConsent                │
                          └───────────────────────────────────────────────────┘
                                              │
                                    ┌─────────▼────────┐
                                    │ Postgres + Redis │
                                    └──────────────────┘
```

The MCP discovery flow (RFC 9728 + RFC 8414):

1. MCP client → `https://api.latitude.so/v1/mcp` no token → 401 + `WWW-Authenticate: Bearer resource_metadata="https://api.latitude.so/.well-known/oauth-protected-resource"`.
2. MCP client → `https://api.latitude.so/.well-known/oauth-protected-resource` → static JSON: `{ "resource": "https://api.latitude.so", "authorization_servers": ["https://app.latitude.so/api/auth"] }`.
3. MCP client → `https://app.latitude.so/api/auth/.well-known/oauth-authorization-server` → BA-served metadata listing the authorize/token/register endpoints (all on the web origin).
4. MCP client opens the user's browser at `https://app.latitude.so/api/auth/mcp/authorize?…`. **Same origin as the existing session cookie** — BA reads it directly. If no session, BA redirects to `/login`, user signs in (existing flow), BA continues the authorize step.
5. BA mints a `consent_code` and redirects to `https://app.latitude.so/auth/consent?consent_code=…&client_id=…&scope=…`. Same origin still.
6. User picks an org, clicks Approve. The web server fn (a) validates membership, (b) sets `oauth_applications.organization_id` for the matching `client_id` via the admin Drizzle connection, (c) calls `betterAuth.api.oauth2Consent({ accept: true, consent_code })` in-process.
7. BA returns the auth code to the MCP client's redirect URI.
8. MCP client → `POST https://app.latitude.so/api/auth/mcp/token` (server-to-server, no cookies) → returns an opaque access token.
9. MCP client → `https://api.latitude.so/v1/mcp` with `Authorization: Bearer …`. The API's auth middleware tries the API-key validator first, falls through to the OAuth validator, queries shared Postgres (admin connection, RLS-bypass) for the token, joins to `oauth_applications.organization_id`, sets `c.var.auth` and `c.var.organization`. Tool dispatch proceeds.

The browser only ever talks to `app.latitude.so` (the web origin). The MCP client (CLI agent) talks to both origins via plain HTTPS — no CORS or cookies in play. Local dev: `localhost:3000` web ↔ `localhost:3001` API works as-is, no proxy needed.

### `apps/api/src/routes/index.ts` — three concentric rings

```
attachSharedContext(db, redis, clickhouse, queue)   ← all routes

  RING 1 — public:
    /healthz
    /.well-known/oauth-protected-resource    ← static JSON (D5)

  RING 2 — protected (unified auth):
    validationErrorMiddleware
    createAuthRateLimiter()              ← global IP-based brute-force guard
    createAuthMiddleware()               ← API-key OR OAuth (D4) — DB-direct, no BA
    createOrganizationContextMiddleware()

      /v1/...   ← all REST routes, with per-prefix tier limiters (D9)
      /v1/mcp   ← MCP server, per-request McpServer (D13)
```

### `apps/web` BA additions

The web's existing `getBetterAuth()` factory call gains the `mcp()` plugin in its `extraPlugins`:

```ts
mcp({
  loginPage: `${webUrl}/login`,
  oidcConfig: {
    consentPage: `${webUrl}/auth/consent`,
    requirePKCE: true,
  },
})
```

No request / response rewriting on `/api/auth/mcp/token` — BA's plugin issues opaque tokens, stores them raw, and looks them up raw on refresh. Token prefixes (D4) are out.

Optional convenience: a root-level redirect `app.latitude.so/.well-known/oauth-authorization-server` → `app.latitude.so/api/auth/.well-known/oauth-authorization-server` for MCP clients that try the AS root. RFC 8414 supports the path-prefixed form (`<host>/<path>` issuer), so this is belt-and-suspenders.

### Unified `authenticate()` (API side, no BA dependency)

```
authenticate(c) -> AuthContext | 401
  bearer = extractBearerToken(c) ?? throw 401
  return authenticateWithApiKey(bearer)
      ?? authenticateWithOAuth(bearer)
      ?? 401
```

Bearer tokens are opaque — there's no prefix to dispatch on, so we just try both validators in sequence. Both have a short negative-cache TTL (~5s), so an unknown bearer or an OAuth-shaped bearer hits each underlying DB at most once per cache window.

#### Why we don't call Better Auth for verification

We confirmed by reading `better-auth@1.6.9`'s MCP plugin source (`dist/plugins/mcp/index.mjs:639-693`): BA's `withMcpAuth` / `getMcpSession` does literally one thing — a `findOne({ accessToken })` lookup on the `oauthAccessToken` table. It does **not** check `accessTokenExpiresAt`, **not** check `oauthApplication.disabled`, **not** check scopes, **not** read org binding metadata. So if we routed through BA we'd still have to layer all those checks on top of it. Routing through BA buys us nothing on the API; it costs us a heavyweight dependency, an in-process auth instance to keep configured, and an extra abstraction over a query we already need to write.

So the API's OAuth validation is pure Drizzle — and it's **stricter** than BA's stock validator. The single statement we run on cache miss:

```sql
SELECT  t.user_id,
        t.client_id,
        t.scopes,
        t.access_token_expires_at,
        a.disabled         AS application_disabled,
        a.organization_id  AS organization_id
FROM    oauth_access_tokens t
JOIN    oauth_applications a ON a.client_id = t.client_id
WHERE   t.access_token = $1
LIMIT   1
```

…then in app code reject the row if any of:
- row not found
- `accessTokenExpiresAt < now()`
- `applicationDisabled = true`
- `organizationId IS NULL` (consent finished without our binding step)

This list IS the entire business logic we'd be "missing out on" by not going through BA. We've documented every rule explicitly; tests pin each one. If BA's MCP plugin changes its semantics in a future version, we don't accidentally inherit those changes — which is what we want for a hot-path auth check.

#### Redis caching — mirroring `validateApiKey`

The OAuth path follows the same caching shape as `packages/platform/api-key-auth/src/validate-api-key.ts`. Lives in **`packages/platform/oauth-token-auth/src/validate-oauth-token.ts`** (new package, M1).

```
validateOAuthAccessToken(token, deps) -> Effect<AuthContext | null>
  startTime = now()
  tokenHash = sha256(token)                         # never put raw tokens in Redis
  cached = redis.get(`oauth:${tokenHash}`)          # 50ms timeout, fail-open

  if cached !== undefined:
    if cached === null:
      enforceMinTime(50ms); return null             # negative cache hit
    if cached.expiresAt < now():                    # cache entry survived past expiry
      redis.del(`oauth:${tokenHash}`)
      # fall through to DB
    else:
      enforceMinTime(50ms); return cached

  row = adminPg.query(<the SELECT above>, [token])

  if !row or row.expiresAt < now() or row.applicationDisabled or !row.organizationId:
    redis.setex(`oauth:${tokenHash}`, 5, JSON.stringify(null))   # 5 sec negative TTL
    enforceMinTime(50ms); return null

  authCtx = {
    method: "oauth",
    userId: UserId(row.userId),
    organizationId: OrganizationId(row.organizationId),
    oauthClientId: row.clientId,
    scopes: row.scopes.split(" "),
    expiresAt: row.accessTokenExpiresAt,            # kept on the cached object so we
                                                    # re-check on hit (above)
  }
  ttl = min(300, secondsUntil(row.expiresAt))       # never cache past the token's life
  redis.setex(`oauth:${tokenHash}`, ttl, JSON.stringify(authCtx))
  onTokenValidated?.(row.id)                        # touch-buffer hook
  enforceMinTime(50ms); return authCtx
```

Three behaviors worth calling out:

1. **Cache key is `oauth:${sha256(token)}`** — never the raw token. Same as `apikey:${tokenHash}`. Defense in depth against a Redis dump leaking secrets.
2. **TTL is bounded by token expiry**: `min(300s, secondsUntilExpiry)`. A token expiring in 30s gets cached for 30s, not 5 min. Avoids the "cache served an expired token" failure mode.
3. **Expiry is re-checked on cache hit** (the `cached.expiresAt < now()` branch). Belt-and-suspenders — even if the TTL math is wrong, the in-memory check catches it.
4. **Touch-buffer**: optional `onTokenValidated(id)` hook lets us track `lastUsedAt` per OAuth token via the same in-memory batched-write pattern API keys use (`apps/api/src/middleware/touch-buffer.ts`). Useful for the "OAuth Keys" settings table in M-Settings ("last used 3 minutes ago").
5. **Fail-open on Redis errors** — same as API-key path: Redis timeout → fall through to DB. DB is source of truth.

The platform package is pure: it imports Drizzle table definitions from `@platform/db-postgres` and a `RedisClient` from `@platform/cache-redis`. No `better-auth` dependency anywhere on the API side.

#### `AuthContext` shape

```ts
export type AuthContext =
  | { method: "api-key"; userId: UserId /* "api-key:<keyId>" */; organizationId: OrganizationId }
  | { method: "oauth";   userId: UserId; organizationId: OrganizationId; oauthClientId: string;
                         scopes: ReadonlyArray<string>; expiresAt: Date }
```

`expiresAt` is on the OAuth variant only (API keys don't expire). The middleware writes the chosen variant onto `c.var.auth`.

### Local-dev story — no proxy needed

With OAuth on the web origin only, dev is straightforward:

- Web at `http://localhost:3000`, API at `http://localhost:3001`. As today.
- The OAuth browser navigation stays on `localhost:3000` end-to-end — same-origin with the dev session cookie. BA's origin checks pass.
- The MCP CLI (e.g. `npx @modelcontextprotocol/inspector`) makes plain HTTPS/HTTP calls to both `localhost:3000` (token exchange) and `localhost:3001` (`/v1/mcp`). CLIs don't enforce CORS.
- The API's `/.well-known/oauth-protected-resource` JSON points at `http://localhost:3000/api/auth` for dev (configured via `LAT_OAUTH_AS_BASE_URL` env var, defaulting to the BA URL).
- No reverse proxy. No cookie-domain tricks. No `SameSite=None` flips.

## MCP auto-generation

### `defineApiEndpoint`

```ts
// apps/api/src/mcp/define-endpoint.ts
import type { OpenAPIHono, RouteHandler } from "@hono/zod-openapi"
import type { Env } from "hono"

// We extend the standard RouteConfig with required `name` (camelCase) and
// required `description`. `operationId` is set internally from `name`.
export type AppRouteConfig<R> = Omit<R, "operationId" | "description"> & {
  readonly name: string         // camelCase, e.g. "createApiKey"
  readonly description: string  // required
  readonly summary?: string
}

export const defineApiEndpoint = <R extends AppRouteConfig<any>, E extends Env>(args: {
  route: R
  handler: RouteHandler<R, E>
  tool?: boolean   // default true
}): ApiEndpoint<R, E>
```

Each route file becomes:

```ts
// apps/api/src/routes/api-keys.ts
const listApiKeys = defineApiEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listApiKeys",
    description: "List all API keys in the organization. Tokens are returned masked.",
    tags: ["API Keys"],
    security: PROTECTED_SECURITY,
    responses: { 200: jsonResponse(PaginatedApiKeyListItem, "List of API keys") },
  }),
  handler: async (c) => { ... },
})

const getApiKey = defineApiEndpoint({
  route: createRoute({
    method: "get",
    path: "/{id}",
    name: "getApiKey",
    description: "Get one API key by id, including its full unmasked token.",
    tags: ["API Keys"],
    security: PROTECTED_SECURITY,
    request: { params: IdParamsSchema },
    responses: { 200: jsonResponse(ApiKeySchema, "API key with token") },
  }),
  handler: async (c) => { ... },
})

export const apiKeyEndpoints = [listApiKeys, getApiKey, createApiKey, updateApiKey, revokeApiKey]

export const createApiKeysRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()
  for (const ep of apiKeyEndpoints) ep.mountHttp(app)
  return app
}
```

Tool-name = `name` (already camelCase, MCP-valid). Tool description = `description`. Tool input schema = flatten `route.request.params + route.request.query + route.request.body` into one Zod object (record per-field source for reverse-mapping; collisions throw at boot). Discriminated-union bodies (e.g. `CreateScoreBody`) fall back to keeping the body under a `body` property.

`route.summary` is optional and goes to OpenAPI/Fern. Internally we set `operationId = route.name`.

### Mount

```ts
// apps/api/src/mcp/server.ts
const toolDescriptors = collectToolDescriptors(endpointRegistry)  // computed once at boot

protectedApp.all("/v1/mcp", async (c) => {
  const mcpServer = new McpServer(
    { name: "Latitude API", version: "1.0.0" },
    { capabilities: { tools: {} } },
  )
  for (const t of toolDescriptors) {
    mcpServer.registerTool(
      t.name,
      { title: t.title, description: t.description, inputSchema: t.flatInputSchema },
      async (input) => {
        const { params, query, body } = splitFlatInput(input, t.inputFieldSources)
        const url = buildInternalUrl(t.routerPrefix, t.pathTemplate, params, query)
        const res = await app.fetch(new Request(`${BASE}${url}`, {
          method: t.httpMethod,
          headers: {
            Authorization: c.req.header("Authorization") ?? "",
            "Content-Type": "application/json",
            "X-Forwarded-For": c.req.header("X-Forwarded-For") ?? "",
          },
          body: ["GET","DELETE"].includes(t.httpMethod) ? undefined : JSON.stringify(body),
        }))
        const text = await res.text()
        return { content: [{ type: "text", text }], isError: !res.ok }
      },
    )
  }
  const transport = new WebStandardStreamableHttpServerTransport({ sessionIdGenerator: undefined })
  await mcpServer.connect(transport)
  return transport.handleRequest(c.req.raw)
})
```

### `pnpm mcp:emit`

Mirrors `pnpm openapi:emit`. Boots the route registry with stub clients, walks `endpointRegistry`, writes `apps/api/mcp.json` with `{ name, version, tools: [{ name, title, description, inputSchema }, ...] }`. CI guards drift the same way `openapi.json` is guarded.

## Settings UI changes (web app)

These ride along because the OAuth/MCP flow needs surfaces on the web app.

### Sessions section in `settings/account` (NEW)

Above the existing "Delete account" section, add a **Sessions** section:

- Two tables: **Active sessions** (current + other devices), **Past sessions** (expired or signed-out).
- Columns: device / browser (parsed from `user_agent`), IP, location (best-effort from IP), `createdAt`, `lastUsedAt`, `expiresAt`.
- Per-row "Sign out" button on active sessions; one "Sign out everywhere else" button at the top.
- Backed by BA's `listSessions()` and `revokeSession({ token })` / `revokeOtherSessions()` APIs.

### `settings/keys` page (renamed from `settings/api-keys`)

Two sections, two tables:

1. **OAuth Keys** — lists rows from `oauth_applications` joined to `oauth_access_tokens` for the current org. Org scoping is automatic: the regular tenant-scoped Postgres connection only sees rows where `oauth_applications.organization_id = get_current_organization_id()` (RLS), so the page query is just `SELECT … FROM oauth_applications LEFT JOIN …` with no manual org filter. One row per `(client, user)`. Columns: client name + icon, the user who authorized it, `lastUsedAt` (touch-buffer like API keys), `createdAt`. Action: **Revoke** — deletes the access tokens for that `(clientId, userId)` and disables the application if no other tokens remain. No "create" button — these are created via the OAuth flow.
2. **API Keys** — existing list (masked tokens, copy-on-create-or-detail, rename, delete). Unchanged in feature set; renamed in URL.

Both sections live behind the existing `settings/keys` route (rename `settings/api-keys.tsx` → `settings/keys.tsx`, redirect old path).

## Milestones

Seven milestones. Each ships independently. M1 unblocks all later ones.

### M1 — Groundwork

Foundational pieces with zero user-visible surface change.

**Migrations** (`packages/platform/db-postgres/drizzle/...`):
- Add `slug VARCHAR(80)` to `latitude.issues` (nullable → backfill → NOT NULL + unique on `(organization_id, project_id, slug)`).
- Same for `latitude.datasets`.
- Drizzle definitions for `oauth_applications`, `oauth_access_tokens`, `oauth_consents` per the OIDC Provider plugin schema, added directly to `packages/platform/db-postgres/src/schema/better-auth.ts` next to the existing BA tables. App extension: `oauth_applications.organization_id` (CUID FK to `organizations`, nullable until consent binds it) plus an RLS policy scoped by `organization_id`. Token validation runs through the admin Postgres connection (RLS-bypass) so it can read across orgs to resolve the binding; tenant-scoped reads (settings/keys page) only see MCP clients bound to the active org. The two related tables (`oauth_access_tokens`, `oauth_consents`) stay RLS-free — they're either accessed via admin (validation) or via JOIN through the RLS-protected application.

**Schema changes**:
- `packages/platform/db-postgres/src/schema/issues.ts` — add slug column + unique index.
- `packages/platform/db-postgres/src/schema/datasets.ts` — same.
- `packages/platform/db-postgres/src/schema/api-keys.ts` — add a TODO comment: `// TODO(api-key-plugin): migrate to better-auth's apiKey plugin once we have downtime to backfill. The plugin natively supports organization-owned keys via the `references` config — see https://better-auth.com/docs/plugins/api-key.`

**Domain helpers**:
- `packages/domain/spans/src/helpers/trace-ref.ts` — add `tracesRefSchema`:
  ```ts
  export const tracesRefSchema = z.discriminatedUnion("by", [
    z.object({ by: z.literal("ids"), ids: z.array(traceIdSchema).min(1) }),
    z.object({ by: z.literal("filters"), filters: filterSetSchema }),
  ])
  ```
  Plus `resolveTraceIdsFromRef` (no cap; paginate `TraceRepository.listByProjectId` until exhausted).
- `packages/domain/shared/src/slug.ts` — extract a generic `generateUniqueSlug({ candidateName, existsBySlug, excludeId? })` helper from saved-searches.

**Slug-on-rename helpers** for projects, organizations, issues, datasets in their respective domain `update-*` use-cases — pattern lifted directly from `packages/domain/saved-searches/src/use-cases/update-saved-search.ts:62-71`. Done in M3-M7 per entity, but the shared helper lands here.

**API helpers**:
- `apps/api/src/openapi/pagination.ts` — `Paginated(item, name)` + `PaginatedQueryParamsSchema`. Match the existing traces/issues pagination shape.
- `apps/api/src/openapi/schemas.ts` — add `TracesRefSchema` (rebuilt with `.openapi("TracesRef")` for the Fern bug).
- `apps/api/src/middleware/rate-limiter.ts` — add `createTierRateLimiter("low" | "medium" | "high" | "critical")` at 100/60/15/3 per minute.

**MCP scaffolding** (no tools yet):
- `apps/api/src/mcp/{define-endpoint,flatten-input,registry,server,index}.ts` — ~350 lines.
- Uncomment `@modelcontextprotocol/sdk` in `pnpm-workspace.yaml`. Add `@modelcontextprotocol/sdk` and `zod-to-json-schema` to `apps/api/package.json` via the catalog reference.
- `apps/api/scripts/emit-mcp.ts` + `pnpm mcp:emit` script. CI drift check.

**Auth scaffolding**:
- `packages/platform/db-postgres/src/create-better-auth.ts` — extend the drizzle adapter `schema` with `oauthApplication`, `oauthAccessToken`, `oauthConsent`. Add the OIDC tables to the schema barrel so `apps/api` can import the Drizzle definitions for read-only queries without depending on BA. Do **not** install `mcp()` plugin in the shared factory (caller-controlled — only the web caller will install it in M2).
- `packages/platform/oauth-token-auth/` — new package mirroring `packages/platform/api-key-auth/`. Exports `validateOAuthAccessToken(token, deps)`. Redis cache + admin-PG fallback. Pure Drizzle SQL — does **not** import or call Better Auth. Reused by `apps/api` and any future resource server.

### M2 — OAuth + MCP wiring

Ship the OAuth layer end-to-end with one migrated route as a smoke test. **All BA changes happen on the web app**; the API only adds a static discovery endpoint and the validation middleware.

**Web app changes** (where OAuth lives):
- `apps/web/src/server/clients.ts > getBetterAuth()` — add `mcp()` plugin to `extraPlugins`:
  ```ts
  mcp({
    loginPage: `${webUrl}/login`,
    oidcConfig: {
      consentPage: `${webUrl}/auth/consent`,
      requirePKCE: true,
      // Without this, `/api/auth/mcp/register` requires a session (BA source
      // `oidc-provider/index.mjs:830`). MCP clients register before any user
      // signs in — they're machines bootstrapping themselves.
      allowDynamicClientRegistration: true,
    },
  })
  ```
- `apps/web/src/routes/auth.consent.tsx` — new TanStack route. Reads `consent_code` + `client_id` from query, fetches user's orgs, renders org-picker. Approve runs a server fn that:
  1. Validates user is a member of the chosen org.
  2. Updates `oauth_applications.organization_id` for the matching `client_id` via Drizzle on the admin connection (admin needed because the RLS policy this row will satisfy is scoped to the very org id we're about to write).
  3. Calls `getBetterAuth().api.oauth2Consent({ accept: true, consent_code })` in-process.
- Root-level redirect `/.well-known/oauth-authorization-server` → `/api/auth/.well-known/oauth-authorization-server` for MCP clients that try the AS root.

**API changes** (resource server only):
- `apps/api/src/routes/well-known.ts` — new file. Serves `GET /.well-known/oauth-protected-resource` returning a static `{ resource: <apiUrl>, authorization_servers: [<webUrl> + "/api/auth"] }`. Public route (RING 1).
- `apps/api/src/middleware/auth.ts` — extend `authenticate()` to fall through to OAuth (D4): try the API-key validator first, then `validateOAuthAccessToken` (the M1 platform package — pure Drizzle, no BA), then 401. Extend `AuthContext` type per D14.
- `apps/api/src/routes/index.ts` — three-ring restructure; mount `/.well-known/oauth-protected-resource` in RING 1.

**No token prefixing** (D4). Bearer tokens are opaque random strings throughout — `crypto.randomUUID()` for API keys, `generateRandomString(32, …)` for OAuth tokens. Storage, transport, and lookup all use the raw value. The auth middleware's two-validator fall-through (API-key → OAuth → 401) replaces the prefix-based dispatch.

**Migrate one route to `defineApiEndpoint`** (proof of concept):
- `apps/api/src/routes/api-keys.ts` — wrap existing routes (list/create/revoke) in `defineApiEndpoint`. Add `name` and `description` fields to each `createRoute` call (replace `operationId`). Verify `pnpm openapi:emit` produces a clean diff (just `operationId` field renames). Verify `pnpm mcp:emit` lists 3 tools.

**No reverse proxy task** — dropped; not needed (see "Local-dev story" above).

### M3 — Identity ergonomics

Account, Members, finish API Keys, finish Projects (incl. pagination migration + slug-on-rename).

**Account**:
- `packages/domain/account/src/use-cases/get-account.ts` (new). Composes user + organization + member-role lookups. Branches on `auth.method`: `api-key` returns `{ user: null, organization, role: null }`; `oauth` returns the full triple.
- `apps/api/src/routes/account.ts` — `GET /account` (`low` tier).

**Members**:
- `apps/api/src/routes/members.ts` — list, get, invite, update role, remove (`medium` tier).
- Invite handler: BA is not in-process on the API, so we can't call `betterAuth.api.createInvitation` directly. Two viable paths:
  - **(a)** Replicate BA's invitation creation in a thin domain use-case that writes directly to the `invitations` table + emits the existing `InvitationEmailRequested` outbox event (same hook the web app already uses). Recommended — matches our outbox pattern, no cross-process call.
  - **(b)** Add a small server endpoint on the web app (`POST /api/internal/invitations`) that the API calls via HTTPS with a shared secret. Adds latency + a deploy-coupled dependency. Not recommended.
- Use (a). New use-case `inviteMemberUseCase({ organizationId, email, role, inviterUserId })` in `@domain/organizations`.
- Reuses `MembershipRepository.listMembersWithUser`, `findById`, `updateMemberRoleUseCase`, `removeMemberUseCase`.

**API Keys**:
- Add `GET /api-keys/{id}` (returns full unmasked token — D14) and `PATCH /api-keys/{id}` (rename) to existing `apps/api/src/routes/api-keys.ts`. `updateApiKeyUseCase` already exists.
- Switch list response: each item gets a `maskedToken: "658***********1ceb"` field instead of (or alongside) the existing list shape. Add a tiny `maskApiKeyToken(token)` helper in `@domain/api-keys`.

**Projects**:
- `apps/api/src/routes/projects.ts` — switch list response to `Paginated(ProjectSchema, "PaginatedProjects")`. Add slug-on-rename via `generateUniqueSlug` in `updateProjectUseCase`. Move schemas to `apps/api/src/openapi/entities/project.ts`.

**Slug-on-rename for organizations**: **dropped from scope.** Org slugs aren't user-facing in our app (no routes key off them) and Better Auth owns the column. Not worth the BA-hook plumbing for a value nobody reads.

### M4 — Traces + bulk export

**Traces**:
- `apps/api/src/routes/traces.ts` — list (`high`), get (`medium`), export (`critical`).
- List query: filters + searchQuery + cursor. `Paginated(TraceSchema, "PaginatedTraces")`.
- Export takes `tracesRef: TracesRefSchema` + `recipientEmail: z.email()`. Handler validates `recipientEmail` belongs to a user in `c.var.organization.id`, then enqueues the existing export worker. Returns `{ status: "queued" }` 202.
- `packages/domain/spans/src/use-cases/build-traces-export.ts` — accept `TracesRef` (the worker call site translated).

### M5 — Saved Searches

- `apps/api/src/routes/saved-searches.ts` — full CRUD + `POST /{savedSearchSlug}/assign` (`medium` tier across).
- `packages/domain/saved-searches/src/use-cases/assign-saved-search.ts` — new. Validates assignee is a member of the org; `null` unassigns.
- Reuses `createSavedSearch`, `updateSavedSearch` (already does slug-on-rename), `deleteSavedSearch`, `getSavedSearchBySlug`, `listSavedSearches`.

### M6 — Issues

- Repository: `findBySlug({ projectId, slug })` and `existsBySlug` on `IssueRepository`. Implement on `packages/platform/db-postgres/src/repositories/issue-repository.ts`.
- Slug generation: wire `generateUniqueSlug` into `createIssueFromScoreUseCase` and `discoverIssueUseCase` for new issues. Add slug regeneration to whichever use-case renames issues (verify it exists; it may be implicit through `refreshIssueDetailsUseCase`).
- New use-cases in `@domain/evaluations/src/use-cases/`:
  - `monitor-issue.ts` — extracts `apps/web/src/domains/evaluations/evaluation-alignment.functions.ts > startEvaluationAlignment`.
  - `unmonitor-issue.ts` — extracts `softDeleteIssueEvaluation`. Body requires `evaluationId`.
  - Web server-fns become thin pass-throughs to the new use-cases.
- Confirm `WorkflowStarter` is wired into `apps/api`'s clients. Today `apps/api/src/clients.ts` does not import it; add `getWorkflowStarter()` mirroring the web app and inject through `ApiOptions`.
- `apps/api/src/routes/issues.ts`:
  - `GET /` (`high`), `GET /{issueSlug}` (`medium`).
  - `POST /lifecycle` (`medium`) — bulk by id list (existing use-case is id-based).
  - `POST /{issueSlug}/monitor` (`critical`), `POST /{issueSlug}/unmonitor` (`medium`).
  - `POST /export` (`critical`) — `recipientEmail` validated; reuses `buildIssuesExportUseCase`.

### M7 — Datasets

- Repository: `findBySlug` + `existsBySlug` on `DatasetRepository`.
- Slug generation in `createDataset`. **Slug regenerated on rename** in `renameDataset` and `updateDatasetDetails` per D7.
- `apps/api/src/routes/datasets.ts`:
  - Datasets CRUD: `GET /` (`low`), `GET /{datasetSlug}` (`low`), `POST /` (`medium`), `PATCH /{datasetSlug}` (`medium`), `DELETE /{datasetSlug}` (`medium`).
  - Rows: `GET /{datasetSlug}/rows` (`high`), `POST /{datasetSlug}/rows` (`medium`), `DELETE /{datasetSlug}/rows` (`medium`).
  - Imports: `POST /{datasetSlug}/import-from-traces` (`critical`) takes `{ tracesRef: TracesRefSchema }`. **CSV import endpoint deferred (D16)** — drop a `// TODO(file-imports): define how to upload binary files (CSV today, parquet tomorrow). Tracked separately.` comment near the imports section.
  - Export: `POST /{datasetSlug}/export` (`critical`) — recipient-email validated.
- Refactor `addTracesToDataset` to take `TracesRef` directly, OR keep it richer (`{ source, selection }`) and add a thin route-level adapter that translates `TracesRef → { source: "project", selection: { mode: "selected", traceIds: resolved } }`. Decide during the milestone — adapter is simpler.

### M-Settings — Web settings page changes (parallel to M2-M7)

These can ship in a single PR after M2 is merged (so the BA OAuth tables exist).

- `apps/web/src/routes/_authenticated/settings/account.tsx` — add Sessions section above Delete Account (uses BA `listSessions`, `revokeSession`, `revokeOtherSessions`).
- Rename `apps/web/src/routes/_authenticated/settings/api-keys.tsx` → `apps/web/src/routes/_authenticated/settings/keys.tsx`. Add OAuth Keys section + redirect from old URL.
- Add a "Revoke OAuth key" server fn that deletes `oauth_access_tokens` rows by `(client_id, user_id)` and disables the `oauth_applications` row if no other tokens remain.

## Critical files

**To create**:
- `apps/api/src/mcp/{define-endpoint,flatten-input,registry,server,index}.ts`
- `apps/api/src/routes/{well-known,account,members,traces,saved-searches,issues,datasets}.ts`
- `apps/api/src/openapi/pagination.ts`
- `apps/api/src/openapi/entities/{account,api-key,member,project,trace,saved-search,issue,dataset}.ts`
- `apps/api/scripts/emit-mcp.ts`
- `packages/platform/oauth-token-auth/` (new package — pure Drizzle, no BA dep)
- `packages/platform/db-postgres/src/schema/oauth.ts`
- `packages/domain/account/` (new package, or co-locate in `@domain/users`)
- `packages/domain/evaluations/src/use-cases/{monitor,unmonitor}-issue.ts`
- `packages/domain/organizations/src/use-cases/invite-member.ts`
- `packages/domain/saved-searches/src/use-cases/assign-saved-search.ts`
- `packages/domain/shared/src/slug.ts`
- `apps/web/src/routes/auth.consent.tsx`
- `apps/web/src/routes/_authenticated/settings/keys.tsx` (rename of `api-keys.tsx`)
- Migrations under `packages/platform/db-postgres/drizzle/`

**To edit**:
- `pnpm-workspace.yaml` — uncomment `@modelcontextprotocol/sdk` catalog entry
- `apps/api/src/server.ts` — wire MCP server bootstrap
- `apps/api/src/routes/index.ts` — three-ring restructure, tier limiters per prefix
- `apps/api/src/middleware/auth.ts` — unified API-key + OAuth dispatch (D4); OAuth path is pure Drizzle, no BA
- `apps/api/src/clients.ts` — inject `WorkflowStarter` (M6 prerequisite)
- `apps/api/src/types.ts` — widen `AuthContext`
- `apps/api/src/routes/{api-keys,projects,annotations,scores}.ts` — migrate to `defineApiEndpoint` (rename `operationId` → `name`)
- `apps/api/src/openapi/schemas.ts` — add `TracesRefSchema`
- `apps/api/src/middleware/rate-limiter.ts` — add tier presets (D9)
- `packages/platform/db-postgres/src/{schema/issues,schema/datasets,schema/api-keys,create-better-auth}.ts`
- `packages/platform/db-postgres/src/index.ts` — export Drizzle defs of `oauthApplication` / `oauthAccessToken` for the API to read directly
- `packages/domain/spans/src/{helpers/trace-ref,use-cases/build-traces-export}.ts`
- `packages/domain/issues/src/{ports/issue-repository,use-cases/create-issue-from-score,use-cases/discover-issue}.ts`
- `packages/domain/datasets/src/{ports/dataset-repository,use-cases/{create,rename,update-details}-dataset}.ts`
- `packages/domain/projects/src/use-cases/update-project.ts` — slug-on-rename
- `packages/domain/api-keys/src/entities/api-key.ts` — `generateApiKeyToken()` returns plain UUID; no prefix helpers
- `apps/web/src/server/clients.ts` — install `mcp()` plugin in `getBetterAuth()` extraPlugins
- `apps/web/src/domains/evaluations/evaluation-alignment.functions.ts` — delegate to new use-cases
- `apps/web/src/routes/_authenticated/settings/account.tsx` — Sessions section

## Risks / unknowns

- **BA `mcp` plugin is documented as deprecated in favor of an OAuth Provider plugin** (per the BA mcp.md docs page). Both share the OIDC schema, so migration cost is low later. Confirm in M2 which to use; if a non-deprecated equivalent exists in 1.6.9 prefer that.
- **MCP-client AS discovery quirks**: some MCP clients strictly fetch `<as>/.well-known/oauth-authorization-server` at the AS root rather than honoring the path-prefixed issuer (`<webUrl>/api/auth`). Add the root-level redirect on the web app (covered in M2). If a particular client still fails, document the workaround.
- **`WebStandardStreamableHttpServerTransport` API shape** — newer than the README example (`StreamableHTTPServerTransport`). Verify constructor + method names against the installed `@modelcontextprotocol/sdk@1.29.0` source.
- **Zod-v4 `.openapi()` metadata propagating into MCP tool inputSchema** via `zod-to-json-schema` — different package than `@asteasolutions/zod-to-openapi`. Need a unit test confirming descriptions survive; if not, add a small reflection helper that copies metadata into `.describe(...)` before MCP registration.
- **Internal `app.fetch(...)` rate-limit IP**: forward `X-Forwarded-For` from outer MCP request explicitly; otherwise the rate limiter falls back to `"unknown"`.
- **`oauthApplication` registration is unauthenticated** by spec — rate-limit `/api/auth/mcp/register` (on the web) aggressively and add a periodic prune for orphan registrations (no token + no consent + no metadata.organizationId after 1 hour).
- **Token revocation**: BA's MCP plugin has no `/revoke` endpoint. The "Revoke OAuth key" server fn (M-Settings) implements it ourselves on the web app: `DELETE FROM oauth_access_tokens WHERE client_id = ? AND user_id = ?`, set `oauth_applications.disabled = true` if no tokens remain. The API's auth middleware honors this immediately because validation hits the DB.
- **Auth-path query latency**: token validation joins `oauth_access_tokens → oauth_applications` on `client_id`. Both columns are indexed; with the per-token Redis cache (5 min) the hot path is one Redis GET. Cold-path measurements should land in the same order as `validateApiKey`.
- **Cross-origin DB schema sharing**: the API process imports Drizzle table definitions for `oauthApplication` / `oauthAccessToken` from `@platform/db-postgres` to query them, but the **write path** for those tables stays on the web (BA owns it). Schema migrations always go through the standard process; both apps automatically pick up new columns. Mental model: web is the system of record, API is a read-only consumer.

## Verification

Per milestone, run from repo root:

```bash
pnpm typecheck                           # whole-workspace tsgo (NOT tsc — see CLAUDE.md)
pnpm --filter @latitude-data/api test    # vitest
pnpm openapi:emit                        # diff apps/api/openapi.json — should change only as expected
pnpm mcp:emit                        # diff apps/api/mcp.json — same drift guard
pnpm generate:sdk                        # confirm Fern produces a clean SDK delta
```

End-to-end (M2 onward), no proxy needed — vanilla web on `localhost:3000` and API on `localhost:3001`:

1. `GET http://localhost:3001/.well-known/oauth-protected-resource` → returns `{ resource: "http://localhost:3001", authorization_servers: ["http://localhost:3000/api/auth"] }`.
2. `GET http://localhost:3001/v1/account` with an organization API key → 200, returns `{ organization, role: null, user: null }`.
3. Run `npx @modelcontextprotocol/inspector http://localhost:3001/v1/mcp` → discovery hops to the web AS → user signs in on `localhost:3000` (existing magic-link flow) → org picker on `localhost:3000/auth/consent` → consent → MCP client receives an opaque access token → tool list returns ≥3 tools after M2.
4. Issue `tools/call listApiKeys` from the inspector → 200 returns the org's keys (masked).
5. Issue `tools/call getApiKey { id }` → 200 returns full unmasked token.
6. After M3: `account_get`, `members_*`, `projects_*` tool calls succeed with org-bound OAuth token.
7. After M4: trace export tool kicks off the export queue; recipient email arrives with download link. Reject when recipient is not an org member.
8. After M-Settings: `/settings/account` lists active sessions; revoking one ejects that session. `/settings/keys` shows OAuth Keys + API Keys; revoking an OAuth key invalidates subsequent tool calls.

CI:
- Existing typecheck + test jobs gate the PR.
- New job: `pnpm openapi:emit && git diff --exit-code apps/api/openapi.json` — fails on drift.
- Same for `pnpm mcp:emit && git diff --exit-code apps/api/mcp.json`.

## Tasklist (status as of 2026-05-19)

Source of truth for what's shipped vs. outstanding. Update inline as PRs land.

### Done

- **M1 — Groundwork**
  - [x] OAuth schema migrations + Drizzle defs (`oauth_applications`, `oauth_access_tokens`, `oauth_consents`)
  - [x] `slug` columns on `issues` and `datasets`
  - [x] `tracesRefSchema` + `resolveTraceIdsFromRef` in `@domain/spans`
  - [x] `generateUniqueSlug` helper in `@domain/shared`
  - [x] `apps/api/src/openapi/pagination.ts` (`Paginated`, `PaginatedQueryParamsSchema`)
  - [x] `TracesRefSchema` in `apps/api/src/openapi/schemas.ts`
  - [x] Tier rate-limit presets (`low`/`medium`/`high`/`critical`)
  - [x] MCP scaffolding (`apps/api/src/mcp/*`, `pnpm mcp:emit`)
  - [x] `@platform/oauth-token-auth` package (pure Drizzle, Redis cache)
- **M2 — OAuth + MCP wiring (API + web)**
  - [x] `apps/web/src/server/clients.ts` — `mcp()` plugin installed in `getBetterAuth()`
  - [x] `apps/web/src/routes/auth/consent.tsx` — org-picker consent page
  - [x] `apps/web/src/domains/oauth/oauth-consent.functions.ts` — server-fn flow
  - [x] `apps/web/src/routes/[.well-known]/oauth-authorization-server.ts` — root-level AS discovery
  - [x] `apps/api/src/routes/well-known.ts` — protected-resource discovery
  - [x] `apps/api/src/middleware/auth.ts` — unified API-key + OAuth dispatch
  - [x] Three-ring `apps/api/src/routes/index.ts`
  - [x] `api-keys.ts` migrated to `defineApiEndpoint` (smoke test)
  - [x] `annotations.ts` migrated to `defineApiEndpoint`; OAuth callers' annotations carry `annotatorId = auth.userId`
  - [x] `scores.ts` migrated to `defineApiEndpoint`
  - [x] End-to-end verification with an MCP client against a running web+API stack — confirmed working from Cursor
- **M3 — Identity ergonomics**
  - [x] **Account**: `GET /account`
  - [x] **Members**: list / get / invite / update / remove (all 5 endpoints, OAuth-only for mutations, owner-protection)
  - [x] **API Keys**: list (masked) / get (unmasked) / create / update / revoke (all 5 endpoints)
  - [x] **Projects**: list (paginated) / get / create / update (incl. settings + per-flagger toggle) / delete (all 5 endpoints)
  - [x] Slug-on-rename for projects in `updateProjectUseCase`
  - [x] **Org slug-on-rename**: dropped from scope (see decision above)
- **M-Settings (web)**
  - [x] Sessions section in `settings/account.tsx` — UA-parsed device / OS, geoip city/region/country, "Sign out everywhere else" and per-row revoke (BA `listSessions` / `revokeSession` / `revokeOtherSessions`). Backed by `apps/web/src/domains/sessions/user-sessions.functions.ts`. Confirmation modals on both revoke flows. Device icons + relative timestamps.
  - [x] Renamed `settings/api-keys.tsx` → `settings/keys.tsx`; nav label "API Keys" → "Keys"; `settings/api-keys.tsx` kept as a `redirect()`-only route for old bookmarks. Tables sorted by `createdAt` desc, timestamps use `relativeTime`.
  - [x] OAuth Keys table on `settings/keys` + `revokeOAuthKey({ clientId, userId })` server-fn. List + revoke routed through `@domain/oauth-keys` use-cases (`OAuthKeyRepository` impl in `@platform/db-postgres`, RLS-scoped via tenant `SqlClient`). Empty state uses `TableBlankSlate` with a docs link.
  - [x] `OAuthKeyCreated` domain event emitted from `decideOAuthConsent` after BA accepts (no-op handler in `apps/workers`).
  - [x] Theme switcher moved from the navbar to the user-menu dropdown.
  - [x] Cache-invalidation on revoke (both API keys + OAuth keys): web's `deleteApiKey` routed through `revokeApiKeyUseCase`; `revokeOAuthKeyUseCase` busts every deleted access token's Redis entry. `ApiKeyCacheInvalidatorLive` lives in `@platform/api-key-auth`; new `OAuthTokenCacheInvalidatorLive` lives in `@platform/oauth-token-auth`. Session cookie cache (BA, 5-min TTL) left as-is — known trade-off; document where security-sensitive.
- **M-OAuthKeysApi — Public OAuth Keys endpoints** (3 endpoints, prefix `/oauth-keys`, **never expose tokens**)
  - [x] `GET /` — list, `low` tier. Reuses `listOAuthKeysUseCase`. Response is the metadata-only `OAuthKey` shape — no token field of any kind.
  - [x] `GET /{oauthKeyId}` — get one by composite `${clientId}:${userId}` id, `low` tier. New `getOAuthKeyUseCase` calls `OAuthKeyRepository.findByPair` (JOIN-reads the same shape as `listForOrganization`, RLS-scoped). 404s on miss / malformed id / cross-tenant — all collapse to the same `OAuthKeyNotFoundError`.
  - [x] `DELETE /{oauthKeyId}` — revoke, mounted under the `low` tier prefix; reuses `revokeOAuthKeyUseCase` (cache-invalidates each removed token and disables the application when the last token is gone). 204 on success and on idempotent re-revoke; 404 only for cross-tenant / malformed ids.
  - [x] `apps/api/src/routes/oauth-keys.ts` — new file, `defineApiEndpoint`-native. Wires `OAuthTokenCacheInvalidatorLive(c.var.redis)` + `OAuthKeyRepositoryLive`. Composite id parsed via `lastIndexOf(":")` since `userId` is a CUID (no colons).
  - [x] No POST / PATCH. Out-of-scope notes in the "Endpoint inventory" section.
- **M4 — Traces + bulk export** (3 endpoints, prefix `/projects/{projectSlug}/traces`)
  - [x] `GET /` — list with filters + searchQuery + cursor, `Paginated(TraceSchema, "PaginatedTraces")`. Cursor is base64url-encoded JSON of `{sortValue, traceId}` so the public API surface stays a plain opaque string. `filters` accepted as URL-encoded JSON, decoded + validated against `filterSetSchema` inside the Effect. `sortBy` constrained to `{startTime,endTime,durationNs,tokensTotal,costTotalMicrocents}` with `startTime desc` defaults.
  - [x] `GET /{traceId}` — get; returns `TraceDetail` (includes `systemInstructions` + `inputMessages` / `outputMessages` / `allMessages`). rosetta-ai message payloads exposed as opaque `Record<string, unknown>` per item — modelling every provider's union would balloon the schema for limited downstream value.
  - [x] `POST /export` — `tracesRef` + `recipientEmail`. Recipient validated via `MembershipRepository.findMemberByEmail` (RLS-scoped). Enqueues the existing `"exports" / "generate"` worker; route-level adapter translates `TracesRef → { selection | filters }` so `buildTracesExportUseCase` stays as-is (per D8 note: "adapter is simpler"). Returns 202.
  - [x] Per-endpoint rate-limit tiers: traces prefix mounted at `medium` (existing single-tier-per-prefix convention); `app.use("/export", createTierRateLimiter("critical"))` adds the `critical` ceiling on the export endpoint. Hono runs both matching middlewares so the stricter `critical` limit (3/min/org) governs export.
  - [x] `apps/api/src/openapi/entities/trace.ts` — `TraceSchema` + `TraceDetailSchema` with field-by-field descriptions; spread shared `traceFields` so both schemas stay named distinct components for SDK + MCP consumers.
  - [x] `apps/api/src/routes/traces.test.ts` — 8 integration tests cover the auth gate, empty-result listing, cursor + filters validation, get 404, recipient-member enforcement on export, and the happy-path 202.
  - [x] `buildTracesExportUseCase` refactor deferred — keeping the queue contract (`filters? + selection? + searchQuery?`) stable means the web caller stays unchanged and the API route translates at the boundary. Use-case keeps its current shape.

- **M5 — Saved Searches** (6 endpoints, prefix `/projects/{projectSlug}/searches`)
  - [x] `GET /` — list, `low` tier. Uses the standard paginated wrapper; fits in a single page (`nextCursor` always `null`).
  - [x] `GET /{searchSlug}` — get, `low` tier.
  - [x] `POST /` — create, `low` tier. **OAuth-only** (the authenticated user becomes `createdByUserId`); API-key callers hit 403 via `requireOAuthUserId`. Slug derived from `name`; 400 on empty search (no query and no filters).
  - [x] `PATCH /{searchSlug}` — update, `low` tier. Slug regenerates when the name change affects the slug form (reuses `updateSavedSearch`).
  - [x] `DELETE /{searchSlug}` — delete (soft-delete), `low` tier.
  - [x] `POST /{searchSlug}/assign` — assign (or clear with `userId: null`), `low` tier. New `assignSavedSearchUseCase` in `@domain/saved-searches` adds a cross-domain dep on `@domain/organizations` to validate via `MembershipRepository.isMember`; new `AssigneeNotOrgMemberError` (400). The use-case delegates to `updateSavedSearch` once membership is confirmed, so slug regeneration / name validation paths stay shared.
  - [x] `apps/api/src/openapi/entities/saved-search.ts` — `SavedSearchSchema` with field-by-field descriptions; `filterSet` reuses the named `FilterSet` OpenAPI component.
  - [x] `apps/api/src/routes/saved-searches.test.ts` — 11 integration tests cover auth gate, empty list, OAuth-only create + 403, happy-path create, empty-search 400, get 404, get-after-create, rename + slug regen, delete + 404 after, assign-non-member 400, assign + clear round-trip.
- **M6 — Issues** (11 endpoints shipped, prefix `/projects/{projectSlug}/issues`)
  - [x] `IssueRepository.findBySlug` + `existsBySlug` (port + Live impl + fake repo)
  - [x] Slug-on-create already wired in `createIssueFromScoreUseCase` (uses `generateSlug` + `countBySlug`). `discoverIssueUseCase` doesn't create issues directly — dispatches workflows that eventually run `createIssueFromScoreUseCase` — so no slug work needed there.
  - [x] `GET /` — list, `low` tier. Cursor-paginated wrapper over `listIssuesUseCase` (offset encoded as opaque base64url cursor). Query params expose the full filter + sort surface: `lifecycleGroup` (`active` / `archived`), `sortBy` (`lastSeen` / `occurrences` / `state`), `sortDirection`, `fromIso` / `toIso` for the analytics time window, and `query` for free-text semantic search (routes through `embedIssueSearchQueryUseCase` + `IssueRepository.hybridSearch` after the pgvector migration; no extra Weaviate layer). Returns the richer `IssueListItem` shape with `states`, `firstSeenAt`, `lastSeenAt`, `occurrences`, `affectedTracesPercent`, `trend` (14-day daily buckets), and `tags`. The `affectedTracesPercent` denominator now counts traces via `TraceRepository.countByProjectId` with a `startTime` filter (was `ScoreAnalyticsRepository.countDistinctTracesByTimeRange`), matching the web UI's value; web-side `withIssuesTraceTotals` override deleted.
  - [x] `GET /{issueSlug}` — get, `low` tier. Returns the full-detail `IssueDetail` shape: lifecycle `states`, lifetime activity stats (`firstSeenAt`, `lastSeenAt`, `occurrences`, `affectedTracesPercent`, `tags`), 14-day daily `trend`, active `evaluations` with alignment metrics, and `monitoringState` (`idle` / `generating` / `realigning` / `automatic`). The `automatic` variant + matching 400 on `POST /monitor` cover flagger-source issues that are auto-handled upstream. Backed by new `getIssueDetailsUseCase` in `@domain/issues` and `deriveIssueAlignmentState` helper in `@domain/evaluations`. State-sort direction flipped so `desc` puts regressed/escalating issues first (matches the UI convention).
  - [x] `GET /{issueSlug}/trend` — occurrence histogram, `medium` tier. Optional `fromIso`/`toIso`, default trailing 14 days, 12h UTC-aligned buckets (matches the web drawer's chart). New `getIssueTrendUseCase` reuses `ScoreAnalyticsRepository.histogramByIssues`.
  - [x] `GET /{issueSlug}/traces` — paginated trace list for the issue, `medium` tier. New `listIssueTracesUseCase` in `@domain/issues` zips analytics-side trace ids with `TraceRepository.listByTraceIds` and returns the standard `Trace` shape (so the public API surfaces the same fields the web's issue-traces tab consumes). Inline annotation indicators via the shared `fetchTraceIndicators` helper.
  - [x] `POST /resolve`, `POST /unresolve`, `POST /ignore`, `POST /unignore` — bulk by id list, `medium` tier. Each delegates to the existing `applyIssueLifecycleCommandUseCase`. `resolve` also accepts an optional `keepMonitoring` flag (defaults to the project-level setting). Idempotent — already-applied issues are returned with `changed: false`.
  - [x] `POST /{issueSlug}/monitor` (`critical`), `POST /{issueSlug}/unmonitor` (`medium`). New `monitorIssueUseCase` + `unmonitorIssueUseCase` in `@domain/evaluations` — monitor pre-checks the workflow isn't already running, then starts `optimizeEvaluationWorkflow` and writes the matching outbox event (`EvaluationCreated` on cold-start, `EvaluationAligned` on realign — split from the old `EvaluationConfigured`); unmonitor calls `EvaluationRepository.softDeleteByIssueId` for the issue. Monitor accepts an optional `actorUserId` (records a blank actor for API-key callers, matching the `generateApiKeyUseCase` pattern). Flagger-source issues are rejected on the start path (400 `automatically monitored`); realigning an existing eval on a flagger issue is still allowed. Web's `startEvaluationAlignment` collapsed into `monitorIssueUseCase`; `getIssueAlignmentStateUseCase` exposes the same `IssueAlignmentState` shape (`idle | generating | realigning | automatic`) to the drawer.
  - [x] **WorkflowStarter / WorkflowQuerier wiring on `apps/api`**: `apps/api/src/clients.ts` gains lazy `getWorkflowStarter()` + `getWorkflowQuerier()` backed by Temporal (mirrors the web). `ApiOptions` + `AppEnv` thread both through to `c.var.workflowStarter` / `c.var.workflowQuerier`; the test harness provides no-op fakes. New `@platform/workflows-temporal` workspace dep on `apps/api`.
  - [x] `POST /export` — `critical` tier. Body: `{recipient, issueIds?, lifecycleGroup?}`. Recipient validated via `MembershipRepository.findMemberByEmail`. Enqueues the existing `"exports" / "generate"` worker with `kind: "issues"`; the route translates `issueIds → selection.selected.rowIds` at the boundary so `buildIssuesExportUseCase` stays unchanged.
  - [x] `apps/api/src/openapi/entities/issue.ts` — `IssueSchema` (list-row, time-windowed stats) + `IssueDetailSchema` (lifetime stats + evaluations + monitoringState) + `IssueHistogramSchema` (trend response) + `PaginatedIssuesSchema`. ML internals (`uuid`, `centroid`, `clusteredAt`, dormant `escalatedAt`) are intentionally not exposed on the public API.
  - [x] `IssueListItem` (domain) gained a `slug` field so the API list response can identify issues by slug without an extra repo round-trip.
  - [x] Web's `listIssues` server fn now does **slug+id-first lookup** before semantic search — if the query exactly matches an issue id or slug it narrows to that issue and skips the embed call entirely. Cross-project guard on the id-match path. Falls through to pgvector semantic search on miss.
  - [x] Issue detail drawer surfaces the slug via the existing `CopyableText` chip (alongside the tag list) — copyable, ellipsis-truncates when there's no slack.
  - [x] **Dropped from M6** — `GET /{issueSlug}/incidents` (per coworker review). Alert incidents are a more general entity that will get their own top-level surface in a later milestone, rather than a per-issue carve-out under `/issues/{slug}`.
  - [x] 16 integration tests cover auth gate, empty list, cursor validation, get 404, recipient-member enforcement on export, happy-path 202, lifecycle bulk endpoints (404 / 400-on-empty / 401), monitor-OAuth-only, monitor 404, unmonitor 404. Domain-side tests: 70 across the use-cases shipped (`getIssueDetails`, `getIssueTrend`, `listIssueTraces`, `monitorIssue`, `unmonitorIssue`, `getIssueAlignmentState`).
- **M-Polish — Path-param + MCP output-validation cleanup**
  - [x] Renamed `/v1/api-keys/{id}` → `/v1/api-keys/{apiKeyId}` and `/v1/members/{id}` → `/v1/members/{memberId}` so every detail endpoint uses an entity-qualified path param (matches `{projectSlug}`, `{traceId}`, `{oauthKeyId}`, etc.). Per-route `ApiKeyIdParamsSchema` / `MemberIdParamsSchema`; generic `IdParamsSchema` deleted.
  - [x] Fixed MCP `outputSchema` mismatch on `getTrace` / `getSpan`: `systemInstructions` declared as `z.record(...)` but `rosetta-ai`'s `GenAISystem` is `z.ZodArray<z.ZodUnion<...>>`. Schema now `z.array(z.record(z.string(), z.unknown()))`; matching mapper iterates instead of single-casting. Spec components updated for both `GenAISystem` and `GenAISpanSystem`.
  - [x] Fixed `Text.H*` truncation: `ellipsis={true}` now forces `display: block` + drops the conflicting `whitespace-normal`, so `truncate` actually engages (was wrapping). Bring-along fix to `CopyableText` so the chip stays content-sized while still ellipsing under width pressure (`max-w-max` wrapper trick on the consumer side).
  - [x] Inlined indicator counts (positive / negative annotation counts) on every trace-returning endpoint via shared `fetchTraceIndicators` helper. New `positiveAnnotationCount` / `negativeAnnotationCount` fields on `TraceSchema`. The web's lazy `listAnnotationCountsByTraceIds` server fn left untouched — MCP/API callers want them inline; the web wants them loaded after the trace list.
  - [x] Audited every other tool response schema against its handler/mapper output — no further structural mismatches found (Annotation, Evaluation, Issue, SavedSearch, Span, Member, Project, ScoreResponse all type-check against the wire payload).
- **M-Analytics — Dashboard analytics endpoints** (2 endpoints)
  - Both endpoints mirror the existing web dashboards: a top-line value per metric over the requested range *plus* the per-bucket time series the UI's histogram chart binds to. Designed so agents can render the same charts users see at `/projects/{slug}/traces` and `/projects/{slug}/issues` without rolling their own rollups. Time-range query params are optional; defaults match the web dashboards' default windows.
  - **Response shape (both endpoints)**: one nested object per metric, keyed by short metric name. Each carries the appropriate aggregate (`total` for sums/counts, `median` for medians) plus a `buckets: [{ bucket, value }]` series. **Buckets are always 12-hour UTC-aligned** — matches `getIssueTrend` and the rest of the public surface. No `bucketSeconds` field. **Units are documented in the field `.describe()`, never in field names** (so `duration`, not `medianDurationNs`).
  - [x] **`GET /v1/projects/{projectSlug}/traces/analytics`** — `low` tier. Query: `fromIso?`, `toIso?`.
    - Metrics (top-level keys, each `{ total/median, buckets: [{ bucket, value }] }`):
      - `traces` — `total` is distinct trace count
      - `cost` — `total` is total cost (microcents — describe in field text)
      - `duration` — `median` is median wall-clock duration (nanoseconds — describe in field text)
      - `tokens` — `total` is sum of tokens
      - `timeToFirstToken` — `median` is median TTFT across LLM spans (nanoseconds — describe in field text)
      - `spans` — `total` is sum of span counts
    - Per-bucket series populated for **every** metric (so the web's histogram tab, which switches the rendered series when the user picks a metric, has all six pre-computed). Empty buckets return `value: 0`.
    - Domain: new `getTraceAnalyticsUseCase` in `@domain/spans` (`use-cases/get-trace-analytics.ts`) reuses `TraceRepository.aggregateMetricsByProjectId` (top-line totals/medians) + `TraceRepository.histogramByProjectId` with `bucketSeconds = 12h` (per-bucket series), then `denseTraceTimeHistogramBuckets` fills empty buckets. Trailing-7-day default range when neither bound is provided. Web's analytics panel keeps its existing adaptive-bucket fns — refactoring those would change the UI's chart granularity, so leave them alone.
  - [x] **`GET /v1/projects/{projectSlug}/issues/analytics`** — `low` tier. Query: `fromIso?`, `toIso?`.
    - Metrics (top-level keys; no `Issues` suffix):
      - `ongoing` — `total` only
      - `new` — `total` only
      - `escalating` — `total` only
      - `regressed` — `total` only
      - `resolved` — `total` only
      - `occurrences` — `total` plus `buckets: [{ bucket, value }]` (the only metric with a series, matching the web's issues panel where only the occurrences histogram is rendered).
    - Domain: new `getIssueAnalyticsUseCase` in `@domain/issues` (`use-cases/get-issue-analytics.ts`). Calls `ScoreAnalyticsRepository.listIssueWindowMetrics` for the in-window issue set, derives lifecycle states via `deriveIssueLifecycleStates` (same helper `listIssuesUseCase` uses) and rolls them up into the five counters, then `histogramByIssues` with `bucketSeconds = 12h` for the occurrences series. Trailing-7-day default range, UTC day boundaries.
  - [x] OpenAPI entities: `TraceAnalyticsResponseSchema` (`apps/api/src/openapi/entities/trace-analytics.ts`) + `IssueAnalyticsResponseSchema` (`apps/api/src/openapi/entities/issue-analytics.ts`). Empty-window cases return zeroed totals + empty bucket arrays (no 404 / 204).
  - [x] Integration tests: empty-project happy path, range scoping, invalid date-range 400 (`toIso < fromIso`), auth gate — `apps/api/src/routes/{traces,issues}.test.ts`.
  - [x] Fix: `packages/platform/testkit/src/clickhouse/test-clickhouse.ts` parameter-substitution regex broadened to accept ClickHouse types containing spaces, commas, and single quotes (e.g. `DateTime64(9, 'UTC')`). The previous `[\w()]+?` body wouldn't match those, so any chdb-backed test that hit a filter with a `startTime` (or similar typed) placeholder failed with `UNKNOWN_QUERY_PARAMETER`.
- **M-Incidents — List incidents endpoint** (1 endpoint)
  - The entity is `AlertIncident` internally; on the public API surface (HTTP / SDK / MCP) it's just `Incident` — Latitude doesn't have any other "incident" concept, so the `Alert` prefix is internal-only.
  - [x] **`GET /v1/projects/{projectSlug}/incidents`** — `low` tier. Query: `fromIso?`, `toIso?`, `sourceTypes?`, `sourceId?`, `kinds?`, `severities?`. All array filters accept repeated query keys (`?kinds=issue.new&kinds=issue.escalating`). The time window defaults to the trailing 7 days, matching the analytics endpoints. Returns `{ items: Incident[] }` ordered ascending by `startedAt`.
    - Repository: `AlertIncidentRepository.listByProjectInRange` renamed to `listByProjectId`; both time bounds are now optional, and the single-value `sourceType`/`kind`/`severity` filters were each widened to multi-value `sourceTypes`/`kinds`/`severities`. Callers updated (web's `alerts.functions.ts`, four existing test mocks).
    - OpenAPI entity: `IncidentSchema` (`apps/api/src/openapi/entities/incident.ts`) exposes the public fields — `id`, `organizationId`, `projectId`, `sourceType`, `sourceId`, `kind`, `severity`, `startedAt`, `endedAt`, `createdAt`. The internal-only `entrySignals` snapshot and `exitEligibleSince` dwell tracker are deliberately omitted; they're detector internals with no consumer use.
    - Integration tests: auth gate, empty-project happy path, ordering, each filter (`kind`, `severity`, `sourceId`), `[fromIso, toIso]` overlap scoping, malformed `kind` → 400.

- **M7 — Datasets** (10 endpoints, prefix `/projects/{projectSlug}/datasets`)
  - [x] `DatasetRepository.findBySlug` — port + Postgres adapter + fake (test in `packages/platform/db-postgres/src/repositories/dataset-repository.test.ts`). `existsBySlug` deliberately not added; `countBySlug > 0` already covers the slug-generation paths that needed it, and the API uses `findBySlug` directly.
  - [x] Slug generation in `createDataset`; slug regeneration in `renameDataset` + `updateDatasetDetails` — already wired in M1 groundwork, no changes needed.
  - [x] Datasets CRUD: `GET /` (`low`), `GET /{datasetSlug}` (`low`), `POST /` (`medium`), `PATCH /{datasetSlug}` (`medium`), `DELETE /{datasetSlug}` (`medium`). `PATCH` accepts partial `{ name?, description? }`; route fetches the current dataset and fills in unchanged fields so `updateDatasetDetails` (which still requires both) stays untouched. `DELETE` is soft-delete; slug becomes reusable.
  - [x] `apps/api/src/openapi/entities/dataset.ts` — `DatasetSchema` + `PaginatedDatasetsSchema`. Public fields only: `id`, `organizationId`, `projectId`, `slug`, `name`, `description`, `currentVersion`, `createdAt`, `updatedAt`. The internal `fileKey` and opaque `latestVersionId` are deliberately omitted.
  - [x] Integration tests in `apps/api/src/routes/datasets.test.ts` (11 cases): auth gate, empty list, happy-path create + 400 on empty name, get 404 + happy-path get, rename + slug regen + old-slug 404, description-only PATCH keeping slug, empty-PATCH 400, soft-delete + slug reuse, list ordering by `updatedAt` desc.
  - [x] Rows: `GET /{datasetSlug}/rows` (`high`), `POST /{datasetSlug}/rows` (`medium`), `DELETE /{datasetSlug}/rows` (`medium`). List takes optional `search` + a base64url-encoded keyset cursor (`{ createdAt, rowId }`). Insert accepts `{ rows: [{ id?, input, output?, metadata? }] }`; cell values accept `string | object | number | boolean | null`. Delete body carries the shared `ExportSelection` (`selected` / `all` / `allExcept`) so the SDK and MCP surface use one selection shape across endpoints.
  - [x] `POST /{datasetSlug}/rows/import/traces` (`critical`) — takes `{ traces: TracesRef }`. Route resolves the ref to a concrete `TraceId[]` via `resolveTraceIdsFromRef`, then calls `addTracesToDataset` with `source: { kind: "project" }` + `selection: { mode: "selected", traceIds }`. Use-case unchanged.
  - [x] `POST /{datasetSlug}/rows/export` (`critical`) — body: `{ selection?: ExportSelection, recipient }`. Recipient validated via `MembershipRepository.findMemberByEmail`. Enqueues `kind: "dataset"` on the existing `"exports" / "generate"` worker contract. Returns 202.
  - [x] CSV import (`POST /rows/import/files`) — **deferred (D16)**. `TODO(file-imports)` comment near the import endpoint records the open question.
  - [x] `addTracesToDataset` refactor deferred — kept the richer `{ source, selection }` shape and added a thin route-level adapter, per the plan's "adapter is simpler" note. Web caller unchanged.
  - [x] `apps/api/src/openapi/entities/dataset-row.ts` — `DatasetRowSchema` with field-by-field descriptions. Row cell values typed as `string | Record<string, unknown>` (reads) — inserts widen to also accept `number | boolean | null`.
  - [x] Integration tests in `apps/api/src/routes/datasets.test.ts` (9 additional cases on top of the CRUD set, 20 total): empty-rows page, insert + version bump, empty-insert 400, `mode: all` delete with `deletedCount`, non-existent row id → 404, export rejects non-member, export 202 happy path, export `recipient` shape 400, import-from-traces empty filter set → 201 + zero rows.
- **Wrap-up**
  - [ ] `pnpm generate:sdk` — batched at the end of the plan, single PR (per the standing memo)
  - [ ] CI drift jobs for `apps/api/openapi.json` and `apps/api/mcp.json` (verification §)
