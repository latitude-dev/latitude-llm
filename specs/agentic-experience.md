# Agentic Onboarding Experience

> **Documentation**: `dev-docs/organizations.md`, `dev-docs/projects.md`, `dev-docs/users.md`, `dev-docs/spans.md` (existing); `dev-docs/agentic-onboarding.md` (to be created when this stabilizes).
>
> **Status**: **Phase 1 (Fern CLI generation) is complete** — the `latitude` CLI is generated, builds cross-platform, and has a publish workflow (branch `LAT-703/cli`). Phases 2–5 (bootstrap endpoint, claim flow, skills, launch) are not started. This spec spans **two repositories**: `latitude-dev/latitude-llm` (API, codegen, claim flow) and `latitude-dev/skills` (agent skills). Tasks are tagged `[llm]` or `[skills]`.
>
> **Base branch**: epic **LAT-703**; phases in `latitude-llm` fork from and PR into `development` with the `LAT-703/<scope>` branch prefix (Phase 1 = `LAT-703/cli`).

---

## 1. Vision

Let a developer's **AI coding agent** stand up Latitude observability end-to-end, with zero prior Latitude account, from a single copy-pasted prompt:

1. The agent instruments the user's app with Latitude telemetry.
2. The agent provisions a **temporary Latitude organization** (no human member required) and an API key over an **unauthenticated, IP-rate-limited** endpoint.
3. The agent iterates on instrumentation against the **bootstrap-created project** (named upfront), sending **real traces from the user's code** and inspecting them until the instrumentation is correct.
4. Once correct, the agent **deletes and recreates that project with the same name** (same slug ⇒ no config change) to wipe the messy iteration traces, then sends clean real traces — so the user inherits a tidy workspace with no debugging cruft.
5. The agent hands the user a **claim link** (and optionally emails it). A real person signs in/up and takes ownership of the now-populated organization — **without going through the normal onboarding flow**.

The result: the user sees real traces from their own code **before** ever creating an account, then claims a clean workspace that already has their data in it.

### 1.1 Why this is not "signup via MCP" (and must not become it)

This initiative is the **correct** realization of what PR #3710 ("signup via MCP", `createAccount` tool) attempted and got wrong. See [§3 Constraints & Rejected Approaches](#3-constraints--rejected-approaches): **MCP cannot host an unauthenticated tool**, so the bootstrap step must be an **HTTP endpoint driven by a CLI**, never an MCP tool.

### 1.2 CLI and MCP coexist

After onboarding, the user already has the **Latitude CLI** (and its skill) installed, so their agent can manage the org without OAuth. They *may* additionally connect the **Latitude MCP** (OAuth) now that they have an account. The two surfaces coexist; which one an agent uses is a per-user choice. The existing `latitude-telemetry` skill already anticipates MCP-assisted config discovery; this spec adds the CLI-driven path as the zero-account default.

---

## 2. Target experience (narrative)

```
Landing page CTA
  └─ "Set up Latitude observability with your AI agent"
     copy-paste prompt → user pastes into Claude Code / Cursor / Codex / etc.
        │
        ▼
latitude-setup skill (orchestrator) tells the agent to:
  1. Install the latitude-telemetry skill        (knows HOW to instrument)
  2. Install the latitude-cli skill + the CLI     (knows HOW to act on Latitude)
  3. CLI bootstrap (POST /v1/account/bootstrap — command name is Fern's call)
        → creates a TEMPORARY org (owner-less), named from agent-inferred
          organizationName, else "My Organization"
        → mints an org-scoped API key
        → creates ONE project named from agent-inferred projectName, else
          "My Project"  (NO sample/demo project)
        → returns { apiKey, projectSlug, claimUrl }   (+ optional email send)
  4. Configure CLI auth with the returned API key   (all later commands authed)
  5. Telemetry skill: instrument the app, pointing traces at projectSlug
  6. Run the USER'S REAL CODE → emit REAL traces → CLI: list traces
        → inspect span content (model, tokens, messages); fix instrumentation;
          repeat until traces are correct
  7. When correct, wipe the messy traces WITHOUT touching app config:
        CLI: delete the project, then recreate it with the SAME name
        → same slug ⇒ env vars / instrumentation need NO change
        → run the user's code once more → clean real traces
  8. Agent reports: "Live & clean! Claim your workspace: <claimUrl>
     (a claim email was also sent to you@example.com)"
        │
        ▼
User opens claimUrl IN A BROWSER  →  WEB claim route (not the API)
  └─ signs in or creates an account (magic link / OAuth, session-based)
     └─ becomes OWNER of the temporary org (claimed_at set → now a normal org)
     └─ NEW user → TRIMMED onboarding:
          • profile: name + org name → RENAMES the temp org (prefilled)
          • "Tell us about yourself": job title + phone (optional)
          • "Choose automatic flaggers"   (project is NOT renamable here)
          • "Get notified in Slack" (optional)
          • SKIP "What do you want to monitor?" + "waiting for first trace"
     └─ EXISTING user → NO onboarding; just a single org-rename screen
          (like creating an org from the dashboard today)
     └─ lands in the workspace with clean real traces
```

**Project lifecycle clarification.** There is **one project**, named with the final name from the start (agent-inferred `projectName`, else "My Project") — **no throwaway `testing` project**. The agent instruments and iterates against it; once the instrumentation is correct it **deletes the project and recreates it with the same name** to wipe the messy iteration traces. Because the recreated project keeps the **same name → same slug**, the app's telemetry config (`LATITUDE_PROJECT_SLUG`) needs **no change** across the cleanup. This also means that if the user abandons mid-iteration and claims early, the project they inherit has a sensible name (not "testing"). **Hard requirement:** delete+recreate must preserve the slug (see §5.4).

> **User-facing naming:** this whole construct is branded a **"Temporary account"** in product copy / CLI / docs, even though it is technically a temporary *organization*.

### 2.1 Two entry points (new user vs. existing account)

The narrative above is **Path A** (no Latitude account). There is a second entry point that must **not** use the temporary-account bootstrap:

- **Path A — landing CTA, no account.** Prompt → **`latitude-setup`** skill → bootstrap a Temporary account → instrument → claim. Full flow as above.
- **Path B — in-app CTA, already signed in** (e.g. the "create a new blank project" empty-state in the app). The user already has an org and can mint an API key in-app, so there is **no bootstrap and no claim**. The in-app prompt should point the agent **directly at `latitude-telemetry` (+ `latitude-cli`)**, skipping `latitude-setup`. The CLI authenticates with the user's real API key (created in-app, or via the CLI/MCP), and the agent instruments straight into a real project.

In short: `latitude-setup` is the **zero-account orchestrator only**; the authenticated in-app path composes `latitude-telemetry` + `latitude-cli` without it.

---

## 3. Constraints & Rejected Approaches

