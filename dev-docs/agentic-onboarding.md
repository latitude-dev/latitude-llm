# Agentic onboarding

Latitude lets a developer's **AI coding agent** stand up observability end-to-end from a single copy-pasted prompt, with **no prior Latitude account**. The agent instruments the app, provisions a **temporary organization** over an unauthenticated endpoint, iterates against real traces from the user's own code, and hands back a **claim link** the user opens in a browser to take ownership of the now-populated workspace.

The machine-facing surfaces are the [CLI](../docs/getting-started/cli.mdx) (a Fern-generated binary) and a set of [Agent Skills](https://github.com/latitude-dev/skills); the orchestration lives in the skills, not the binary. User-facing copy brands the construct a **"temporary account"**, though it is technically a temporary *organization*.

## Two entry points

- **Path A — zero-account (landing CTA).** Prompt → the `latitude-setup` skill → bootstrap a temporary account → instrument → verify real traces → claim. Full flow below.
- **Path B — in-app, already signed in.** The "new blank project" empty-state points the agent straight at `latitude-telemetry` (+ `latitude-cli`) against a real project — **no bootstrap, no claim**. The CLI authenticates with the user's real API key.

`latitude-setup` is the **zero-account orchestrator only**; the authenticated path composes `latitude-telemetry` + `latitude-cli` without it.

## The zero-account flow

1. Agent installs the `latitude` CLI + the Latitude skills.
2. **`POST /v1/account/bootstrap`** (unauthenticated) creates an owner-less temp org (named from an agent-inferred name, else "My Organization"), mints an org-scoped API key, and creates **one** project (else "My Project"). It returns `{ apiKey, organizationSlug, projectSlug, claimUrl, claimExpiresAt, claimEmail }`, and — if an email was given — sends the claim link. **No sample/demo project is seeded.**
3. Agent writes the key to `.env` and instruments the app (via `latitude-telemetry`) pointing at `projectSlug`.
4. Agent runs the user's **real code**, lists traces, and iterates on instrumentation until the traces are correct.
5. Agent wipes the messy iteration traces by **deleting the project and recreating it with the same name** — same name ⇒ same slug ⇒ no app-config change — then runs the code once more for a clean set.
6. Agent hands over the `claimUrl`. The user opens it in a browser, signs in/up, and becomes **owner** (`expires_at` cleared). New users get a **trimmed onboarding** (profile/rename → role → flaggers → Slack → complete); existing users get a **rename-only** screen. Claiming kicks off background sample-project seeding, so a claimed org looks like any onboarded one.

## Why the bootstrap step is an HTTP endpoint, not an MCP tool

This is the durable lesson from the abandoned "signup via MCP" attempt (PR #3710) and **must not be re-tried**: MCP authorization is transport-level and all-or-nothing — a protected-resource MCP server (which Latitude's `/v1/mcp` is) requires a bearer token for **every** request, including `tools/list`, so it cannot host an unauthenticated bootstrap tool. Per-tool public/authenticated metadata (SEP-1488) is a Draft, not honored by general clients.

So bootstrap is a plain HTTP endpoint driven by the CLI/SDKs. It uses plain `createRoute` (not `defineApiEndpoint`), which keeps it **OpenAPI-visible and generated into both SDKs + the CLI, but never registered as an MCP tool**. Claim is web/session-only — not in the API/SDK/MCP/CLI surface at all.

## Data model

- `organizations.expires_at` (nullable timestamptz) — the claim deadline. **Non-null = temporary + unclaimed**; cleared on claim. Partial index over the non-null set.
- `organization_claims` — `(organization_id, token_hash varchar(64), email nullable, expires_at, claimed_at nullable)`, RLS-scoped like every tenant table; unique index on `token_hash`. The token is a random secret; only its SHA-256 hash is stored.

Owner-less orgs are legal (ownership is a `members` row, not a column), so a temp org exists with zero members until claimed. `better-auth`'s `createOrganization` always inserts an owner member, so bootstrap **bypasses better-auth** and inserts via the **admin (RLS-bypass) client**, scoped to the freshly minted org id.

## Project lifecycle & slug stability

There is exactly **one** project, named with its final name from the start (no throwaway "testing" project). Cleanup is **delete + recreate with the same name**. This relies on slug stability: the projects unique index is `(organization_id, slug, deleted_at)` with `nullsNotDistinct()`, and `ProjectRepository.countBySlug` ignores soft-deleted rows — so soft-delete + recreate reuses the same base slug. `LATITUDE_PROJECT_SLUG` therefore never changes across cleanup. Regression-tested in `project-slug-stability.test.ts`.

## Security model & abuse mitigations

The unauthenticated bootstrap surface is the crown-jewel risk. Mitigations:

- **Rate limiting, two layers** (`apps/api/src/middleware/rate-limiter.ts`): the per-IP **`max` tier** (`createTierRateLimiter("max")`, 1 req/min, keyed by org → IP → `unknown`) runs first, then a tenant-agnostic **global cap** (`createGlobalRateLimiter({ key: "account-bootstrap", maxRequests: 1000, windowSeconds: 60 })`) bounds total creation rate against a botnet spread across many IPs (there is no CAPTCHA on the API). Both fail open on Redis errors.
- **TTL + auto-expiry.** Bootstrap sets `expires_at = now() + 1 week`. A daily cleanup worker hard-deletes still-unclaimed orgs past their deadline (org + projects + keys). Unclaimed temp orgs are never sample-seeded, billed, or enrolled in automations — **sample seeding happens only at claim time**.
- **No user enumeration.** Bootstrap always creates a fresh org and never looks up users by email; the optional email only addresses the claim link.
- **Don't leak the key.** The API key is returned once; skills store it in `.env`/secret managers, never chat.
- **Captcha (Turnstile) deferred** — ship the rate limits first; add an API-side verify only if abuse appears.

## The CLI

`latitude` is a single self-contained binary **generated from `apps/api/openapi.json` by Fern** (`fernapi/fern-cli-generator`); it lives in the fully generator-owned `packages/cli`. Commands map 1:1 to API resources and are discovered at runtime via `--help` / `--schema`. It authenticates with `LATITUDE_API_KEY` (also auto-loaded from `.env`) or the OS keyring (`auth login`), and auto-loads `.env` from the working directory. Cross-platform binaries ship on GitHub Releases tagged `cli-vX.Y.Z` (`publish-cli.yml`). See [`docs/getting-started/cli.mdx`](../docs/getting-started/cli.mdx).

## The skills

Published in [`latitude-dev/skills`](https://github.com/latitude-dev/skills), installable via `npx skills add`:

- **`latitude-setup`** — the zero-account orchestrator (bootstrap → instrument → verify → clean → claim). Plan-then-approve; never prints the key.
- **`latitude-telemetry`** — adds Latitude / OpenTelemetry instrumentation; leads with "redirect an existing OTLP exporter before installing the SDK".
- **`latitude-cli`** — installs and drives the binary.

The public docs page for this flow is [`docs/getting-started/coding-agent.mdx`](../docs/getting-started/coding-agent.mdx); the landing CTA and README quick-start carry the copy-paste prompt.

## Key code references

- Bootstrap route + use-case wiring: `apps/api/src/routes/account.ts` (`registerBootstrapRoute`), mounted on `v1` **before** the auth-guarded routes.
- Rate limiters: `apps/api/src/middleware/rate-limiter.ts`.
- Domain: `bootstrapOrganizationUseCase`, `claimOrganizationUseCase`, `OrganizationClaim*` in `packages/domain/organizations`; slug stability in `packages/domain/projects`.
- Persistence + migration: `packages/platform/db-postgres` (`organization_claims`, `organizations.expires_at`, migration `20260703100125_temporary-account-bootstrap`).
- Web claim flow: `apps/web/src/routes/claim.$token.tsx` (mirrors `auth/invite.tsx`).

## Related docs

- [`organizations.md`](./organizations.md), [`projects.md`](./projects.md), [`api.md`](./api.md), [`mcp.md`](./mcp.md), [`authentication.md`](./authentication.md)
