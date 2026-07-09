# Showcase

The **Showcase** is a single, shared, read-only demo — one curated "here's what a healthy Latitude project looks like," served to every eligible organization at a stable URL, `/projects/lat-demo`.

It's designed to give three things at once:

- **Instant onboarding** — nothing is generated at signup; the Showcase already exists, so a new user sees a populated project immediately.
- **A demo that never decays** — behaviours are time-windowed (taxonomy + conversation-intelligence read models over a rolling window, plus ClickHouse retention TTLs), so the Showcase is refreshed centrally on a schedule to stay fresh (see [regeneration](#how-it-stays-fresh-regeneration-and-the-bluegreen-swap)).
- **One read-only copy** — a single curated project everyone can look at but no one can change, so there's no per-tenant data to seed or maintain.

Because it's one shared project rather than one per org, refreshing it is a cheap, centralized chore that never races anyone's data.

## Contents

1. [Goal and who sees it](#goal-and-who-sees-it)
2. [Anatomy](#anatomy)
3. [Clean code: one enforced way to scope a read/write](#clean-code-one-enforced-way-to-scope-a-readwrite)
4. [Security](#security)
5. [Read-only enforcement](#read-only-enforcement)
6. [How it stays fresh: regeneration and the blue/green swap](#how-it-stays-fresh-regeneration-and-the-bluegreen-swap)
7. [Creation and lifecycle (backoffice)](#creation-and-lifecycle-backoffice)
8. [Surfacing it in the UI](#surfacing-it-in-the-ui)
9. [Onboarding](#onboarding)
10. [Gotchas and things worth knowing](#gotchas-and-things-worth-knowing)
11. [File map](#file-map)

---

## Goal and who sees it

- **One project, shared and read-only.** No per-org copies, no data pollution — a curated exhibit anyone can look at but no one can change.
- **Scoped to new orgs, opt-out.** An org sees the showcase only when its `organization.settings.wantsShowcase === true`. That flag is set **at org creation** (`provision-organization-workspace.ts`) and **not backfilled**, so existing orgs are untouched. Any member can dismiss it (org-wide — see [Surfacing it in the UI](#surfacing-it-in-the-ui)).
- **Stable, shareable URL.** It always lives at `/projects/lat-demo` even though the underlying project id rotates on every refresh (the slug is a route sentinel resolved through a pointer — see [Anatomy](#anatomy)).

The showcase is **not** a template users clone. When a user reaches for an action inside it, they're pointed at creating their own project.

## Anatomy

A dedicated **system organization** (created lazily, name "Showcase", slug `showcase`) owns the showcase project. No human is ever a member of it.

A **singleton pointer table**, `latitude.showcase`, names which project is live:

| column | meaning |
| --- | --- |
| `id` | always `1` — enforced by `CHECK (id = 1)`, so the table holds exactly one row |
| `organization_id` | the showcase org |
| `current_project_id` | the live project users read (null before the first build) |
| `next_project_id` | the project being built for the next swap (null when idle) |
| `next_state` | `"building"` \| `"ready"` while a build is in flight; **idle is `next_project_id IS NULL`** |

It is a **system/config table, deliberately without RLS** — it *stores* an org id, it isn't org-scoped data. The runtime role (`latitude_app`) has `SELECT`/`UPDATE` only; `INSERT`/`DELETE` are revoked, so the singleton is created through the admin/superuser connection (backoffice), never at runtime. Id columns are plain cuids with no FK constraints (repo-wide no-FK rule). Schema: `packages/platform/db-postgres/src/schema/showcase.ts`; migration `.../drizzle/20260706123819_showcase-pointer-table/`.

**Failure is not a state.** There is no `"failed"` value and no error column — a failed build is a loud (Datadog) error that leaves `current` untouched; a stale `building` pointer is self-healed by the cleanup cron (see [regeneration](#how-it-stays-fresh-regeneration-and-the-bluegreen-swap)).

The domain lives in `@domain/showcase` (`packages/domain/showcase`): the pointer entity + repository port, the guarded `createShowcase`, the `resolveShowcase` resolver, and `swap`.

## Clean code: one enforced way to scope a read/write

This is the part most worth understanding, because it governs **every** project data access — Test Mode (sandbox) and Showcase alike, not just the demo.

**The problem it solves.** A project read/write must answer "which organization does this belong to?" Normally that's the viewer's session org. But under Test Mode the answer is the *sandbox* org, and under the Showcase it's the *showcase* org — a different org than the viewer's. A new query that reaches for the session org by habit would silently read or write the **wrong tenant**.

**The rule: every scoped read/write gets its org from `resolveOrgScope(context)`, never from the raw session.**

1. **`ProjectScope`** (`apps/web/src/domains/projects/project-scope.tsx`) is a small union — `{ kind: "live" }`, `{ kind: "sandbox"; orgId }`, `{ kind: "showcase" }`. The route sets it (a `<ProjectScopeProvider>` wraps the whole `ProjectLayout` under `/projects/lat-demo`), and the write-gate's client middleware stamps the current scope onto **every** outgoing server-fn call via `getCurrentProjectScope()` (derived statelessly from the URL). So `context.projectScope` reaches every server handler, per-request — never a server singleton.
2. **`resolveOrgScope(context)`** (`apps/web/src/server/resolve-org-scope.ts`) maps that scope to exactly one org id and **re-authorizes** on the way: `live` → the session's active org; `sandbox` → the sandbox org *after* confirming the caller belongs to its parent org; `showcase` → the pointer's org *after* confirming the requesting org's `wantsShowcase`. Each non-live branch authorizes server-side, so a spoofed scope can only ever resolve an org the caller is already entitled to.
3. The result is a **branded `ScopedOrgId`**. The brand can only be minted inside `resolve-org-scope.ts` (three `as ScopedOrgId` casts, each sitting on the far side of an authorization).
4. The data-layer wrappers **`withScopedPostgres` / `withScopedClickHouse`** (`apps/web/src/server/scoped-{postgres,clickhouse}.ts`) *require* a `ScopedOrgId`. They delegate to the plain `withPostgres`/`withClickHouse` unchanged — the only difference is the type of the org argument.
5. **Biome bans raw `withPostgres` / `withClickHouse`** in scoped web domains (`biome.json`, two `overrides` blocks). Using the raw wrapper in a scoped domain is a lint error whose message points you at the scoped one.

**Net effect:** forgetting to scope a query is a **compile/lint error, not a silent wrong-tenant read**. Behaviour is byte-identical under `live` (`resolveOrgScope` returns the session org; `projectScopeKey`/`projectScopeData` are empty). A new scoped read just calls the one chokepoint; a new scope kind is wired once; and a read that *forgets* defaults to the session org — which fails safe (finds nothing), never cross-tenant.

**Exempt domains.** Some domains legitimately resolve the *viewer's own* org (or a cross-org id), not the project scope — "where do *my* things go?" These are excluded from the ban and keep raw `withPostgres`/`withClickHouse`: `admin`, `agent-dispatch`, `api-keys`, `auth`, `billing`, `destinations`, `feature-flags`, `integrations`, `members`, `notifications`, `oauth`, `organizations`, `projects`, `sandbox`, `showcase`, `sso`, `users`, `wrapped`. `members` is the one dual domain — member management is session-org (raw), but its project-member read (`listProjectMembers`, for assignee/attribution) opts into `withScopedPostgres` explicitly.

## Security

Read-only and cross-org visibility rest on the tenancy model itself, not on UI checks that can be forgotten. Two independent layers, plus the resolver's authorization:

**Layer 1 — structural org-scoping (the real boundary).** A write always resolves the *viewer's own* org (writes are never scoped to the showcase), so it physically can't touch the showcase project: on Postgres, RLS + the repo's `WHERE org_id = ?` make it not-found; on **ClickHouse there is no RLS**, so the query's org parameter is the *only* tenant boundary — which is exactly why `ScopedOrgId` exists and why a scoped ClickHouse read against a raw org won't compile. No human is a member of the showcase org either, so membership can't grant a write.

**Layer 2 — the write-gate (clean error + UX).** A single global `functionMiddleware` (`apps/web/src/middlewares/write-gate-middleware.ts`, registered in `start.ts`) rejects any write under a read-only scope. It decides write-vs-read by HTTP method — all `GET`s pass; `POST`s are writes, minus a small allowlist of genuine POST-reads and chrome-state writes (`previewEvaluation`, `listLinearTeamsForApiKey`, `listCursorRepositoriesForApiKey`, `rememberLastProjectSlug`, `dismissShowcase`, `reportClientError`). An unidentifiable POST **fails closed**. Blocked calls throw `ReadOnlyProjectError` (a `Data.TaggedError`, HTTP 403, in `@domain/shared`); the middleware's client half catches it and opens a "create your own project" modal. This layer's scope signal is client-supplied, so it's the *clean-error/UX* layer — **Layer 1 is the security boundary.**

**Authorization + no information leak.** The showcase resolver (`resolveShowcaseUseCase`) authorizes on the requesting org's `wantsShowcase === true` before returning the pointer's org. A missing org, an absent/false flag, and "no showcase exists" all collapse to the **same 404**, so a dismissed or ineligible org can't tell whether a showcase exists at all. The resolver's org id must be passed identically to both the data-layer wrapper and the repo/query arg — a mismatch would read the wrong tenant, so the resolver returns exactly one value for both.

**Only synthetic data.** The showcase org holds curated seed data only. That's a design invariant to preserve if the demo is ever exposed publicly (it's private/auth-gated today).

## Read-only enforcement

Read-only is achieved by **not wiring any write path to the showcase scope** (Layer 1), plus the write-gate (Layer 2) and central mutation error handling. There is no per-button or per-endpoint permission system.

- Because writes resolve the viewer's own org, mutation server-fns simply can't reach the showcase project.
- The write-gate turns an attempted write into a typed `ReadOnlyProjectError` → the modal.
- All mutation errors — both `useMutation` and TanStack DB collection mutations (which bypass the query cache) — funnel through one handler so nothing goes unhandled; on `ReadOnlyProjectError` it opens the modal, otherwise it toasts.

## How it stays fresh: regeneration and the blue/green swap

The demo is rebuilt on a schedule so its behaviours never age out. Because behaviours are time-windowed and ClickHouse enforces table-level retention TTLs anchored on each row's timestamp (there is no per-project exemption), a static seed *must* eventually expire. Regeneration re-anchors the data to "now" — affordable precisely because there is exactly one project to refresh and it's read-only.

It never mutates the live project in place (that would show every viewer a half-built demo). It's **blue/green**:

1. **Build `next`.** The daily cron (`0 4 * * *` UTC, registered in `apps/workers/src/server.ts`) triggers `createShowcaseWorker`, which resumes an existing `building` pointer or provisions a fresh project (`settings.isShowcase = true`) and calls `beginNextBuild`, then starts `regenerateShowcaseWorkflow`.
2. **Seed + gate.** The workflow runs the seed workflow (`seedDemoProjectWorkflow`) as a child (re-anchored to now) to populate the new project, then a **quality gate** — `assertShowcaseNextQualityActivity` requires ≥ `SHOWCASE_MIN_TRACES` (100) distinct traces, so a thin/empty seed throws `ShowcaseQualityGateError` (non-retryable) *before* any swap and leaves `current` untouched.
3. **Mark ready → swap.** `markNextReady` sets `next_state = "ready"`; the **atomic swap** (`swapShowcaseUseCase` → `showcase-repository.swap`) does `SELECT … FOR UPDATE` on the singleton, asserts `ready`, then `current ← next`, clears `next`, resets state — all in one transaction, so a manual backoffice swap and the scheduled one can't race. Best-effort Redis invalidation of `showcase:current` follows (the 300s TTL self-heals a missed invalidation).
4. **Retire + self-heal.** A separate cleanup cron (`0 3 * * *` UTC) reclaims a **stale `building`** pointer (older than 2h *and* its workflow no longer alive) back to idle, and **retires** old projects — those neither `current` nor `next`, past a 15-minute grace — via `projectRepo.softDelete` + a `ProjectDeleted` outbox event. ClickHouse telemetry ages out through the ordinary `ProjectDeleted` cascade + retention TTL; there's no showcase-specific CH purge.

Showcase projects are excluded from taxonomy gardening (and analogous per-project background work) via the `settings.isShowcase` flag (`gardenable-projects.ts`), so the curated tree isn't rebuilt or deprecated underneath it.

Both regeneration and the swap are also available on demand from the backoffice.

## Creation and lifecycle (backoffice)

The showcase is **not auto-bootstrapped** — it's created deliberately from `/backoffice/showcase`:

- **Create** calls the guarded `createShowcaseUseCase`, which creates the showcase org + the singleton row and **fails loudly (`ShowcaseAlreadyExistsError`, 409) if one already exists** — belt-and-suspenders with the `id = 1` primary key. So there is exactly one, ever, and only when an operator makes it.
- **Regenerate / Swap now / Reclaim stale build** map to the same use-cases the cron drives ("Swap now" is enabled only when `next_state === "ready"`).
- A **per-org toggle** (`adminSetOrganizationShowcase` / the backoffice org action) flips a specific org's `wantsShowcase`.

Admin server-fns (`apps/web/src/domains/admin/showcase.functions.ts`) run behind `adminMiddleware` on the RLS-bypass admin Postgres client. Before a showcase exists — or for an org without `wantsShowcase` — everything degrades gracefully: the resolver returns nothing, `/projects/lat-demo` redirects out, and the switcher omits the entry.

**Self-hosting:** the showcase is optional, created once from the backoffice; nothing is provisioned on boot. The seed snapshot ships with the app, so there's no new external dependency.

## Surfacing it in the UI

- **Route.** The `$projectSlug` loader (`apps/web/src/routes/_authenticated/projects/$projectSlug.tsx`) detects the reserved slug `lat-demo`, resolves the pinned project cross-org through the resolver (rather than the org-scoped `findBySlug`), and wraps the layout in `<ProjectScopeProvider scope={SHOWCASE_SCOPE}>` so descendant reads scope to the showcase org.
- **Switcher.** The showcase lives in a different org, so `listProjects` (org-scoped) never returns it. The **client** projects collection merges a single marked (`isShowcase`) read-only entry — `Promise.allSettled([listProjects(), getShowcaseProjectRecord()])`, so a failed showcase fetch degrades to `null` and the real project list still loads. The server projects repository stays pure/org-scoped. Because the entry is *in* the collection, the by-slug "current project" lookups scattered across the UI resolve it too, with no per-page change.
- **Chrome.** A subtle read-only banner (`showcase-banner.tsx`); all top-of-sidebar sections shown read-only; **Settings hidden** under a read-only scope (and its route hard-redirects `lat-demo` back to the project).
- **Dismiss.** The banner's "Remove demo" calls `dismissShowcase`, which flips the viewer's **own** org `wantsShowcase` to `false` (org-wide, so it affects the whole team — the control says so and confirms). It's a viewer-own-org write on the exempt `organizations` domain, and it's in the write-gate allowlist so it works even while viewing the showcase. Afterward the entry disappears and `/projects/lat-demo` 404s for that org.

## Onboarding

New orgs are created with `wantsShowcase = true`, so the Showcase appears in their switcher, and onboarding lands a new user on `/projects/lat-demo` — a populated, healthy project as the first impression — while their *own* default project starts empty, ready for real traces.

## Gotchas and things worth knowing

- **`lat-demo` is globally reserved.** `RESERVED_PROJECT_SLUGS` (`@domain/shared/src/slug.ts`) blocks it at every slug write, and `generateSlug` auto-suffixes a reserved base, so a user naming a project "Lat Demo" gets `lat-demo-1` and never collides with the sentinel. This is app-layer (the DB uniqueness is per-org; the reservation is global).
- **The scope system is general.** `ProjectScope` / `resolveOrgScope` / `ScopedOrgId` / the Biome ban govern Test Mode (sandbox) and any future cross-org view too — the Showcase is one consumer, not the owner.
- **Redis.** The pointer resolves through `showcase:current` (300s TTL); only live resolutions are cached (never a null), cache errors degrade to the DB, and the swap invalidates best-effort.
- **Adding a POST that's actually a read** under a scoped surface requires adding it to the write-gate allowlist, or it will be blocked as a write.
- **`settings.isShowcase`** marks showcase-org projects so they're excluded from taxonomy gardening and normal retention handling — set it on any project the Showcase owns.

## File map

**Scoping / security**
- `apps/web/src/domains/projects/project-scope.tsx` — `ProjectScope`, provider, `getCurrentProjectScope`, key/payload helpers, `isReadOnlyScope`
- `apps/web/src/server/resolve-org-scope.ts` — `resolveOrgScope` / `requireScopedSession`, the `ScopedOrgId` brand
- `apps/web/src/server/scoped-postgres.ts`, `apps/web/src/server/scoped-clickhouse.ts`
- `apps/web/src/server/resolve-showcase-access.ts` — the read-side chokepoint
- `apps/web/src/middlewares/write-gate-middleware.ts` + `apps/web/src/start.ts`
- `packages/domain/shared/src/errors.ts` — `ReadOnlyProjectError`; `biome.json` — the two ban blocks

**Domain**
- `packages/domain/showcase/` — entity/errors/port, `create-showcase`, `resolve-showcase`, `swap-showcase`, `retirement.ts`
- `packages/platform/db-postgres/src/schema/showcase.ts` + `repositories/showcase-repository.ts`
- `packages/domain/shared/src/slug.ts` — `SHOWCASE_PROJECT_SLUG = "lat-demo"`, reserved-slug helpers
- `packages/domain/shared/src/settings.ts` — `wantsShowcase` (org), `isShowcase` (project)

**Regeneration / workers**
- `apps/workflows/src/workflows/regenerate-showcase-workflow.ts` + `activities/showcase-regeneration-activities.ts`
- `apps/workers/src/workers/showcase.ts` + `apps/workers/src/server.ts` (crons)

**UI / backoffice**
- `apps/web/src/routes/_authenticated/projects/$projectSlug.tsx`, `domains/projects/showcase-project.ts`, `domains/showcase/showcase.functions.ts`, `domains/projects/projects.collection.ts`
- `routes/_authenticated/projects/-components/showcase-banner.tsx`, `domains/projects/project-sections.ts`
- `packages/domain/organizations/src/use-cases/dismiss-showcase.ts`, `.../provision-organization-workspace.ts`
- `apps/web/src/domains/admin/showcase.functions.ts` + `routes/backoffice/showcase/`