### 3.1 MCP cannot host unauthenticated tools — do not retry a `createAccount`/signup MCP tool

This is the durable lesson from PR #3710. It must not be re-attempted.

- **MCP authorization is transport-level and all-or-nothing.** The MCP spec defines auth "at the transport level," optional *for the whole server*. If a server is a protected resource (returns `401` + `WWW-Authenticate` to a tokenless request — which is what triggers OAuth 2.1 + Dynamic Client Registration), then **every** request requires a bearer token, including `tools/list`. ([MCP authorization spec](https://modelcontextprotocol.io/specification/draft/basic/authorization))
- **Latitude's MCP (`/v1/mcp`) is exactly this protected-resource model.** Auth is enforced at the transport entry (`apps/api/src/routes/index.ts` mounts `/mcp` on the auth-guarded `routes` object; `apps/api/src/mcp/server.test.ts` asserts a tokenless request gets `401`). OAuth tokens are rejected unless bound to an organization (`packages/platform/oauth-token-auth/src/validate-oauth-token.ts`). So to call **any** tool the caller already needs an account + an org + completed consent — the bootstrap chicken-and-egg cannot be solved there.
- **Per-tool "public vs authenticated" is only a Draft proposal, not core, not broadly supported.** [SEP-1488](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1488) ("securitySchemes in Tool Metadata for Mixed-Auth Servers", Draft, Sept 2025) adds optional per-tool `securitySchemes` (`noauth`/`oauth2`), but it is metadata only (the server still enforces), it is **not in MCP core**, and the only consumer today is OpenAI's Apps SDK / ChatGPT. General clients (Claude, Cursor) do not honor it.

**Conclusion:** the account-bootstrap surface is an **HTTP endpoint** exposed through the **CLI** (and SDKs). It is deliberately **OpenAPI-visible but never MCP-registered** (see §5.2). The MCP remains a post-claim, authenticated convenience.

### 3.2 Reuse domain use-cases; do not hand-roll auth primitives

PR #3710 hand-reimplemented better-auth's magic link by directly inserting verification rows. This spec reuses existing use-cases (`generateApiKeyUseCase`, `createProjectUseCase`, `transferOwnershipUseCase`) and the better-auth org/membership machinery, falling back to the admin RLS-bypass client only where genuinely required (owner-less org creation and claim-time member insertion).

---

## 4. Architecture overview

| Component | Repo | New / Changed | Role |
| --- | --- | --- | --- |
| `POST /v1/account/bootstrap` (unauth, IP-limited) | llm | **new** | Create temp org + API key (NO projects); return claim link. **Excluded from MCP + SDK; included in CLI.** |
| Temporary-org markers + claim data model | llm | **new** | `bootstrapped_at` / `claimed_at` timestamps + claim token |
| Web **claim route** + server fn (`apps/web`) | llm | **new** | Attach signed-in user as owner; skip onboarding. **Not** an API endpoint — mirrors `/auth/invite`. |
| `createIpRateLimiter` | llm | **new** | Per-IP limiting for the unauth surface |
| API-side captcha verify (Turnstile) | llm | **new (optional)** | Abuse mitigation |
| Lifecycle cleanup (expire unclaimed orgs) | llm | **new** | Temporal/queue job |
| Fern `local-cli` generator → `latitude` binary | llm | **done** | Auto-generated Rust CLI from `openapi.json` (`fernapi/fern-cli-generator`); `publish-cli.yml` ships cross-platform binaries |
| `latitude-cli` skill | skills | **new** | Teaches agent to install + use the CLI |
| `latitude-setup` skill | skills | **new** | Orchestrates the whole experience (incl. project lifecycle) |
| `latitude-telemetry` skill | skills | **review/update** | Add CLI-driven, zero-account path |
| Landing CTA + docs | llm/docs + marketing | **new** | Entry point + reference |

### 4.1 The bootstrap → claim data flow, grounded in code

- **Owner-less is legal.** `organizations` has **no owner column** (ownership is a `members` row with `role` ∈ `owner|admin|member`); `membership-repository.findFirstOwner` is documented to return `null` when there is no owner. So a temp org can exist with **zero members** until claimed.
- **No sample seeding for temp orgs.** Normal signup runs `provisionOrganizationWorkspaceUseCase` (`packages/domain/organizations/src/use-cases/provision-organization-workspace.ts`), which seeds a **default + sample** project. Temp orgs must **NOT** get the sample/demo project — bootstrap mints the org + API key + **one** named project (no sample). The agent never needs a separate throwaway project; it cleans by delete+recreate of that one project.
- **better-auth's `createOrganization` always creates an owner member** for the passed `userId`, so the bootstrap path must **bypass better-auth** and insert the org row directly via the **admin (RLS-bypass) client** — the same path the backoffice/admin domain already uses.
- **Claim is a web/session flow, not an API endpoint.** The API authenticates only API keys / OAuth bearers (`createAuthMiddleware`), with no concept of a logged-in human session; claiming requires a better-auth session established by sign-in/sign-up in the browser. So claim lives in `apps/web` as a route + server function (mirroring `apps/web/src/routes/auth/invite.tsx`), calling the shared `claimOrganizationUseCase`. It attaches the new user as `owner` via the admin client (RLS on `members` otherwise blocks inserting into an org you're not in) and sets `claimed_at`. `transferOwnershipUseCase` is the reference for role mechanics.
- **API keys are org-scoped, not project-scoped** (`packages/domain/api-keys/src/entities/api-key.ts`); the project is selected per-trace via the `X-Latitude-Project` slug header. One bootstrap key covers the whole temp org and its project across the delete+recreate cleanup.
- **Telemetry** flows to ingest `POST /v1/traces` (`apps/ingest/src/routes/traces.ts`) with `Authorization: Bearer <key>` + `X-Latitude-Project: <slug>`; `listTraces` + the project's `firstTraceAt` give the inspection/verification signal the agent loops on.

---

## 5. Subsystem designs

### 5.1 Temporary-org markers + claim model `[llm]`

**Distinguish temporary vs claimed via two timestamps (not a boolean).** Add two nullable columns to `organizations`:

- `bootstrapped_at timestamptz null` — set at creation **only** for orgs created via `/v1/account/bootstrap`; `null` for normally-created orgs. **Immutable** (kept even after claim, so analytics can still tell an org *originated* as a temp/agent org).
- `claimed_at timestamptz null` — `null` while unclaimed; set when a user claims it.

This yields three clean, indexable states:

| State | Predicate |
| --- | --- |
| Normal org (never temporary) | `bootstrapped_at IS NULL` |
| Temporary, unclaimed (active) | `bootstrapped_at IS NOT NULL AND claimed_at IS NULL` |
| Was temporary, now claimed (normal) | `bootstrapped_at IS NOT NULL AND claimed_at IS NOT NULL` |

- **"Don't do automatic things to temp orgs"** → guard background jobs/automations on `bootstrapped_at IS NOT NULL AND claimed_at IS NULL`.
- **Cleanup** of expired unclaimed orgs → that same predicate `AND bootstrapped_at < now() - <TTL>`. Expiry is **derived from `bootstrapped_at + TTL`**; no separate `expires_at` column needed unless per-org TTLs are wanted (open question §7).
- **Analytics** → conversion = claimed / bootstrapped.

**Claim token.** Add an `organization_claims` table — do **not** overload better-auth `verifications` (PR #3710's mistake of coupling to better-auth internals). Columns: `id`, `organization_id`, `token_hash` (store a SHA-256 hash, not the raw token — the raw token only lives in the claim URL), `email text null`, `expires_at`, `claimed_at null`, timestamps. RLS-exempt platform table (like the outbox), accessed via the admin client.

**Claim ≠ invitation.** Invitations (`invite-member`) cannot grant `owner` and require an existing inviter member; the temp org has neither. So claim is a **bespoke flow**, not a better-auth invitation. The email is just a delivery channel for the claim URL.

### 5.2 Unauthenticated bootstrap endpoint `[llm]`

Path: **`POST /v1/account/bootstrap`** — lives in the `account` group alongside the existing authenticated `GET /v1/account`, but is itself **unauthenticated**.

- **Mount point (bypasses auth).** The auth middleware is applied to `*` of the protected `routes` object (`apps/api/src/routes/index.ts:49-56`), so anything in the current `createAccountRoutes()` (mounted on `routes` at line 70) is authenticated. To keep `GET /v1/account` authenticated while `POST /v1/account/bootstrap` is public, add a small **public account sub-app** (e.g. `createPublicAccountRoutes()`) mounted on the **`v1` router *before* `v1.route("/", routes)`**. It inherits the infra vars set by `v1.use("*")` (db/redis/etc.) but never hits the auth middleware (which lives inside `routes`). Hono resolves `/v1/account/bootstrap` to the public sub-app (only it declares that path) and `/v1/account` to the protected router. **Verify with a routing test** (P1-6): unauth POST to bootstrap succeeds; GET still 401s without a token.
- **Public security scheme.** Today only `PROTECTED_SECURITY` exists in `apps/api/src/openapi/schemas.ts`; add `PUBLIC_SECURITY = []` (or omit `security`) for this route.
- **Exclusion settings (required):**
  - **Not an MCP tool** — register via plain `createRoute` + `.openapi(...)` (NOT `defineApiEndpoint`), so it is never added to the MCP tool registry (`registerEndpoint` is only called by `defineApiEndpoint.mountHttp`). It will be absent from `mcp.json`.
  - **Not an SDK method, but yes a CLI command** — both are Fern-generated from the same `openapi.json`. Tag the route with a CLI-only **Fern audience** (`x-fern-audiences: ["cli"]`, alongside the existing `x-fern-*` vendor extensions the routes already use). Configure the TS + Python SDK generator groups to generate only the public audience (excluding `cli`) and the CLI generator group to include `cli`. **Exact per-generator audience filtering is a Phase-1 spike item** (§5.5); fallback is emitting a CLI-only OpenAPI that includes bootstrap and an SDK OpenAPI that filters it out.
- **Request body:** `{ organizationName?, projectName?, email? }` — all optional and **agent-inferred**. `organizationName` names the temp org (prefills the claim onboarding's org-name field, §5.3); `projectName` names the single project created below; `email` is the optional claim-email recipient.
- **Handler:** `bootstrapTemporaryWorkspaceUseCase` (new, in `@domain/organizations` or a new `@domain/onboarding`): create owner-less org named `organizationName ?? "My Organization"`, `bootstrapped_at = now()` (admin client) → `generateApiKeyUseCase` for an org-scoped key → **`createProjectUseCase` for ONE project named `projectName ?? "My Project"`** → create the `organization_claims` row → if `email` provided, emit `OrganizationClaimRequested`. Creates **exactly one project** and **no sample/demo seeding** (the sample project comes later, at claim, §5.3).
- **Response:** `{ organizationId, organizationSlug, projectSlug, apiKey: { id, token }, claimUrl, emailSent: boolean }` — the agent instruments against `projectSlug` immediately.
- **Rate limiting: 1 request / minute, keyed by IP.** Reuse `createTierRateLimiter` with a **new `max` tier** (`{ maxRequests: 1, windowSeconds: 60 }`) added to `TIER_LIMITS`, and **generalize its key**: scope by `c.get("organization")?.id` when an org is set, else the client IP (first `X-Forwarded-For` hop), else `"unknown"` — reflected in both the key value and the prefix scope (`org`/`ip`/`unknown`). Because bootstrap is unauthenticated (no org context), `createTierRateLimiter("max")` keys by IP automatically; no separate IP limiter is needed, and the generalization is backwards-compatible for the existing org-scoped routes.
- **Guardrails:** see §6.

### 5.3 Claim flow — web route, not an API endpoint `[llm]`

Claiming is browser/session-based and mirrors `apps/web/src/routes/auth/invite.tsx`. There is **no `/v1/account/claim` API endpoint**; nothing about claim appears in the SDK, MCP, or CLI surface.

- **Web route** (e.g. `apps/web/src/routes/auth/claim.$token.tsx` or `/claim`): reads the claim token from the URL; calls `getSession()`; if no session, **redirects to `/login`** preserving the claim token (and prefilled email when known), exactly like the invite route. After sign-in/sign-up the user returns to the claim route.
- **Server function** (web): on confirm, calls the shared domain `claimOrganizationUseCase` — validate token (hashed lookup in `organization_claims`, not expired, not already claimed) → make the authenticated user **owner** of the org via the admin client (RLS bypass) → set `organizations.claimed_at` + consume the claim row → set it as the active organization. Because the temp org is owner-less, this *assigns* ownership; the user ends up the org's owner. **Latitude is multi-org** (there's an org selector), so for a user who already has other orgs this simply adds the claimed org to the ones they own.
- **Trimmed claim onboarding (not the full signup onboarding).** After claim, route into a **claim-specific onboarding** that reuses the existing isolated step components but with a different sequence and a **rename instead of create**. The normal flow is `/welcome` (create org) → `/projects/{slug}/onboarding` step machine `role → stack → flaggers → slack → telemetry` (`onboarding-flow.tsx`; completion = `project.settings.onboardingCompleted` via `completeProjectOnboarding`). The claim variant:
  - **Profile (name + org name → RENAME):** like `/welcome` but calls `updateUser({ name })` + **`updateOrganization({ name })`** on the existing temp org (prefilled with the agent-inferred name from bootstrap) — **never `createOrganization`** and **never re-provisions** (no default/sample project from here; the temp org already has the agent's final project, and the sample project comes from the on-claim seed job below).
  - **"Tell us about yourself":** reuse `RoleStep` → `submitOnboarding` (job title + phone). The `stackChoice`/`onboardingType` it normally also captures is moot here (telemetry screen dropped) — pass a sane default or make it optional.
  - **"Choose automatic flaggers":** reuse `FlaggersStep` → `configureProjectFlaggersForOnboarding({ projectId, enabledSlugs })`, targeting the org's project. **Hide/disable the step's project-name input** — the project already has its final name (from bootstrap); renaming happens only at the org level.
  - **"Get notified in Slack":** reuse `SlackStep` (env-gated, skippable).
  - **SKIP** `StackStep` ("What do you want to monitor?") and `TelemetryStep` ("waiting for first trace") — the agent already instrumented and sent real traces.
  - **Complete:** `completeProjectOnboarding({ projectId })`, then land in the workspace. New-user claim step sequence: `profile(rename) → role → flaggers → slack? → complete`.
- **Existing user → NO onboarding, rename-only.** A claimer who **already has an account** gets **no onboarding flow at all** — just a **single org-rename screen** (prefilled with the agent-inferred name), mirroring how creating an org from the dashboard has no onboarding today. No role/flaggers/Slack steps are forced (they can configure those later in settings). *(We may add onboarding for dashboard-created orgs in future, but not now.)*
- **Seed a sample project in the background, on claim.** On a successful claim, **enqueue a background job to create + seed a sample/demo project** for the org, exactly as normal onboarding does (reuse the existing sample-seeding path — `@domain/admin` `create-demo-project` / the sample portion of `provision-organization-workspace`). The org therefore ends up with the user's clean final project **plus** the explorable sample project, like any normally-onboarded org. (Do **not** re-create a "default" project or a new API key — those already exist from bootstrap.)
- **Claim email (optional) mirrors the invitation email.** When `email` was provided at bootstrap, the `OrganizationClaimRequested` email is a simple message with a **button linking to the claim URL**, styled like the existing invitation email. The claim link is the canonical hand-off; the email is just a convenience delivery.
- **Auth answer:** the claim route *is* gated — but by a **better-auth session in the web app**, not by API-key/OAuth-bearer auth. That is precisely why it cannot be a public-API route.

### 5.4 Instrumentation loop, project lifecycle, and verification `[llm]` `[skills]`

**Real traces, not synthetic.** Verification is done by running the **user's actual instrumented code** and inspecting the **real traces** it produces — never a synthetic span. This is richer (the agent confirms model, token counts, message capture, and span structure look right) and matches the telemetry skill's existing "run one representative LLM flow per use-case group" contract.

**Single project, named once; cleaned by delete+recreate.** There is **no throwaway `testing` project**. Bootstrap already created **one** project with the final name (`projectName ?? "My Project"`) and returned its slug.

**The loop (driven by `latitude-setup`):**

1. Instrument the app (via `latitude-telemetry`) with `LATITUDE_PROJECT_SLUG=<projectSlug from bootstrap>`.
2. Run the user's real LLM flow; spans land in the project.
3. `latitude traces list` to inspect incoming real traces; if instrumentation is wrong (missing spans, no token data, wrong boundaries), fix and re-run. Loop until correct.
4. **Wipe the messy traces without touching app config:** delete the project, then **recreate it with the same name** → **same slug**, so `LATITUDE_PROJECT_SLUG` and all instrumentation stay valid. Run the user's code once more → clean real traces.

**Slug-stability hard requirement (§2 lifecycle).** Step 4 only works if recreate yields the *identical* slug. The existing `deleteProject` is a **soft** delete (`projects.deletedAt`) and `createProjectUseCase` derives a unique slug via `countBySlug` — if that counts soft-deleted rows, recreate would get a suffixed slug and **break the no-config-change guarantee.** Phase 2 (P2-7) must resolve this with one of: a **hard delete** that frees the slug, a `createProject` that accepts/reuses an explicit slug, slug-uniqueness that ignores soft-deleted rows, or a dedicated **"clear project traces"** operation (which sidesteps delete/recreate entirely).

**CLI surface needed for the loop:** `projects create`, `projects delete`, `projects list`, `traces list` — **all map 1:1 to existing endpoints** (`createProject`, `deleteProject`, `listTraces`). No custom CLI commands required: to "watch" traces the agent simply **polls the generated `traces list`** until the expected spans appear.

### 5.5 CLI generation via Fern `[llm]`

**Implemented on `LAT-703/cli`.** The below reflects what shipped.

- **Generator.** The `local-cli` group in `fern/generators.yml` uses **`fernapi/fern-cli-generator`** (pinned `0.21.0`) — *not* the marketing `fernapi/fern-cli` name, which is a different/older image that silently no-ops. It reads `apps/api/openapi.json` and emits a **single Rust binary** (`latitude`) with typed subcommands, `--help`/`--schema`, multi-format output, and auth, into **`packages/cli/`**. Two config knobs are load-bearing: **`ir-version: v67`** (the generator isn't in the OSS Fern generator registry, so the CLI can't infer the IR version and errors without it) and **`config.customCommands: false`** (keeps the output a lean, dynamic single crate — no vendored SDK crates or command scaffolding). `config.binaryName: latitude` names the binary explicitly. Bumping the pinned Fern CLI (`fern.config.json`) to `5.60.0` was required so the toolchain accepts the generator.
- **`packages/cli` is fully generator-owned.** Fern overwrites the whole directory on every regen; only `CHANGELOG.md` and `.fernignore` are hand-owned (kept via `.fernignore`, which itself survives regen). It is **not** a pnpm package (Turbo/pnpm ignore it) — build/check it with `cargo`.
- **Wiring.** Root scripts: `generate:cli` (emit → `fern:check` → generate), `generate:all` (SDKs + CLI), `cli:build` (regenerate + `cargo build --release` → runnable binary at `packages/cli/target/release/latitude`), `cli:run` (invoke the built binary; args pass through with **no `--`**). `.github/workflows/api-manifests.yml` regenerates the CLI and fails on drift (`git diff --exit-code packages/cli`). `sdk:check` was renamed **`fern:check`** (it validates every group, CLI included).
- **Publishing (`publish-cli.yml`, fanned out from `publish-packages.yml` on push to `development`).** Mirrors the SDK publishers: **version comes from `packages/cli/CHANGELOG.md`'s top entry** (the crate `Cargo.toml` ships `0.0.0`; the workflow patches it at build time with `cargo set-version`), no-ops if a `cli-<version>` GitHub release already exists, then a **5-target matrix** builds and a release job attaches the binaries + extracted changelog. Assets use friendly Go-style names: `latitude-{linux,macos}-{amd64,arm64}.tar.gz` + `latitude-windows-amd64.zip` (not raw Rust target triples).
- **Linux is `-gnu`, not static-musl.** The generated crate's `keyring` dep vendors **libdbus** (C) for secret-service; static musl fails to link it on aarch64 (missing libgcc outline-atomics), whereas gnu links cleanly and `latitude auth login`/keyring works on desktop Linux (D-Bus present). The CLI targets consumer PCs, so Alpine/`scratch` static portability is intentionally out of scope. Linux builds use **rustls** (no runtime OpenSSL dependency); macOS/Windows keep native-tls (OS keychain). musl/ARM targets build via **`cross`**.
- **Auth setup.** The credential is the org-scoped API key, sent as `Authorization: Bearer <key>`. The CLI reads the **`LATITUDE_API_KEY`** env var, or a key stored via **`latitude auth login`** (OS keyring, with a file-backend fallback). The parameter is named `apiKey` (`api_key` in Python) across the SDKs and CLI via the OpenAPI security scheme's `x-fern-bearer` extension (see §7).
- **Generated = primitives; orchestration lives in the skill.** The CLI maps endpoints→commands 1:1 (`projects {create,delete,list}`, `traces list`, …). The **instrumentation loop and same-name delete+recreate cleanup are orchestration** encoded in `latitude-setup`, not the binary. **No custom commands** (`customCommands: false`); the agent polls the generated `traces list`.
- **Risk (resolved).** The generator produces a working, buildable CLI (validated locally and via `act`). Residual caveats — not blockers: it's a gated/beta generator (needs the `ir-version` pin + the `fern-cli-generator` image name), and the cross-platform build legs only run in real CI (`act` on Apple Silicon can't emulate the x86/cross legs). The hand-written-CLI-over-the-TS-SDK fallback was not needed.
- **Still pending → the audience split (Phase 2).** The `x-fern-audiences` mechanism to include the future `bootstrap` command in the CLI while excluding it from the TS/Python SDKs is **not yet proven** — there is no bootstrap endpoint yet. Confirm per-generator audience filtering when Phase 2 adds bootstrap; fall back to a two-spec emission if Fern can't filter per group.

### 5.6 Skills `[skills]`

All skills are a single `SKILL.md` with `name`/`description` frontmatter, installable via `npx skills add https://github.com/latitude-dev/skills --skill <name>`.

- **`latitude-cli`** — teaches the agent to install the binary, configure auth with the bootstrap API key, and use the primitives: `projects create/delete/list`, `traces list/tail`, org management. Secret-handling rules (never print the key in chat).
- **`latitude-setup`** — the orchestrator for the **zero-account path only** (Path A, §2.1); the authenticated in-app path points at `latitude-telemetry` + `latitude-cli` directly and skips this skill. Encodes the full flow with **run-real-code-and-inspect** verification: install `latitude-telemetry` + `latitude-cli` (+ binary) → `latitude bootstrap` (capture key + `projectSlug` + claimUrl) → configure CLI auth → delegate instrumentation to `latitude-telemetry`'s plan/approval flow (pointing at `projectSlug`) → run user code → inspect real traces → iterate → **delete + recreate the project with the same name** (slug unchanged) → clean run → present the claim link (and note the optional email). Must respect the telemetry skill's "plan, then wait for approval" contract before editing code, and **never print the raw API key in chat**.
- **`latitude-telemetry`** — review/update so it knows the zero-account CLI bootstrap path exists (today it assumes a key already exists or MCP-assisted discovery). Add a branch: "if no account, defer to `latitude-setup`/CLI bootstrap"; note the bootstrap `projectSlug` stays stable across the delete+recreate cleanup, so the telemetry config is written once.

---

## 6. Security model & abuse mitigations `[llm]`

The unauthenticated bootstrap endpoint is the crown-jewel risk — the exact abuse surface that sank PR #3710 (spam, resource exhaustion, free-tier farming). Mitigations:

- **Rate limiting: 1 request / minute, keyed by IP** — via the new `max` tier on the generalized `createTierRateLimiter` (org→IP→`unknown`). Phase 1, non-negotiable.
- **Temporary, low quotas + auto-expiry.** **Unclaimed** temp orgs get a small trace/retention quota and **expire 1 week after `bootstrapped_at`**; the cleanup job hard-deletes expired, unclaimed orgs. While unclaimed, temp orgs are **never** auto-seeded with sample data, billed, or enrolled in lifecycle automations (guard on the §5.1 predicate). **Sample seeding happens only at claim time** (§5.3), once a real owner exists.
- **Captcha (Cloudflare Turnstile) — deferred.** Turnstile exists in web/better-auth (`LAT_TURNSTILE_SECRET_KEY`) but there is **no API-side verify** today. Decision: ship the `1/min/IP` limit first; add an API-side Turnstile verify on bootstrap only if abuse appears.
- **No user enumeration.** Bootstrap creates a fresh org and does **not** look up existing users by email, so it avoids the cross-tenant enumeration oracle PR #3710 had. The optional `email` only addresses the claim email; it never branches behavior.
- **Don't leak the API key** beyond the response; the CLI stores it via the project's secret manager, not chat.
- **Bootstrap is CLI-only**: present in the CLI, **excluded from MCP and the SDKs** (§5.2). **Claim is web-only** — not in the API/SDK/MCP/CLI surface at all (§5.3). This keeps the unauthenticated/abuse-prone surfaces off the machine-facing SDK/MCP product entirely.

---

## 7. Decisions (resolved)

These were settled during review and are reflected in the sections and tasks above.

1. **TTL & cleanup.** Unclaimed Temporary accounts expire **1 week** after `bootstrapped_at`, then hard-deleted (org + projects + keys + traces).
2. **Rate limit.** New **`max` tier = 1 request / minute** on `createTierRateLimiter`, generalized to key by org→IP→`unknown`; bootstrap (unauthenticated) keys by IP. Captcha deferred (§6).
3. **Claim with an existing account.** The claimer is made **owner** of the Temporary account; it's added to their orgs (multi-org / org selector already exists) — no merge/import.
4. **Claim onboarding depends on who claims (§5.3):**
   - **New user** (no account) → **trimmed onboarding**: profile (name + org name that **renames** the temp org, prefilled) → "tell us about yourself" → "choose automatic flaggers" (project **not** renamable here) → "get notified in Slack". **Skip** "what do you want to monitor?" + "waiting for first trace". No new/default org, no re-provision — the temp account is their first org.
   - **Existing user** → **no onboarding at all**, just a **single org-rename screen** (prefilled), like creating an org from the dashboard.
5. **Sample project on claim.** Claiming **kicks off a background job to create + seed a sample/demo project**, as normal onboarding does — so a claimed org looks like any onboarded org (clean final project + sample). No default project / API key is re-created (§5.3).
6. **Email.** Optional; the **claim link is canonical**. When provided, the email is a button → claim URL, styled like the invitation email (§5.3).
7. **No custom CLI commands needed.** The agent polls the generated `traces list`; a stock Fern CLI suffices (§5.4/§5.5).
8. **CLI.** Name **`latitude`**, package **`packages/cli`**, Fern-generated; command names are Fern's call.
9. **Endpoint placement.** Bootstrap = `POST /v1/account/bootstrap`, unauthenticated, mounted to bypass auth, `PUBLIC_SECURITY`, **excluded from MCP + SDK, included in CLI**. Claim = **web route** in `apps/web`, session-gated, **not** an API endpoint.
10. **Two entry points (§2.1).** Landing CTA (no account) → `latitude-setup`; in-app new-project CTA (already signed in) → `latitude-telemetry` + `latitude-cli` directly, **no bootstrap/claim**. Marketing copy lives on the landing/in-app, not in this spec.
11. **User-facing naming.** "**Temporary account**" everywhere user-facing (technically a temporary organization).
12. **Single project, named once.** Bootstrap creates **one** project named `projectName ?? "My Project"` (agent-inferred), returned as `projectSlug`. **No throwaway `testing` project.** Cleanup = **delete + recreate with the same name** (same slug ⇒ no app-config change). Bootstrap also receives the optional `organizationName` (`?? "My Organization"`). The `FlaggersStep` must **not** allow project renaming.

_Resolved during Phase 1 (§5.5):_

13. **CLI generator.** `fernapi/fern-cli-generator@0.21.0` with `ir-version: v67`, `config.customCommands: false`, `config.binaryName: latitude` (requires the pinned Fern CLI at `5.60.0`). `packages/cli` is fully generator-owned; only `CHANGELOG.md` + `.fernignore` are hand-owned. Root commands: `generate:cli`, `generate:all`, `fern:check` (renamed from `sdk:check`), `cli:build`, `cli:run`.
14. **CLI/SDK auth = API key.** The OpenAPI security scheme carries `x-fern-bearer: { name: apiKey, env: LATITUDE_API_KEY }` from a single `API_SECURITY_SCHEME` constant shared by the live spec (`server.ts`) and the emitter (`scripts/emit-openapi.ts`). The credential parameter is `apiKey` (`api_key` in Python) across CLI + both SDKs — this renamed the prior `token` param — and falls back to the `LATITUDE_API_KEY` env var. On Linux the CLI's `auth login` uses the OS keyring (D-Bus/secret-service) with a file-backend fallback.
15. **CLI release = GitHub Release binaries** (`publish-cli.yml`, no npm/PyPI). Version is read from `packages/cli/CHANGELOG.md` and injected at build time (`cargo set-version`); the CLI is versioned independently of the SDKs (starts at `0.1.0`). Five friendly-named assets — `latitude-{linux,macos}-{amd64,arm64}.tar.gz` + `latitude-windows-amd64.zip`. **Linux = gnu** (so keyring/D-Bus works; static-musl dropped — it can't link the vendored libdbus on aarch64 and the CLI targets consumer PCs, not Alpine/`scratch`), rustls TLS; macOS/Windows native-tls. Binary signing / package-manager distribution deferred.

### Remaining true unknowns (spikes, not product decisions)

- **Fern per-generator audience filtering.** CLI generation itself is now proven (§5.5), but the audience split is still untested — confirm Fern can include the future bootstrap command in the CLI while excluding it from the TS/Python SDKs (via `x-fern-audiences` + per-group config), or fall back to a two-spec emission (§5.2/§5.5). Deferred to Phase 2 (there is no bootstrap endpoint to tag yet).
- **Slug stability across delete+recreate.** Confirm recreate yields the identical slug (hard delete / explicit-slug create / soft-delete-ignoring uniqueness), or adopt a "clear project traces" operation instead (§5.4).

---

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`
>
> Each phase ≈ one PR. `[llm]` = `latitude-llm` repo, `[skills]` = `latitude-dev/skills` repo. **Phase 1 (CLI) comes first to de-risk the core unknown** — whether Fern can autogenerate a CLI from `openapi.json` at all (as it already does the API docs + TS/Python SDKs). Order then follows dependency: **1 (CLI) → 2 (bootstrap, applies the CLI audience mechanism) → 3 (claim, needs bootstrap) → 4 (skills) → 5 (launch)**.

### Phase 1 — Auto-generate the Latitude CLI via Fern `[llm]` — **complete** (`LAT-703/cli`)

> De-risk the core unknown first: can we autogenerate a CLI from `openapi.json` like we do the docs/SDKs? **Result: yes** — a working Rust `latitude` binary generates against the current spec, builds cross-platform, and has a publish workflow. The bootstrap command is added later in Phase 2 via regen.

- [x] **P1-1**: Spiked Fern's CLI generator against `apps/api/openapi.json` — produces a working Rust binary, wires API-key auth (`LATITUDE_API_KEY`), and runs existing commands. Done via `fernapi/fern-cli-generator@0.21.0` + `ir-version: v67` + `customCommands: false` (§5.5); production-ready enough, the TS-SDK fallback was not needed.
- [ ] **P1-2** *(deferred to Phase 2)*: Confirm **per-generator audience filtering** (`x-fern-audiences`) so a future endpoint ships in the CLI but is excluded from the TS/Python SDKs. Untested — there is no `cli`-only endpoint to tag yet; all generators currently emit from the same full spec.
- [x] **P1-3**: Added the `local-cli` group to `fern/generators.yml` and created **`packages/cli`** (binary `latitude`). Note vs. plan: `packages/cli` is **fully generator-owned** (not a hand-written shell like the SDKs) — only `CHANGELOG.md` + `.fernignore` are hand-owned. Audience configuration deferred to P1-2/Phase 2.
- [x] **P1-4**: Added `generate:cli` / `generate:all` / `cli:build` / `cli:run` (and renamed `sdk:check`→`fern:check`); the `api-manifests.yml` drift check covers `packages/cli`; **`publish-cli.yml`** ships **GitHub Release binaries** (5 cross-platform targets), fanned out from `publish-packages.yml`. Deviation from plan: **GitHub Releases only — no npm and no binary signing yet** (deferred).
- [x] **P1-5**: The CLI builds and its command surface (`projects {create,delete,list}`, `traces list`, …) is runnable via `cli:build` + `cli:run`; build + package + artifact-upload validated via `act` and local `cargo`. **Confirmed working against production** with a real API key.

**Exit gate**: met — `latitude` builds from the current spec, authenticates via API key (verified against production), drives the project/trace commands, has a publish workflow, and CI fails on spec/CLI drift. The only outstanding Phase-1 item is the audience-filtering proof (P1-2), deferred to Phase 2 since there's no bootstrap endpoint to tag yet.

### Phase 2 — Temp-org markers + unauthenticated bootstrap endpoint `[llm]`

- [ ] **P2-1**: Migration: add `organizations.bootstrapped_at` + `organizations.claimed_at` (nullable timestamptz) with an index supporting the §5.1 predicates.
- [ ] **P2-2**: Add `organization_claims` table (id, organization_id, token_hash, email null, expires_at, claimed_at null) — RLS-exempt platform table; repository in `@platform/db-postgres`.
- [ ] **P2-3**: `bootstrapTemporaryWorkspaceUseCase` — owner-less org named `organizationName ?? "My Organization"` (admin client, `bootstrapped_at = now()`) → `generateApiKeyUseCase` (org-scoped key) → `createProjectUseCase` for **one** project named `projectName ?? "My Project"` → create claim row → emit `OrganizationClaimRequested` when email present. **Exactly one project; NO sample/demo seeding.** Unit tests with fakes (no infra).
- [ ] **P2-4**: In `middleware/rate-limiter.ts`, add a **`max` tier** (`{ maxRequests: 1, windowSeconds: 60 }`) to `TIER_LIMITS`, and generalize `createTierRateLimiter`'s `keyGenerator`/`keyPrefix` to scope by `c.get("organization")?.id` if set, else client IP (first `X-Forwarded-For` hop), else `"unknown"`. Bootstrap uses `createTierRateLimiter("max")` (keys by IP, unauthenticated). Verify existing org-scoped routes are unaffected.
- [ ] **P2-5**: Add `PUBLIC_SECURITY = []` to `openapi/schemas.ts`; create `createPublicAccountRoutes()` (`POST /bootstrap`) using plain `createRoute` + `.openapi(...)` (NOT `defineApiEndpoint`, so it stays out of the MCP registry); tag the route `x-fern-audiences: ["cli"]` (via the Phase-1 audience mechanism). Mount it on the **`v1` router before `v1.route("/", routes)`** so it bypasses auth, yielding `POST /v1/account/bootstrap` while `GET /v1/account` stays authenticated.
- [ ] **P2-6**: Regenerate `openapi.json`; **assert**: route present in `openapi.json`, **absent from `mcp.json`**, **absent from generated TS + Python SDKs**, **present in the CLI** (Phase 1). Routing test: unauth `POST /v1/account/bootstrap` succeeds; `GET /v1/account` still returns `401` without a token. (Run `pnpm generate:sdk` only as the batched final step of the overall plan, not per phase.)
- [ ] **P2-7**: **Slug stability for delete+recreate** (§5.4): ensure deleting then recreating a project with the same name yields the **same slug** — via a hard delete that frees the slug, a `createProject` that accepts an explicit slug, or slug-uniqueness that ignores soft-deleted rows; **or** add a `clearProjectTraces` operation. Cover with a test, **including the CLI delete+recreate same-slug smoke test** deferred from Phase 1.

**Exit gate**: `curl -XPOST /v1/account/bootstrap` (no auth) returns org + API key + **one named project (`projectSlug`)** + claim link, with **no sample/demo project**; org has `bootstrapped_at` set, `claimed_at` null; delete+recreate of a project preserves its slug; IP-rate-limited (1/min); present in `openapi.json`, absent from `mcp.json` and both SDKs but **present in the CLI**; `GET /v1/account` unaffected; use-case tests pass key-free.

### Phase 3 — Claim flow + lifecycle `[llm]`

- [ ] **P3-1**: `claimOrganizationUseCase` — validate claim token (hash + not expired + not already claimed) → make the authenticated user `owner` via admin client (assigns ownership; org is owner-less) → set `organizations.claimed_at` + `organization_claims.claimed_at` → **enqueue the sample-project seeding job** for the org.
- [ ] **P3-2**: **Web** claim route in `apps/web` (e.g. `/claim/$token`) + server function — **no API endpoint**. Mirror `auth/invite.tsx`: read token, `getSession()`, redirect to `/login` (preserving token) when unauthenticated; on confirm call `claimOrganizationUseCase`, set active org, then route into the **trimmed claim onboarding** (P3-3).
- [ ] **P3-3** (new user): Build the **trimmed claim onboarding**, reusing the isolated step components (`RoleStep`, `FlaggersStep`, `SlackStep`) and `OnboardingForm` with sequence `profile(rename) → role → flaggers → slack? → complete`. Profile step calls `updateUser({ name })` + **`updateOrganization({ name })`** to **rename** the temp org (prefilled) — **not** `createOrganization`, no re-provision. `FlaggersStep` **must not** allow project renaming. **Skip** `StackStep` + `TelemetryStep`. Finish with `completeProjectOnboarding({ projectId })`. Make the magic-link/OAuth `callbackURL` + `/welcome` 0-orgs gate route a pending-claim user into this flow (not the default create-org step).
- [ ] **P3-3b** (existing user): **No onboarding** — a single **org-rename screen** (prefilled), then land in the workspace. No role/flaggers/Slack steps.
- [ ] **P3-4**: Background **sample-project seeding** on claim — reuse the existing onboarding sample/demo seeding (`@domain/admin` `create-demo-project` or the sample portion of `provision-organization-workspace`); do **not** create a default project or new API key.
- [ ] **P3-5**: `OrganizationClaimRequested` domain event + email worker + template — a button linking to the claim URL, styled like the invitation email (reuse outbox→worker, `organizationId: "system"`).
- [ ] **P3-6**: Cleanup job (Temporal workflow or scheduled queue) that hard-deletes unclaimed orgs **1 week** past `bootstrapped_at` (`bootstrapped_at IS NOT NULL AND claimed_at IS NULL AND bootstrapped_at < now() - interval '7 days'`) with their projects/keys/traces.
- [ ] **P3-7**: Tests: claim happy path (existing user → +1 owned org; new user → first org, no default org); trimmed onboarding renames the temp org (no new org, no re-provision); flaggers/Slack steps reachable; stack + telemetry steps absent; sample seeding kicked off; expired/used/invalid token; unclaimed cleanup at 1 week; automations skip unclaimed temp orgs.

**Exit gate**: a fresh user opens a claim link, authenticates, runs the **trimmed onboarding** (renames the temp org via the prefilled field, sets job title/phone, picks flaggers + Slack, with no "what to monitor"/first-trace screens), becomes owner of the populated org (their first org), a sample project is seeded in the background, and lands in the workspace; existing users get the org added to their org selector; expired unclaimed orgs reaped at 1 week; no RLS violations.

### Phase 4 — Skills: `latitude-cli` + `latitude-setup` (+ telemetry review) `[skills]`

- [ ] **P4-1**: Author `skills/latitude-cli/SKILL.md` — install the binary, configure auth with the bootstrap key, drive the primitives, secret-handling rules.
- [ ] **P4-2**: Author `skills/latitude-setup/SKILL.md` — orchestrate install → bootstrap (returns key + `projectSlug` + claimUrl) → auth → instrument against `projectSlug` (delegating to `latitude-telemetry`'s plan/approval) → run real code → inspect real traces → iterate → **delete + recreate the project with the same name** (slug unchanged) → clean run → present claim link/email. Encode "plan, then wait for approval" and "no real secrets in chat".
- [ ] **P4-3**: Review/update `skills/latitude-telemetry/SKILL.md` — add the zero-account CLI bootstrap branch; note that the **project slug stays stable** across the delete+recreate cleanup (no config re-edit); reconcile with the existing MCP-assisted-config section so the three skills compose.
- [ ] **P4-4**: Update the skills repo `README.md` table; verify `npx skills add … --skill latitude-setup` pulls the dependency skills.
- [ ] **P4-5**: Dry-run the full prompt on a sample TS app and a sample Python app; capture transcripts; fix skill wording gaps. Confirm the final workspace has exactly one clean project (same slug before/after cleanup) and that app config was never re-edited for the cleanup.

**Exit gate**: pasting the landing prompt into a fresh agent on a sample app produces: instrumented code, a temp org with **one clean project** (cleaned via same-name delete+recreate, slug unchanged) of verified real traces, and a working claim link — without the user touching the Latitude UI first.

### Phase 5 — Landing CTA, docs, and end-to-end QA `[llm/docs]` `[skills]`

- [ ] **P5-1**: Write the two prompts (§2.1): (a) **landing CTA** → `latitude-setup` (zero-account, full bootstrap+claim); (b) **in-app new-blank-project empty-state** → points at `latitude-telemetry` + `latitude-cli` directly (already authenticated, **no bootstrap/claim**). Copy lives on the landing/in-app surfaces, not in this spec.
- [ ] **P5-2**: Mintlify docs (`docs/`) page(s) for the agentic setup + CLI reference; link `llms.txt`.
- [ ] **P5-3**: E2E QA across agent harnesses (Claude Code, Cursor, Codex) and abuse testing of the bootstrap endpoint (rate limit, quotas, cleanup, temp-org automation guards).
- [ ] **P5-4**: Promote durable knowledge into `dev-docs/agentic-onboarding.md`; retire this spec when stable.

**Exit gate**: public CTA live; docs published; E2E validated on ≥2 harnesses and ≥2 languages; abuse mitigations verified.

---

## Appendix: key code references

- Unauth route pattern + mounting order: `apps/api/src/routes/index.ts` (`v1.use("*")` infra vars; auth middleware on `routes`; `v1.route("/", routes)` then `app.route("/v1", v1)` — mount the public account sub-app on `v1` *before* `routes`).
- Web session-gated claim precedent: `apps/web/src/routes/auth/invite.tsx` (`getSession()` → redirect to `/login` → `authClient.organization.acceptInvitation`); org server-fn pattern in `apps/web/src/domains/organizations/organizations.functions.ts`.
- Env types: `apps/api/src/types.ts` (`AppEnv` / `ProtectedEnv` / `OrganizationScopedEnv`).
- Rate limiter (org-keyed today; generalize key to org→IP→`unknown` + add `max` tier): `apps/api/src/middleware/rate-limiter.ts` (`TIER_LIMITS`, `createTierRateLimiter`, key lines ~128-129).
- API key generation: `packages/domain/api-keys/src/use-cases/generate-api-key.ts`; entity `…/entities/api-key.ts` (org-scoped).
- Org provisioning + sample seeding: `packages/domain/organizations/src/use-cases/provision-organization-workspace.ts` (its default-project + API-key parts are skipped at bootstrap; its **sample-project** part is reused as the on-claim background seed) and `packages/domain/admin/src/organizations/create-demo-project.ts`.
- Project create/delete + onboarding gate: `packages/domain/projects/src/use-cases/{create-project,delete-project}.ts`; web `apps/web/src/routes/welcome/index.tsx`, `…/_authenticated/-lib/is-project-onboarding-pathname.ts`.
- Onboarding step machine + reusable screens (for the trimmed claim onboarding): `apps/web/src/routes/_authenticated/projects/$projectSlug/-components/onboarding-flow.tsx` (sequence `role→stack→flaggers→slack→telemetry`) and `…/onboarding/steps/{role,stack,flaggers,slack,telemetry}-step.tsx`. Completion: `project.settings.onboardingCompleted` via `completeProjectOnboarding` (`apps/web/src/domains/projects/projects.functions.ts`).
- Claim-onboarding server fns to reuse: `updateUser` + `updateOrganization` (`apps/web/src/domains/{users/user.functions.ts,organizations/organizations.functions.ts}`), `submitOnboarding` (`user.functions.ts`), `configureProjectFlaggersForOnboarding` (`apps/web/src/domains/flaggers/flaggers.functions.ts`), `getActiveSlackIntegration` (`…/integrations/integrations.functions.ts`).
- Ownership mechanics: `…/use-cases/transfer-ownership.ts`; `…/ports/membership-repository.ts` (`findFirstOwner → null`).
- better-auth org/magic-link config: `packages/platform/db-postgres/src/create-better-auth.ts`.
- Telemetry SDK init + processor: `packages/telemetry/typescript/src/sdk/{init,processor}.ts`; env `…/env/env.ts` (`LATITUDE_TELEMETRY_URL`).
- Ingest: `apps/ingest/src/routes/traces.ts`, `…/middleware/{auth,project}.ts`.
- Trace inspection: `apps/api/src/routes/traces.ts` (`listTraces`); project `firstTraceAt` in `packages/domain/projects/src/entities/project.ts`.
- Codegen pipeline: `fern/generators.yml` (`local-typescript`/`local-python`/`local-cli` groups), `fern/invoke.sh`, `apps/api/scripts/{emit-openapi,emit-mcp}.ts`, `.github/workflows/api-manifests.yml`, root `package.json` (`generate:sdk`/`generate:cli`/`generate:all`/`fern:check`/`cli:build`/`cli:run`).
- CLI (Phase 1, done): generated crate `packages/cli/` (hand-owned `CHANGELOG.md` + `.fernignore`), `.github/workflows/publish-cli.yml` (+ its wiring in `publish-packages.yml`), API-key security scheme `apps/api/src/constants.ts` (`API_SECURITY_SCHEME` with `x-fern-bearer`, used by `server.ts` + `scripts/emit-openapi.ts`).
- MCP gating (rejected-approach evidence): `apps/api/src/mcp/{server.ts,registry.ts,define-endpoint.ts}`, `apps/api/src/openapi/schemas.ts` (`PROTECTED_SECURITY`), `packages/platform/oauth-token-auth/src/validate-oauth-token.ts`.
