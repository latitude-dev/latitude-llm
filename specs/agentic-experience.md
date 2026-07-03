# Agentic Onboarding Experience

> **Documentation**: `dev-docs/organizations.md`, `dev-docs/projects.md`, `dev-docs/users.md`, `dev-docs/spans.md` (existing); `dev-docs/agentic-onboarding.md` (to be created when this stabilizes).
>
> **Status**: **Phases 1–3 complete (in code).** Phase 1 (Fern CLI generation) shipped the `latitude` CLI (branch `LAT-703/cli`). Phases 2 (temp-org marker + unauthenticated `POST /v1/account/bootstrap`, in SDKs + CLI) and 3 (claim use-case + web claim route + rename + background sample-seeding + claim email + daily cleanup reaper) are both implemented on branch `LAT-704/temporary-accounts` (pending review/merge) so the full bootstrap→claim flow is testable end to end. The claim onboarding is complete: **new users** get the trimmed step-machine (profile/rename → role → flaggers → Slack → complete) and **existing users** get a rename-only screen (P3-3). Phases 4–5 (skills, launch) are next. This spec spans **two repositories**: `latitude-dev/latitude-llm` (API, codegen, claim flow) and `latitude-dev/skills` (agent skills). Tasks are tagged `[llm]` or `[skills]`.
>
> **Base branch**: phases in `latitude-llm` fork from and PR into `development`. Phase 1 = `LAT-703/cli`; Phases 2–3 = `LAT-704/temporary-accounts`.

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
     └─ becomes OWNER of the temporary org (expires_at cleared → now a normal org)
     └─ NEW user → TRIMMED onboarding:
          • profile: name + org name → RENAMES the temp org (prefilled)
          • "Tell us about yourself": job title + phone (optional)
          • "Choose automatic flaggers" (project renamable here, prefilled — name-only, slug stays fixed)
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
| `POST /v1/account/bootstrap` (unauth, IP-limited) | llm | **new** | Create temp org + API key + one project; return claim link. **Excluded from MCP** (plain `createRoute`); **included in both SDKs + CLI.** |
| Temporary-org marker + claim data model | llm | **new** | `organizations.expires_at` claim deadline (null once claimed) + `organization_claims` token |
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
- **Claim is a web/session flow, not an API endpoint.** The API authenticates only API keys / OAuth bearers (`createAuthMiddleware`), with no concept of a logged-in human session; claiming requires a better-auth session established by sign-in/sign-up in the browser. So claim lives in `apps/web` as a route + server function (mirroring `apps/web/src/routes/auth/invite.tsx`), calling the shared `claimOrganizationUseCase`. It attaches the new user as `owner` via the admin client (RLS on `members` otherwise blocks inserting into an org you're not in), clears `organizations.expires_at`, and sets `organization_claims.claimed_at`. `transferOwnershipUseCase` is the reference for role mechanics.
- **API keys are org-scoped, not project-scoped** (`packages/domain/api-keys/src/entities/api-key.ts`); the project is selected per-trace via the `X-Latitude-Project` slug header. One bootstrap key covers the whole temp org and its project across the delete+recreate cleanup.
- **Telemetry** flows to ingest `POST /v1/traces` (`apps/ingest/src/routes/traces.ts`) with `Authorization: Bearer <key>` + `X-Latitude-Project: <slug>`; `listTraces` + the project's `firstTraceAt` give the inspection/verification signal the agent loops on.

---

## 5. Subsystem designs

### 5.1 Temporary-org markers + claim model `[llm]`

**A single nullable column on `organizations`, where `null` is the normal state.** Add one column:

- `expires_at timestamptz null` — the claim deadline. Set to `now() + TTL` **only** for a temporary org (created via `/v1/account/bootstrap`) **while it's still unclaimed**. `null` for every normal org (existing orgs need no backfill) **and** once a temp org is claimed — **claiming clears it**, so a claimed org is indistinguishable from any other org (the desirable end state). No permanent "was temporary" marker on the org; that lifecycle fact lives in `organization_claims`.

This yields two clean, indexable states off one field:

| State | Predicate |
| --- | --- |
| Normal org (never temporary, or already claimed) | `expires_at IS NULL` |
| Temporary, unclaimed | `expires_at IS NOT NULL` |

- **"Don't do automatic things to unclaimed temp orgs"** → guard background jobs/automations on `expires_at IS NULL` (they only touch normal/claimed orgs).
- **Cleanup** of expired unclaimed orgs → `expires_at IS NOT NULL AND expires_at < now()` (a partial index on `expires_at` covers exactly this set). Expiry is stored directly, so no `bootstrapped_at + TTL` math and no per-org TTL question.
- **Analytics** (conversion = claimed / bootstrapped) → derived from `organization_claims` (a row per bootstrapped org; `claimed_at` set on those that converted), not from `organizations`.

**Claim token.** Add an `organization_claims` table — do **not** overload better-auth `verifications` (PR #3710's mistake of coupling to better-auth internals). Columns: `id`, `organization_id`, `token_hash varchar(64)` (a SHA-256 **hex** digest — always 64 chars, so the column is bounded, not `text`; the raw token only lives in the claim URL), `email text null`, `expires_at`, `claimed_at null`, timestamps. **Org-scoped with `organizationRLSPolicy`** like every other tenant table; token redemption (which happens before any org context exists) uses the admin client, which bypasses RLS.

The token is minted by **`generateOrganizationClaimUseCase`** (generates via `@repo/utils` `randomToken(length)`, hashes with `hash`, saves the claim row, returns the token + claim URL) — so the `organization-claim.ts` **entity stays pure** (schema + `createOrganizationClaim` factory only, no crypto/logic). `randomToken(length)` is a reusable crypto helper (hex-encoded, exact character length).

**Claim ≠ invitation.** Invitations (`invite-member`) cannot grant `owner` and require an existing inviter member; the temp org has neither. So claim is a **bespoke flow**, not a better-auth invitation. The email is just a delivery channel for the claim URL.

### 5.2 Unauthenticated bootstrap endpoint `[llm]`

Path: **`POST /v1/account/bootstrap`** — lives in the `account` group alongside the existing authenticated `GET /v1/account`, but is itself **unauthenticated**.

- **Mount point (bypasses auth).** The auth middleware is applied to `*` of the protected `routes` object (`apps/api/src/routes/index.ts:49-56`), so anything in the current `createAccountRoutes()` (mounted on `routes` at line 70) is authenticated. To keep `GET /v1/account` authenticated while `POST /v1/account/bootstrap` is public, register the bootstrap route (`registerBootstrapRoute(...)`) on the **`v1` router *before* `v1.route("/", routes)`**. It inherits the infra vars set by `v1.use("*")` (db/redis/etc.) but never hits the auth middleware (which lives inside `routes`). Hono resolves `/v1/account/bootstrap` to the public route (only it declares that path) and `/v1/account` to the protected router. **Verify with a routing test** (P2-6): unauth POST to bootstrap succeeds; GET still 401s without a token.
- **Public security scheme.** Today only `PROTECTED_SECURITY` exists in `apps/api/src/openapi/schemas.ts`; add `PUBLIC_SECURITY = []` (or omit `security`) for this route.
- **Exclusion settings (required):**
  - **Not an MCP tool** — register via plain `createRoute` + `.openapi(...)` (NOT `defineApiEndpoint`), so it is never added to the MCP tool registry (`registerEndpoint` is only called by `defineApiEndpoint.mountHttp`). It will be absent from `mcp.json`.
  - **Generated into the SDKs and CLI** — all three are Fern-generated from the same `openapi.json`, so bootstrap appears as `client.account.bootstrap(...)` (TS/Python) and `latitude account bootstrap` (CLI). _(An earlier design tried to keep bootstrap CLI-only via `x-fern-audiences`; that was **dropped** in Phase 2 — Fern's audience filtering was too fiddly and the SDK exposure is harmless, since the endpoint just ignores the SDK's API-key auth. See Phase 2 progress note → Audience split.)_
- **Request body:** `{ organizationName?, projectName?, userEmail? }` — all optional and **agent-inferred**. `organizationName` names the temp org (prefills the claim onboarding's org-name field, §5.3); `projectName` names the single project created below; `userEmail` is the optional claim-email recipient.
- **Handler:** `bootstrapOrganizationUseCase` (new, in `@domain/organizations`): create owner-less org named `organizationName ?? "My Organization"`, `expires_at = now() + TTL` (admin client) → `generateApiKeyUseCase` for an org-scoped key → **`createProjectUseCase` for ONE project named `projectName ?? "My Project"`** → create the `organization_claims` row → if `userEmail` provided, emit `ClaimEmailRequested` (deferred to Phase 3). Creates **exactly one project** and **no sample/demo seeding** (the sample project comes later, at claim, §5.3).
- **Response:** `{ organizationSlug, projectSlug, apiKey, claimUrl, claimEmail, claimExpiresAt }` — `apiKey` is the raw token string; `claimEmail` echoes the request's `userEmail` (`null` when omitted); `claimExpiresAt` is the ISO-8601 claim-link expiry (org is cleaned up if unclaimed by then). The agent instruments against `projectSlug` immediately.
- **Rate limiting: 1 request / minute, keyed by IP.** Reuse `createTierRateLimiter` with a **new `max` tier** (`{ maxRequests: 1, windowSeconds: 60 }`) added to `TIER_LIMITS`, and **generalize its key**: scope by `c.get("organization")?.id` when an org is set, else the client IP (first `X-Forwarded-For` hop), else `"unknown"` — reflected in both the key value and the prefix scope (`org`/`ip`/`unknown`). Because bootstrap is unauthenticated (no org context), `createTierRateLimiter("max")` keys by IP automatically; no separate IP limiter is needed, and the generalization is backwards-compatible for the existing org-scoped routes.
- **Guardrails:** see §6.

### 5.3 Claim flow — web route, not an API endpoint `[llm]`

Claiming is browser/session-based and mirrors `apps/web/src/routes/auth/invite.tsx`. There is **no `/v1/account/claim` API endpoint**; nothing about claim appears in the SDK, MCP, or CLI surface.

- **Web route** (e.g. `apps/web/src/routes/auth/claim.$token.tsx` or `/claim`): reads the claim token from the URL; calls `getSession()`; if no session, **redirects to `/login`** preserving the claim token (and prefilled email when known), exactly like the invite route. After sign-in/sign-up the user returns to the claim route.
- **Server function** (web): on confirm, calls the shared domain `claimOrganizationUseCase`, which validates **all** of the following before granting ownership (belt-and-suspenders against claiming the wrong org):
  1. **Token valid** — hashed lookup in `organization_claims`, `claimed_at IS NULL`, and `expires_at` in the future.
  2. **Org is genuinely a pending temp org** — `organizations.expires_at IS NOT NULL AND expires_at > now()` (not expired, not already normalized).
  3. **Org has no members** — `membership-repository.findFirstOwner` (or a member count) returns none. This is the key anti-theft guard: it guarantees we only ever assign ownership of an empty, owner-less org and can never attach a claimer onto someone's real, already-populated org (e.g. if a stale/forged token ever pointed at one).

  On success: make the authenticated user **owner** via the admin client (RLS bypass) → **clear `organizations.expires_at`** (the org becomes a normal org) → set `organization_claims.claimed_at` (keep the row for analytics/idempotency; a re-used token then fails check 1) → set it as the active organization. Because the temp org is owner-less, this *assigns* ownership; the user ends up the org's owner. **Latitude is multi-org** (there's an org selector), so for a user who already has other orgs this simply adds the claimed org to the ones they own.
- **Trimmed claim onboarding (not the full signup onboarding).** After claim, route into a **claim-specific onboarding** that reuses the existing isolated step components but with a different sequence and a **rename instead of create**. The normal flow is `/welcome` (create org) → `/projects/{slug}/onboarding` step machine `role → flaggers → slack → telemetry` (`onboarding-flow.tsx`; completion = `project.settings.onboardingCompleted` via `completeProjectOnboarding`). The claim variant:
  - **Profile (name + org name → RENAME):** like `/welcome` but calls `updateUserName({ name })` + **`updateOrganization({ name })`** on the existing temp org (prefilled with the agent-inferred name from bootstrap) — **never `createOrganization`** and **never re-provisions** (no default/sample project from here; the temp org already has the agent's final project, and the sample project comes from the on-claim seed job below).
  - **"Tell us about yourself":** reuse `RoleStep` → `submitOnboarding` (job title + phone), passing `stackChoice: "production-agent"` hardcoded — the same value the normal onboarding flow hardcodes (there's no live stack-choice screen; the sequence is `role → flaggers → slack → telemetry`).
  - **"Choose automatic flaggers":** reuse `FlaggersStep` → `configureProjectFlaggersForOnboarding({ projectId, enabledSlugs })`, targeting the org's project. **Keep the step's project-name input** (prefilled with the current name), like normal onboarding — `updateProjectUseCase` only regenerates the slug when an explicit `slug` is passed, so a name-only rename leaves the slug (and the agent's `LATITUDE_PROJECT_SLUG`) untouched. It's a display-name edit, so allowing it is safe and consistent with the normal flow.
  - **"Get notified in Slack":** reuse `SlackStep` (env-gated, skippable).
  - **SKIP** `TelemetryStep` ("waiting for first trace") — the agent already instrumented and sent real traces. (There is no separate stack-choice step in the live onboarding; `stackChoice` is hardcoded, see above.)
  - **Complete:** `completeProjectOnboarding({ projectId })`, then land in the workspace. New-user claim step sequence: `profile(rename) → role → flaggers → slack? → complete`.
- **Existing user → NO onboarding, rename-only.** A claimer who **already has an account** gets **no onboarding flow at all** — just a **single org-rename screen** (prefilled with the agent-inferred name), mirroring how creating an org from the dashboard has no onboarding today. No role/flaggers/Slack steps are forced (they can configure those later in settings). *(We may add onboarding for dashboard-created orgs in future, but not now.)*
- **Seed a sample project in the background, on claim.** On a successful claim, **enqueue a background job to create + seed a sample/demo project** for the org, exactly as normal onboarding does (reuse the existing sample-seeding path — `@domain/admin` `create-demo-project` / the sample portion of `provision-organization-workspace`). The org therefore ends up with the user's clean final project **plus** the explorable sample project, like any normally-onboarded org. (Do **not** re-create a "default" project or a new API key — those already exist from bootstrap.)
- **Claim email (optional) mirrors the invitation email.** When `userEmail` was provided at bootstrap, the `ClaimEmailRequested` email is a simple message with a **button linking to the claim URL**, styled like the existing invitation email, and it carries the **temporary org name** and the **claim deadline** (to nudge the user to claim before cleanup). The claim link is the canonical hand-off; the email is just a convenience delivery.
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
- **Audience split — RESOLVED in Phase 2: dropped.** The original plan used `x-fern-audiences` to ship `bootstrap` in the CLI but not the SDKs. Fern's SDK generators don't treat untagged endpoints as universal (a `public` filter gutted both SDKs) and per-group `api:` overrides aren't supported in 5.50.4, so the split was **abandoned**: bootstrap ships in **both SDKs and the CLI**, kept out of MCP via plain `createRoute` (§5.2).

### 5.6 Skills `[skills]`

All skills are a single `SKILL.md` with `name`/`description` frontmatter, installable via `npx skills add https://github.com/latitude-dev/skills --skill <name>`.

- **`latitude-cli`** — teaches the agent to install the binary, configure auth with the bootstrap API key, and use the primitives: `projects create/delete/list`, `traces list/tail`, org management. Secret-handling rules (never print the key in chat).
- **`latitude-setup`** — the orchestrator for the **zero-account path only** (Path A, §2.1); the authenticated in-app path points at `latitude-telemetry` + `latitude-cli` directly and skips this skill. Encodes the full flow with **run-real-code-and-inspect** verification: install `latitude-telemetry` + `latitude-cli` (+ binary) → `latitude bootstrap` (capture key + `projectSlug` + claimUrl) → configure CLI auth → delegate instrumentation to `latitude-telemetry`'s plan/approval flow (pointing at `projectSlug`) → run user code → inspect real traces → iterate → **delete + recreate the project with the same name** (slug unchanged) → clean run → present the claim link (and note the optional email). Must respect the telemetry skill's "plan, then wait for approval" contract before editing code, and **never print the raw API key in chat**.
- **`latitude-telemetry`** — review/update so it knows the zero-account CLI bootstrap path exists (today it assumes a key already exists or MCP-assisted discovery). Add a branch: "if no account, defer to `latitude-setup`/CLI bootstrap"; note the bootstrap `projectSlug` stays stable across the delete+recreate cleanup, so the telemetry config is written once.

---

## 6. Security model & abuse mitigations `[llm]`

The unauthenticated bootstrap endpoint is the crown-jewel risk — the exact abuse surface that sank PR #3710 (spam, resource exhaustion, free-tier farming). Mitigations:

- **Rate limiting: 1 request / minute, keyed by IP** — via the new `max` tier on the generalized `createTierRateLimiter` (org→IP→`unknown`). Phase 1, non-negotiable.
- **Temporary, low quotas + auto-expiry.** **Unclaimed** temp orgs get a small trace/retention quota and **expire at `organizations.expires_at`** (set to 1 week out at bootstrap); the cleanup job hard-deletes rows where `expires_at IS NOT NULL AND expires_at < now()`. While unclaimed (`expires_at IS NOT NULL`), temp orgs are **never** auto-seeded with sample data, billed, or enrolled in lifecycle automations. **Sample seeding happens only at claim time** (§5.3), once a real owner exists and `expires_at` is cleared.
- **Captcha (Cloudflare Turnstile) — deferred.** Turnstile exists in web/better-auth (`LAT_TURNSTILE_SECRET_KEY`) but there is **no API-side verify** today. Decision: ship the `1/min/IP` limit first; add an API-side Turnstile verify on bootstrap only if abuse appears.
- **No user enumeration.** Bootstrap creates a fresh org and does **not** look up existing users by email, so it avoids the cross-tenant enumeration oracle PR #3710 had. The optional `email` only addresses the claim email; it never branches behavior.
- **Don't leak the API key** beyond the response; the CLI stores it via the project's secret manager, not chat.
- **Bootstrap is excluded from MCP** (plain `createRoute`, not `defineApiEndpoint`) but **present in both SDKs and the CLI** (§5.2). The MCP exclusion is what matters: MCP is OAuth-gated and can't host an unauthenticated tool (§3.1). SDK/CLI exposure is fine — the endpoint simply ignores the client's API-key credential. **Claim is web-only** — not in the API/SDK/MCP/CLI surface at all (§5.3).

---

## 7. Decisions (resolved)

These were settled during review and are reflected in the sections and tasks above.

1. **TTL & cleanup.** Bootstrap sets `organizations.expires_at = now() + 1 week`. Unclaimed accounts (still `expires_at IS NOT NULL`) past that time are hard-deleted (org + projects + keys + traces); claiming clears `expires_at`.
2. **Rate limit.** New **`max` tier = 1 request / minute** on `createTierRateLimiter`, generalized to key by org→IP→`unknown`; bootstrap (unauthenticated) keys by IP. Captcha deferred (§6).
3. **Claim with an existing account.** The claimer is made **owner** of the Temporary account; it's added to their orgs (multi-org / org selector already exists) — no merge/import.
4. **Claim onboarding depends on who claims (§5.3):**
   - **New user** (no account) → **trimmed onboarding** (implemented): profile (name + org name that **renames** the temp org, prefilled) → "tell us about yourself" → "choose automatic flaggers" (project **renamable** here, prefilled — a name-only rename keeps the slug) → "get notified in Slack" (env-gated, skippable) → complete. **Skip** "what do you want to monitor?" + "waiting for first trace". No new/default org, no re-provision — the temp account is their first org.
   - **Existing user** → **no onboarding at all**, just a **single org-rename screen** (prefilled), like creating an org from the dashboard.
5. **Sample project on claim.** Claiming **kicks off a background job to create + seed a sample/demo project**, as normal onboarding does — so a claimed org looks like any onboarded org (clean final project + sample). No default project / API key is re-created (§5.3).
6. **Email.** Optional; the **claim link is canonical**. When provided, the email is a button → claim URL, styled like the invitation email (§5.3).
7. **No custom CLI commands needed.** The agent polls the generated `traces list`; a stock Fern CLI suffices (§5.4/§5.5).
8. **CLI.** Name **`latitude`**, package **`packages/cli`**, Fern-generated; command names are Fern's call.
9. **Endpoint placement.** Bootstrap = `POST /v1/account/bootstrap`, unauthenticated, mounted to bypass auth, `PUBLIC_SECURITY`, **excluded from MCP** (plain `createRoute`) but **generated into both SDKs + CLI** (audience split dropped in Phase 2). Claim = **web route** in `apps/web`, session-gated, **not** an API endpoint.
10. **Two entry points (§2.1).** Landing CTA (no account) → `latitude-setup`; in-app new-project CTA (already signed in) → `latitude-telemetry` + `latitude-cli` directly, **no bootstrap/claim**. Marketing copy lives on the landing/in-app, not in this spec.
11. **User-facing naming.** "**Temporary account**" everywhere user-facing (technically a temporary organization).
12. **Single project, named once.** Bootstrap creates **one** project named `projectName ?? "My Project"` (agent-inferred), returned as `projectSlug`. **No throwaway `testing` project.** Cleanup = **delete + recreate with the same name** (same slug ⇒ no app-config change). Bootstrap also receives the optional `organizationName` (`?? "My Organization"`). The claim onboarding's `FlaggersStep` **may** rename the project (prefilled) — it's a **name-only** edit that leaves the slug (and the agent's `LATITUDE_PROJECT_SLUG`) unchanged, since `updateProjectUseCase` only regenerates the slug when an explicit `slug` is passed. _(Reversed from the original "must not allow renaming" decision once we confirmed the slug is stable.)_

_Resolved during Phase 1 (§5.5):_

13. **CLI generator.** `fernapi/fern-cli-generator@0.21.0` with `ir-version: v67`, `config.customCommands: false`, `config.binaryName: latitude` (requires the pinned Fern CLI at `5.60.0`). `packages/cli` is fully generator-owned; only `CHANGELOG.md` + `.fernignore` are hand-owned. Root commands: `generate:cli`, `generate:all`, `fern:check` (renamed from `sdk:check`), `cli:build`, `cli:run`.
14. **CLI/SDK auth = API key.** The OpenAPI security scheme carries `x-fern-bearer: { name: apiKey, env: LATITUDE_API_KEY }` from a single `API_SECURITY_SCHEME` constant shared by the live spec (`server.ts`) and the emitter (`scripts/emit-openapi.ts`). The credential parameter is `apiKey` (`api_key` in Python) across CLI + both SDKs — this renamed the prior `token` param — and falls back to the `LATITUDE_API_KEY` env var. On Linux the CLI's `auth login` uses the OS keyring (D-Bus/secret-service) with a file-backend fallback.
15. **CLI release = GitHub Release binaries** (`publish-cli.yml`, no npm/PyPI). Version is read from `packages/cli/CHANGELOG.md` and injected at build time (`cargo set-version`); the CLI is versioned independently of the SDKs (starts at `0.1.0`). Five friendly-named assets — `latitude-{linux,macos}-{amd64,arm64}.tar.gz` + `latitude-windows-amd64.zip`. **Linux = gnu** (so keyring/D-Bus works; static-musl dropped — it can't link the vendored libdbus on aarch64 and the CLI targets consumer PCs, not Alpine/`scratch`), rustls TLS; macOS/Windows native-tls. Binary signing / package-manager distribution deferred.

### Former unknowns (spikes) — all resolved

- **Fern per-generator audience filtering — RESOLVED (Phase 2): not pursued.** Fern's SDK generators don't treat untagged endpoints as universal and per-group overrides aren't supported, so the audience split was dropped. Bootstrap ships in both SDKs + the CLI; MCP exclusion is via plain `createRoute` (§5.2).
- **Slug stability across delete+recreate — RESOLVED (Phase 2, P2-7).** The existing schema already satisfies it: the unique index is `(organization_id, slug, deleted_at)` with `nullsNotDistinct()` and `countBySlug` ignores soft-deleted rows, so soft-delete + recreate reuses the same slug. Regression-tested (`project-slug-stability.test.ts`).

---

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`
>
> Each phase ≈ one PR. `[llm]` = `latitude-llm` repo, `[skills]` = `latitude-dev/skills` repo. **Phase 1 (CLI) comes first to de-risk the core unknown** — whether Fern can autogenerate a CLI from `openapi.json` at all (as it already does the API docs + TS/Python SDKs). Order then follows dependency: **1 (CLI) → 2 (bootstrap, applies the CLI audience mechanism) → 3 (claim, needs bootstrap) → 4 (skills) → 5 (launch)**.

### Phase 1 — Auto-generate the Latitude CLI via Fern `[llm]` — **complete** (`LAT-703/cli`)

> De-risk the core unknown first: can we autogenerate a CLI from `openapi.json` like we do the docs/SDKs? **Result: yes** — a working Rust `latitude` binary generates against the current spec, builds cross-platform, and has a publish workflow. The bootstrap command is added later in Phase 2 via regen.

- [x] **P1-1**: Spiked Fern's CLI generator against `apps/api/openapi.json` — produces a working Rust binary, wires API-key auth (`LATITUDE_API_KEY`), and runs existing commands. Done via `fernapi/fern-cli-generator@0.21.0` + `ir-version: v67` + `customCommands: false` (§5.5); production-ready enough, the TS-SDK fallback was not needed.
- [x] **P1-2** *(closed in Phase 2 — mechanism abandoned)*: Investigated **per-generator audience filtering** (`x-fern-audiences`) to ship an endpoint in the CLI but not the SDKs. — _**Not pursued.** Fern's SDK generators don't treat untagged endpoints as universal (a `public` filter gutted the SDKs) and per-group `api:` overrides aren't supported in 5.50.4. Decision reversed: bootstrap ships in **both SDKs and the CLI**, kept out of MCP via plain `createRoute` (see Phase 2 progress note → Audience split). No audience machinery remains in the tree._
- [x] **P1-3**: Added the `local-cli` group to `fern/generators.yml` and created **`packages/cli`** (binary `latitude`). Note vs. plan: `packages/cli` is **fully generator-owned** (not a hand-written shell like the SDKs) — only `CHANGELOG.md` + `.fernignore` are hand-owned. Audience configuration deferred to P1-2/Phase 2.
- [x] **P1-4**: Added `generate:cli` / `generate:all` / `cli:build` / `cli:run` (and renamed `sdk:check`→`fern:check`); the `api-manifests.yml` drift check covers `packages/cli`; **`publish-cli.yml`** ships **GitHub Release binaries** (5 cross-platform targets), fanned out from `publish-packages.yml`. Deviation from plan: **GitHub Releases only — no npm and no binary signing yet** (deferred).
- [x] **P1-5**: The CLI builds and its command surface (`projects {create,delete,list}`, `traces list`, …) is runnable via `cli:build` + `cli:run`; build + package + artifact-upload validated via `act` and local `cargo`. **Confirmed working against production** with a real API key.

**Exit gate**: met — `latitude` builds from the current spec, authenticates via API key (verified against production), drives the project/trace commands, has a publish workflow, and CI fails on spec/CLI drift. The only outstanding Phase-1 item is the audience-filtering proof (P1-2), deferred to Phase 2 since there's no bootstrap endpoint to tag yet.

### Phase 2 — Temp-org markers + unauthenticated bootstrap endpoint `[llm]`

- [x] **P2-1**: Migration: add `organizations.expires_at` (nullable timestamptz) with a partial index over the non-null (temporary-unclaimed) set. — _**Done.** Blocker A was fixed upstream (#3811 repaired the snapshot chain); `pg:generate` produces a clean diff. Migration `20260703100125_temporary-account-bootstrap` adds the single `expires_at` column + partial index `organizations_expires_at_idx` (`WHERE expires_at IS NOT NULL`). One field, `null` = normal/claimed (§5.1)._
- [x] **P2-2**: Add `organization_claims` table (id, organization_id, token_hash, email null, expires_at, claimed_at null); repository in `@platform/db-postgres`. — _**Done.** Same migration creates the `organization_claims` table with `organizationRLSPolicy` (RLS enabled + `organization_claims_organization_policy`, like every other tenant table), `token_hash` as **`varchar(64)`** (a SHA-256 hex digest is always 64 chars), a unique index on `token_hash`, and an index on `organization_id`. The adapter's `save` writes the org id from the RLS context; token-redemption reads (Phase 3) use the admin client (bypasses RLS)._
- [x] **P2-3**: `bootstrapOrganizationUseCase` — owner-less org named `organizationName ?? "My Organization"` (admin client, `expires_at = now() + TTL`) → `generateApiKeyUseCase` (org-scoped key) → `createProjectUseCase` for **one** project named `projectName ?? "My Project"` → create claim row (storing the optional `userEmail`). **Exactly one project; NO sample/demo seeding.** Unit tests with fakes (no infra). — _**Done** (2 key-free unit tests pass). **Deviation:** emits **no `OrganizationCreated` event and no claim email** — email delivery is deferred to Phase 3 (P3-5). The response `claimEmail` echoes the request's `userEmail` (`null` when omitted). This keeps temp orgs out of the normal creation/automation stream (§5.1) and avoids pulling P3-5's event+worker+template into Phase 2._
- [x] **P2-4**: In `middleware/rate-limiter.ts`, add a **`max` tier** (`{ maxRequests: 1, windowSeconds: 60 }`) to `TIER_LIMITS`, and generalize `createTierRateLimiter`'s `keyGenerator`/`keyPrefix` to scope by `c.get("organization")?.id` if set, else client IP (first `X-Forwarded-For` hop), else `"unknown"`. Bootstrap uses `createTierRateLimiter("max")` (keys by IP, unauthenticated). Verify existing org-scoped routes are unaffected. — _**Done**; refactor is backwards-compatible: the prefix moved from `ratelimit:tier:<tier>:org` to `ratelimit:tier:<tier>` and the scope (`org:<id>`) folded into the key, so org-scoped routes produce the identical Redis key._
- [x] **P2-5**: Add `PUBLIC_SECURITY = []` to `openapi/schemas.ts`; register the bootstrap route (`POST /bootstrap`) using plain `createRoute` + `.openapi(...)` (NOT `defineApiEndpoint`, so it stays out of the MCP registry). Mount it on the **`v1` router before `v1.route("/", routes)`** so it bypasses auth, yielding `POST /v1/account/bootstrap` while `GET /v1/account` stays authenticated. — _**Done** (typechecks). Implemented as `registerBootstrapRoute({ app, adminDatabase })` in `apps/api/src/routes/account.ts` (mirrors `registerMcpRoute`/`registerHealthRoute`), called on the `v1` router **before** the auth-guarded `routes` are mounted; the admin client resolves internally via `getAdminPostgresClient()` when no `adminDatabase` is passed. `webUrl` read from `LAT_WEB_URL` in the handler (mirrors `members.ts`). (The `x-fern-audiences` split was later **dropped** — see P2-6 / Progress notes.)_
- [x] **P2-6**: Regenerate `openapi.json`; **assert**: route present in `openapi.json`, **absent from `mcp.json`**, **present in the CLI**, and (decision reversed — see below) **present in both SDKs**. Routing test: unauth `POST /v1/account/bootstrap` succeeds; `GET /v1/account` still returns `401` without a token. — _**Done.** Bootstrap is in `openapi.json`, both SDKs (`client.account.bootstrap`), and the CLI (`latitude account bootstrap`); absent from `mcp.json` (plain `createRoute`, not `defineApiEndpoint`). The `x-fern-audiences` split was **dropped** (see Progress notes → Audience split). Routing test in `apps/api/src/routes/account.test.ts` (unauth bootstrap → 201 provisioning one temporary/unclaimed workspace; `GET /v1/account` → 401). SDK/CLI regen committed for CI drift (additions-only; no SDK version bump — publish deferred)._
- [x] **P2-7**: **Slug stability for delete+recreate** (§5.4): ensure deleting then recreating a project with the same name yields the **same slug**. — _**Satisfied by the existing schema** (no change needed): `projects_unique_slug_per_organization_idx` is on `(organization_id, slug, deleted_at)` with `nullsNotDistinct()`, and `ProjectRepository.countBySlug` filters `deleted_at IS NULL`. So soft-delete (the current `deleteProject`) + recreate yields the **same base slug** with no unique violation. **Regression test added** (`project-slug-stability.test.ts`, PGlite): recreate-after-soft-delete reuses `my-project`; a live same-name project still gets a `my-project-…` suffix._

**Exit gate**: `curl -XPOST /v1/account/bootstrap` (no auth) returns org + API key + **one named project (`projectSlug`)** + claim link + `claimExpiresAt`, with **no sample/demo project**; org has `expires_at` set (its claim deadline); delete+recreate of a project preserves its slug; IP-rate-limited (1/min); present in `openapi.json`, absent from `mcp.json` and both SDKs but **present in the CLI**; `GET /v1/account` unaffected; use-case tests pass key-free.

> **Phase 2 progress — branch `LAT-704/temporary-accounts`** (forked from `development`). Status: **complete** — every task done, typechecks and tests green. WIP remains **uncommitted** pending review.
>
> **Implemented:**
> - `@domain/organizations`: `Organization` entity + factory gain a single nullable `expiresAt` (the claim deadline; `null` = normal/claimed); new **pure** `organization-claim.ts` entity (`organizationClaimSchema`, `createOrganizationClaim` — no crypto/logic); token minting lives in `generateOrganizationClaimUseCase` (`@repo/utils` `randomToken` + `hash`); `OrganizationClaimRepository` port (`save`, plus `findByTokenHash`/`markClaimed` added in Phase 3); `bootstrapOrganizationUseCase` + tests; fake claim repo. Added `@repo/utils` dep (SHA-256 `hash` + `randomToken`).
> - `@platform/db-postgres`: `organizations` gains a single `expires_at` + partial index `organizations_expires_at_idx` (`WHERE expires_at IS NOT NULL`); org repo mapper/insert updated; new `organization_claims` table (RLS-scoped via `organizationRLSPolicy`, `token_hash varchar(64)`) + `OrganizationClaimRepositoryLive`; single migration `20260703100125_temporary-account-bootstrap`; `project-slug-stability.test.ts`.
> - `apps/api`: `rate-limiter.ts` (`max` tier + org→IP→unknown key; also renamed the `critical` tier → `ultra`); `openapi/schemas.ts` (`PUBLIC_SECURITY`); `routes/account.ts` (`registerBootstrapRoute` → `POST /v1/account/bootstrap`, plain `createRoute`, `max` tier) + `account.test.ts` routing test; `routes/index.ts` (registers the bootstrap route on `v1` pre-auth). No `x-fern-audiences` tags and no `emit-openapi.ts` audience injection — the split was dropped (below).
> - Codegen: `openapi.json` (bootstrap path), `packages/cli` (`account bootstrap` command in `openapi0.json` + `reference.md`), both SDKs (`client.account.bootstrap` + its request/response types). `mcp.json` unchanged (no bootstrap — plain `createRoute`, never an MCP tool).
> - Also carries the Phase-1 CLI review fixes (`fern.config.json` trailing newline; `dist-workspace.toml` removed + added to `packages/cli/.fernignore`).
>
> **Verified:** typechecks pass (`@domain/organizations`, `@platform/db-postgres`, `@app/api`); tests pass — `@domain/organizations` 18, `@platform/db-postgres` 277 (incl. slug-stability + migration applied in PGlite), `@app/api` routes+middleware 202 (incl. bootstrap routing test). Codegen regen is idempotent and CI-drift-safe.
>
> **Design decisions (this branch):**
> - **Home:** everything lives in `@domain/organizations` (no new `@domain/onboarding` package).
> - **Admin client:** bootstrap runs under the admin (RLS-bypassing) client, scoped to the freshly-generated org id (minted in the route handler so `generate*UseCase` reads it off the `SqlClient`). The admin client bypasses RLS, so the memberless-org, API-key, project, and `organization_claims` inserts all succeed even though those tables are RLS-scoped; the inserted rows carry the scoped org id.
> - **No email in Phase 2** (see P2-3).
> - **CLI CHANGELOG intentionally NOT bumped:** the `account bootstrap` command is committed (so CI drift passes) but `publish-cli.yml` won't ship it until a CHANGELOG version bump. Deferred to Phase 3, since the returned `claimUrl` 404s until the web claim route exists — shipping the command earlier would hand users a dead link.
>
> **Blocker A — RESOLVED upstream** (#3811, "repair Drizzle snapshot chain after incidents consolidation"). The `alertIncidents = incidents` alias is gone and the snapshot chain is repaired, so `pg:generate` produces a clean, Phase-2-only diff. No action needed on this branch.
>
> **Blocker B — RESOLVED** (#3809): the Python `client_wrapper.py` `User-Agent` drift was fixed by pinning `--version` in `generate:sdk:{typescript,python}`. No re-drift observed during this phase's regen.
>
> **Audience split — DROPPED (decision reversed).** The original design excluded bootstrap from the SDKs and shipped it CLI-only via `x-fern-audiences`. That mechanism proved fiddly: Fern's SDK generators do **not** treat untagged endpoints as universal, so a naive `public` filter gutted both SDKs, and per-group `api:` spec overrides aren't supported in Fern 5.50.4. Rather than tag every operation, we **dropped the split entirely**: `POST /v1/account/bootstrap` is now generated into **both SDKs and the CLI** (`client.account.bootstrap(...)` / `latitude account bootstrap`). It stays out of **MCP** the easy way — it uses plain `createRoute` (not `defineApiEndpoint`), so it's never registered as an MCP tool (same as the well-known routes). No `x-fern-audiences` tags, no `generators.yml` audience filters, no `emit-openapi.ts` injection. The SDK diff is additions-only (the bootstrap method + its request/response types). **Now that Phase 3 makes the claim link resolve, the surface is published:** TS + Python SDKs bumped `7.1.0 → 7.2.0` (+ CHANGELOG entries; Python `client_wrapper.py` User-Agent re-stamped to `7.2.0` via the `--version` pin) and the CLI CHANGELOG bumped `0.2.0 → 0.3.0`.

### Phase 3 — Claim flow + lifecycle `[llm]`

- [x] **P3-1**: `claimOrganizationUseCase` — validate claim token (hash + `claimed_at IS NULL` + `expires_at` in the future) **and** the target org is still claimable (`organizations.expires_at IS NOT NULL AND expires_at > now()`) **and** the org has **no members** (anti-theft guard so a claimer can never take over a populated org) → make the authenticated user `owner` via admin client → **clear `organizations.expires_at`** + set `organization_claims.claimed_at`. — _**Done.** Runs cross-org under the admin client (`withPostgres` defaults to `"system"`, RLS bypassed). New repo methods `OrganizationClaimRepository.findByTokenHash` + `markClaimed`; tagged errors `ClaimTokenInvalid/Expired/AlreadyUsed`, `OrganizationNotClaimable`. 6 key-free unit tests. Sample-seeding enqueue split out to P3-4._
- [x] **P3-2**: **Web** claim route `apps/web/src/routes/claim.$token.tsx` + server fns `getClaimPreview`/`claimOrganization` (`domains/organizations/claim.functions.ts`) — **no API endpoint**. Mirrors `auth/invite.tsx`: loader validates the token (preview), `getSession()`, redirects to `/login?redirect=/claim/<token>` when unauthenticated; on confirm calls `claimOrganizationUseCase` (admin client) + `setActiveOrganization`. — _**Done** (web typechecks; route tree regenerated)._
- [x] **P3-3 / P3-3b** (new + existing user): **trimmed claim onboarding — full flow.** — _**Done.** The claim route (`claim.$token.tsx`) is a step-machine. Step 1 **profile/rename** collects **name** (only if the user lacks one) + **org name** (prefilled with the agent-inferred name) → `updateUserName` + claim + `updateOrganization({ name })` (rename, never `createOrganization`, no re-provision). It then branches on the claimer (via `listOrganizations` — a new user belongs to no org yet): **new users** continue through the full trimmed sequence `role → flaggers → slack? → complete`, reusing the existing onboarding step components (`RoleStep`/`FlaggersStep`/`SlackStep`) — `submitOnboarding` passes `stackChoice: "production-agent"` (as normal onboarding hardcodes), the flaggers step keeps its prefilled project-name input (name-only rename, slug fixed), Slack is env-gated/skippable, `TelemetryStep` is skipped (real traces already exist; there's no live stack-choice step), completing via `completeProjectOnboarding`; **existing users** get **no onboarding** — just the rename screen, then straight to the workspace._
- [x] **P3-4**: Background **sample-project seeding** on claim. — _**Done.** `claimOrganizationUseCase` emits `OrganizationClaimed`; the domain-events worker routes it to `projects:createDemo`; the projects worker runs the new `createSampleProjectUseCase` (creates the sample project + emits `SampleProjectCreated`), which flows into the existing `seedDemoProjectWorkflow`. **`createSampleProjectUseCase` is shared with `provisionOrganizationWorkspaceUseCase`** (normal onboarding now calls it instead of duplicating the sample-project creation). Reuses the onboarding seeding pipeline; no default project / new API key._
- [x] **P3-5**: `ClaimEmailRequested` domain event + email worker + template. — _**Done.** New event (`organizationId: "system"`); bootstrap emits it when `userEmail` is provided; domain-events router → `organization-claim-email` topic → `createOrganizationClaimEmailWorker` renders `organizationClaimTemplate` (button → claim URL, styled like the invitation email) and sends via the email transport._
- [x] **P3-6**: Cleanup job. — _**Done.** `OrganizationRepository.listExpiredUnclaimed(cutoff)` (cross-org, admin) + `createOrganizationCleanupWorker` (BullMQ `organization-cleanup` topic, daily `scheduleRepeatable` at 03:00 UTC) that, per expired org, runs `purgeOrganizationProjectsUseCase` (soft-delete + `ProjectDeleted` cascade) then `orgRepo.delete` (FK-cascades members/invitations/OAuth) — mirroring the org danger-zone delete. Matches existing deletion semantics (ClickHouse traces are not separately purged, same as `deleteOrganization` today)._
- [x] **P3-7**: Tests. — _**Done (unit).** `claimOrganizationUseCase` 6 tests (happy path emits `OrganizationClaimed`; invalid/expired/already-used/normalized/has-members guards); `bootstrapOrganizationUseCase` asserts `ClaimEmailRequested` fires only with an email. Full browser E2E (claim → onboarding → seeded workspace) is manual (run the app)._

**Exit gate**: a user opens a claim link, authenticates, renames the temp org via the prefilled field, becomes its owner (`expires_at` cleared); **new users continue through the trimmed `role → flaggers → slack` onboarding**, existing users skip straight in; a sample project is seeded in the background; expired unclaimed orgs are reaped daily; no RLS violations. — _Met at the code level (unit-tested + typechecking end to end); the browser click-through is left for manual QA._

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
- Onboarding step machine + reusable screens (reused by the trimmed claim onboarding): `apps/web/src/routes/_authenticated/projects/$projectSlug/-components/onboarding-flow.tsx` (sequence `role→flaggers→slack→telemetry`) and `…/onboarding/steps/{role,flaggers,slack,telemetry}-step.tsx`. Completion: `project.settings.onboardingCompleted` via `completeProjectOnboarding` (`apps/web/src/domains/projects/projects.functions.ts`).
- Claim-onboarding server fns reused: `updateUserName` (`apps/web/src/domains/sessions/session.functions.ts`) + `updateOrganization` (`…/organizations/organizations.functions.ts`), `listOrganizations` (new-vs-existing detection), `submitOnboarding` (`…/users/user.functions.ts`), `listProjects` + `completeProjectOnboarding` + `updateProject` (`…/projects/projects.functions.ts`), `configureProjectFlaggersForOnboarding` + `listAvailableFlaggers` (`…/flaggers/flaggers.functions.ts`), `isSlackConfigured` (`…/integrations/integrations.functions.ts`).
- Ownership mechanics: `…/use-cases/transfer-ownership.ts`; `…/ports/membership-repository.ts` (`findFirstOwner → null`).
- better-auth org/magic-link config: `packages/platform/db-postgres/src/create-better-auth.ts`.
- Telemetry SDK init + processor: `packages/telemetry/typescript/src/sdk/{init,processor}.ts`; env `…/env/env.ts` (`LATITUDE_TELEMETRY_URL`).
- Ingest: `apps/ingest/src/routes/traces.ts`, `…/middleware/{auth,project}.ts`.
- Trace inspection: `apps/api/src/routes/traces.ts` (`listTraces`); project `firstTraceAt` in `packages/domain/projects/src/entities/project.ts`.
- Codegen pipeline: `fern/generators.yml` (`local-typescript`/`local-python`/`local-cli` groups), `fern/invoke.sh`, `apps/api/scripts/{emit-openapi,emit-mcp}.ts`, `.github/workflows/api-manifests.yml`, root `package.json` (`generate:sdk`/`generate:cli`/`generate:all`/`fern:check`/`cli:build`/`cli:run`).
- CLI (Phase 1, done): generated crate `packages/cli/` (hand-owned `CHANGELOG.md` + `.fernignore`), `.github/workflows/publish-cli.yml` (+ its wiring in `publish-packages.yml`), API-key security scheme `apps/api/src/constants.ts` (`API_SECURITY_SCHEME` with `x-fern-bearer`, used by `server.ts` + `scripts/emit-openapi.ts`).
- MCP gating (rejected-approach evidence): `apps/api/src/mcp/{server.ts,registry.ts,define-endpoint.ts}`, `apps/api/src/openapi/schemas.ts` (`PROTECTED_SECURITY`), `packages/platform/oauth-token-auth/src/validate-oauth-token.ts`.
