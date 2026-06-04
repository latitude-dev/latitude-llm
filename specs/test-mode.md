# Test mode

A high-level summary of **Latitude Test Mode** and the decisions made so far. A
detailed implementation spec will follow.

## Why

The goal is a **good debugging experience while you build**. Today there's no way to
use Latitude from your dev machine without your development traces polluting
production — dashboards, issue clustering, alerts, and billing. Test mode gives
developers an isolated **sandbox** to send and inspect their dev traces, the way
Stripe gives you a test mode alongside live.

## What a sandbox is

A sandbox is a **first-class, org-level environment you switch into** — not a flag on
an individual project. It mirrors your organization's project layout (the same
project names) but holds **completely separate data: your development traces**. The
UI has a global **Live ⇄ Sandbox** switch, it's always unmistakable which one you're
in, and returning to Live is a deliberate action.

For now a sandbox is deliberately **minimal and light**: it ingests and shows your
traces, and nothing about ingestion triggers LLM work (no flaggers, evaluations, or
issue clustering). The value is **trace-level debugging** — see exactly what your
agent did while you build. The design leaves the door open to turn the richer,
LLM-driven features on per-sandbox later.

How many sandboxes an org can have is **capped by plan** and enforced (see Decisions).
They're small, light, sub-set copies of the org.

## Decisions

- **The API key decides the environment.** Whichever key your app sends telemetry
  with determines whether traces land in Live or in a specific sandbox. You instrument
  with the *same project names* everywhere; the key does the routing. A sandbox is its
  own organization (a sibling tenant — see **How isolation works**), and a key belongs
  to exactly one org, so a sandbox key authenticates to the sandbox org and **cannot
  name a Live project at all**: row-level security scopes every read and write to that
  org. This isn't a routing check that could be missed; it's the same tenant boundary
  that already keeps organizations apart.

- **Sandbox keys are visibly distinct and can be rate-limited differently.** Keys
  generated for a sandbox are prefixed **`lat_sandbox_`**, so they're easy to spot in
  code, logs, and review. We also leave the door open to give sandbox keys their **own
  (lower) rate limit**: a developer who accidentally ships production code pointing at
  a sandbox key hits errors as soon as real traffic arrives — a loud, immediate signal
  to fix it, instead of silent misuse. Combined with a sandbox being deliberately
  poor for production use (no issues/alerts, short retention, sleeps when idle), this
  makes pointing production at a sandbox self-defeating and quickly noticed.

- **Sandbox API keys are managed from inside the sandbox.** Keys are created and revoked
  exactly as in the main org — the existing API-key CRUD, run scoped to the sandbox org —
  so new keys carry the `lat_sandbox_` prefix and, by construction, can only write to that
  sandbox. No new key model: `api_keys.organization_id` already points at the sandbox org
  and RLS keeps each sandbox's keys isolated. Management lives in the sandbox settings UI
  and uses the **same role check as the main org**, evaluated against the user's
  *parent-org* membership.

- **No LLM work runs on sandbox ingestion (by design).** The side-effects of span
  ingestion that cost real money — flagger classification and context extraction,
  evaluations, issue-clustering embeddings — **do not run** in a sandbox. Storing and
  viewing traces works fully; the LLM-driven layer is simply off. This is the core
  scoping decision for now, and it's a clean on/off boundary, built so those features
  can be switched on per-sandbox in the future without rework. Whether ingestion is a
  sandbox is simply a property of the organization (`parent_org_id != null`), resolved
  once — not a flag threaded through the pipeline.

- **Sandbox usage is free; abuse is bounded by non-credit limits.** A sandbox has no
  billing entity and its traces are **not metered or charged** — the credit meter is never
  touched. Abuse is bounded instead by a **lower per-key rate limit** (throughput) and a
  **per-period span quota** (volume), both enforced as loud ingest refusals on the
  sandbox's own data. See **Usage limits** below.

- **You choose which projects a sandbox has — no auto-create on ingestion.** A sandbox
  shows your full production project list (read from the parent — you're a member, so it's
  an ordinary scoped read), and you **explicitly add** the ones you want to debug: adding a
  production project creates a linked sandbox project in the sandbox org's own namespace;
  you can also create **sandbox-only** projects for prototyping. Sending a trace to a slug
  the sandbox doesn't have is **rejected** — exactly as Live rejects unknown slugs — so
  there's no divergence between environments and no silently-spawned typo projects. The
  rejection is loud and points you to add the project in the sandbox UI.

- **Sandbox↔production projects link by stable id; slug divergence is surfaced, not
  auto-fixed.** A project's **slug is mutable, but only by a deliberate, explicit act** —
  the dashboard danger zone, nowhere else (renames never touch it, the API can't change
  it). So neither name nor slug is a durable key. When you add a production project to a
  sandbox, the sandbox project is **linked to that production project's stable id at
  creation** — the durable key, immune to renames and slug changes. A sandbox project
  added *without* picking a production one is **unlinked**: we assume it's something new (a
  sandbox-only project) and infer nothing from a later name collision. The sandbox project
  keeps its own slug in the sandbox namespace; because the UI already reads the linked
  production project (by id), it **compares slugs on read** and, when they differ — e.g.
  production renamed the slug and your dev code now sends the new one, so ingestion gets
  rejected until reconciled — shows a **"slug diverged" badge** with a one-click *match
  production slug* action. We deliberately **don't** silently re-slug the sandbox: no
  magic, and divergence is sometimes intended (testing a rename locally before shipping
  it). If the linked production project is **deleted**, the sandbox project shows as
  orphaned and can be unlinked (becoming sandbox-only). No domain event is needed —
  divergence is a comparison, not a push.

- **Isolation reuses what we already have.** A sandbox **is its own organization**, with
  a nullable `parent_org_id` pointing at the live org it belongs to. Because the whole
  system is already organization-scoped — RLS, slug-uniqueness-per-org, ClickHouse
  `(organization_id, project_id)` partitioning — a sandbox is isolated **by
  construction**, with no new scoping machinery and no risky migration of the trace
  store. See **How isolation works** below.

- **Sandbox data never appears in Live.** A sandbox org's data is invisible to the
  parent because RLS scopes every query to one organization — there's nothing extra to
  remember in dashboards, analytics, or billing rollups. Sandbox orgs also have **no
  member rows**, so they never surface in org switchers or "your organizations" lists;
  you only ever reach one through the sandbox UI. (ClickHouse has no RLS, but its spans
  are partitioned by `organization_id`, so the same isolation holds.)

- **Sandbox count is limited per plan — the cap counts *active* sandboxes.** Free orgs
  get **one active** sandbox, Pro **up to 15**, Enterprise higher. Archived (asleep)
  sandboxes **don't count** toward the cap — they hold no live capacity and their spans
  age out via retention — so a sandbox going to sleep frees a slot and a Free user is
  never stuck (you can spin up a fresh one or reactivate an old one). **Deleting** a
  sandbox is the only destructive action and the way to reclaim a slot/storage
  permanently; reactivation is allowed whenever it won't exceed the active cap (otherwise
  archive or delete another first). Enforced on the backend and surfaced in the UI.

- **Downgrading auto-archives the excess, non-destructively.** When a plan change drops
  the cap below the number of *active* sandboxes, we keep the **most-recently-active**
  ones up to the new cap and **archive the rest** — nothing is deleted, and the UI says
  which were put to sleep. Downgrading usually means fewer resources are needed, so
  quieting the extras is the expected outcome; reactivate within cap later, or delete to
  reclaim storage early.

- **Sandboxes sleep after 7 days of inactivity.** With no new traces for 7 days a
  sandbox is archived (put to sleep); you can also archive one manually. Sleep state —
  `status` (active/archived) and `last_activity_at` — lives on a 1:1 sandbox-attributes
  row keyed to the sandbox org (a sandbox *is* an `organizations` row, so there's no
  separate sandbox entity table); `last_activity_at` is stamped at ingest (debounced), and
  a **daily scheduled sweep** archives sandbox orgs idle past the threshold. Sending spans
  to
  a sleeping/archived sandbox **fails the same way out-of-credits does**: an immediate
  **4xx before any span is stored** — a `403` with `kind: "SandboxArchived"`, mirroring
  billing's `402 NoCreditsRemaining` — so nothing is silently accepted and no sandbox is
  silently revived. A 4xx (other than 429) is non-retryable in OTLP, so the exporter logs
  it and drops the batch rather than retry-looping; and because exporters don't surface
  the response body to app code, the sandbox UI also shows a *last rejected ingest* signal
  as the human-facing surface. You reactivate to resume. (Span retention is separate and
  short — proposed **7 days** — and is a per-row value, so it can stay flat or vary by
  plan later with no structural change.)

- **A sandbox never sends external notifications.** Even once issue detection is
  enabled in the future, a sandbox must **never** reach an external channel — no
  email, Slack, webhook, SMS, or push. A developer's experiments must never page
  teammates or reach customers' alert channels. In-sandbox UI surfacing is fine; only
  outbound alerts are forbidden.

- **The sandbox traces UI is a live, list-first debug view.** It shows the
  Traces/Sessions list only — the production summary panel and histogram
  (cost/tokens/duration totals) are hidden as monitoring noise; per-row columns stay
  (duration, tokens, spans, model, status). Spans stream in with no manual refresh: after
  a span is persisted the worker publishes an id-only signal over Redis Pub/Sub and the UI
  refetches the visible list — never splicing rows client-side, so sort/filter/pagination
  stay correct. SSE transport, polling fallback, WebSockets deferred. See **Realtime**
  below.

## How isolation works

A sandbox **is its own organization** — an ordinary `organizations` row with a nullable
`parent_org_id` pointing at the live org it belongs to (a *sibling tenant*). Everything
else follows from reusing the tenant boundary the system already enforces.

- **Isolation is the org boundary, by construction.** RLS already scopes every read and
  write to one organization (`organization_id = get_current_organization_id()`), slugs
  are already unique per org, and ClickHouse `spans` are already partitioned by
  `(organization_id, project_id)`. A sandbox inherits all of this for free: the *same*
  project slug can exist in Live and in the sandbox because they're different orgs, and a
  sandbox key can never name a Live project because RLS won't let it. No new scoping
  predicate, no per-environment unique index, no trace-store migration.

- **Access without membership — a runtime sandbox middleware.** Users are **not** given
  member rows in the sandbox org. Instead, requests under `/sandbox/:sandboxOrgId` pass
  through a middleware (mirroring the existing `adminMiddleware`) that authorizes the
  request *iff* the sandbox's `parent_org_id` is an organization the user is a member of,
  then runs the request scoped to the **sandbox** org by passing its id to
  `withPostgres(layer, client, sandboxOrgId)`. The browser session's active org never
  changes; RLS does the rest. This is also why sandbox orgs stay out of org switchers and
  "your organizations" lists — those are driven by the `members` table, which has no rows
  for a sandbox. We don't materialize members, but we **do** record each sandbox's
  creator/owner (`created_by_user_id`, a user in the parent org) for attribution and as the
  basis for any owner-gated action — it's metadata, not a membership, so it doesn't
  reintroduce the sync problem.

- **One guard to engineer: never act on the parent by accident.** Because the org used
  for data access is a per-request argument, the failure mode flips: the risk is a
  sandbox-namespace handler that forgets to swap and silently operates on the live parent
  org. We remove it structurally with a `createSandboxServerFn` wrapper that makes the
  sandbox org the **only** org reachable inside the namespace — a handler there cannot
  obtain `session.activeOrganizationId` at all.

- **Ingestion routes by the key's org, as it already does.** A `lat_sandbox_` key belongs
  to the sandbox org; the existing key→org binding (`validate-api-key`) resolves it, and
  project resolution is scoped to that org. A sandbox key can only ever write to its
  sandbox; a Live key can only ever write to Live. Nothing new in the ingest hot path.

- **Sandboxes aren't billed; only the plan resolves through the parent.** Sandbox usage
  is free — nothing is metered or charged. `resolveEffectivePlan` branches on
  `parent_org_id` only to read the parent's plan for per-plan **limits and retention**.
  Abuse is bounded by a lower per-key rate limit and a per-period span quota on the
  sandbox's own data — no parent-scope billing write. See **Usage limits**.

- **"No LLM work" is a property of the org.** Whether ingestion is a sandbox is just
  `parent_org_id != null`, resolved once from the org and carried on the `TracesIngested`
  event — not a flag threaded through several hops. The flagger/eval/embedding fan-out is
  gated on that one fact.

- **Cross-org reads need no escape hatch.** Showing the Live project list inside a sandbox
  is an ordinary scoped read against the parent org — the user is a member of it — paired
  with scoped reads against the sandbox. No admin/RLS bypass.

### Alternative considered: a sandbox as a scoping dimension on the org

Instead of a sibling org, a sandbox could be a **dimension within the same org**: a
nullable `sandbox_id` on `projects` and `api_keys` (null = Live), the projects unique
index widened to `(organization_id, sandbox_id, slug)` so the same slug can coexist
across environments, an `app.current_sandbox_id` added to the per-transaction scoping and
folded into the RLS policy (`organization_id = current_org AND sandbox_id IS NOT DISTINCT
FROM current_sandbox`), and ClickHouse org-wide rollups scoped to the Live `project_id`s
(or a denormalized `sandbox_id` on `spans`).

This would be **lighter on org-management**: billing and membership stay trivially on the
one org, there are no sandbox orgs to hide from switchers, and no cross-org reads. It is a
reasonable design and the right one if we never want a sandbox to grow past "a partition
of my org."

We don't choose it because it pushes isolation into **new data-plane plumbing that must
be correct everywhere** — a second RLS predicate, a widened unique index, and a
`sandbox_id` filter threaded through every ClickHouse rollup — whereas the `parent_org_id`
model reuses the org boundary that *already* isolates by construction. With the runtime
sandbox middleware removing the membership cost and parent-billing removing the billing
cost, the sibling-org approach keeps the strong "by construction" isolation while its
remaining work is contained to the middleware, a safe server-fn wrapper, and following
`parent_org_id` in plan resolution. The `sandbox_id` dimension stays documented here as
the fallback if the org boundary ever proves too heavy.

## Data model

The whole feature is a thin layer over existing tables — no new trace store, no billing
schema:

- **`organizations.parent_org_id`** — nullable self-FK. Non-null ⇒ this org *is* a sandbox,
  pointing at its parent (live) org. This single column carries "is a sandbox," the parent
  link for plan/limit resolution, and the LLM-off gate.
- **Sandbox lifecycle & ownership** — `status` (active/archived), `last_activity_at`, and
  `created_by_user_id` (the owner — a user in the *parent* org), 1:1 with the sandbox org (a
  small `sandboxes` row keyed by `organization_id`, or columns on `organizations`). Drives
  sleep/wake, the idle sweep, and creator attribution.
- **`projects.linked_project_id`** — nullable FK to the production project's stable id, set
  when you add a production project to a sandbox; null ⇒ a sandbox-only project. Powers the
  stable-id link, the on-read slug-divergence badge, and orphan-on-delete handling.
- **Redis (not Postgres)** — the per-period span-quota counter
  (`org:${sandboxOrgId}:sandbox:quota:…`), self-resetting via TTL.
- **Unchanged** — `api_keys` (a sandbox key is just one whose `organization_id` is a sandbox
  org), `spans` and the ClickHouse trace store (already partitioned by
  `(organization_id, project_id)`), and all billing tables (sandboxes aren't billed).

## Usage limits (sandboxes aren't billed)

Sandbox usage is **free**. A sandbox is its own organization with **no billing entity** —
no Stripe customer, no subscription — and its traces are **never metered or charged**:
nothing is written to `billing_usage_events` / `billing_usage_periods`, the parent's credit
balance is untouched, and there is no pass-through. (This also removes the parent-scope
billing write, the idempotency-key folding, and the `sandboxConsumedCredits` column a
credit-based draft would have needed — the billing code simply never runs for sandbox
ingestion.)

The only thing that still resolves through the parent is the **plan**: `resolveEffectivePlan`
branches on `parent_org_id` to read it, which supplies the sandbox's per-plan **limits and
retention** — never to charge.

Abuse is bounded by two enforced limits, plus the structural properties that already make a
sandbox poor for production use:

### Rate limit (throughput) — primary

Sandbox keys get their own, **lower** rate limit (requests/min and bytes/min), reusing the
existing per-key ingest rate limiter; exceeding it returns the standard **429 +
`Retry-After`**. This bounds bursts and DoS, and is why shipping production traffic at a
sandbox key fails loudly and immediately.

### Per-period span quota (volume)

A per-plan ceiling on how many spans a sandbox may ingest per period (e.g. `free`, `pro`,
`enterprise: ∞`), set as a constant on each `PlanConfig` in `constants.ts` and read through
`resolveEffectivePlan`. This is **not a new data model** — it's the same shape as the rate
limit, just a longer window: a **Redis counter** keyed
`org:${sandboxOrgId}:sandbox:quota:${periodStart}`, `INCR`'d by the span count at ingest
with a TTL to the period end so it resets itself (no table, no sweep, no RLS/scope
concern). Approximate counting is fine — this is an abuse guard, not financial data, so it
needs no durable row or audit trail. (If we ever want durability, the fallback is two
columns on the 1:1 sandbox-attributes row, not a new table.) Exceeding the ceiling refuses
ingestion with a **4xx** (`kind: "SandboxQuotaExceeded"`), the same loud-refuse path as an
archived sandbox. Because the quota is per-sandbox and the active-sandbox count is capped
per plan, total dev volume per org is bounded without any shared, parent-owned counter.

### Structural bounds

Short retention (spans age out), idle-sleep (7 days → archived → ingestion refused), and
the per-plan active-sandbox cap bound total footprint regardless of the above. Because none
of this touches the credit meter, sandboxes stay genuinely free while a runaway script is
stopped immediately by the rate limit and over the period by the span quota — both enforced
on sandbox-owned data and surfaced as loud refusals.

## Realtime (sandbox traces)

A sandbox should feel like watching traces stream into your terminal: you run your
agent and the UI updates as spans arrive, no refresh. This is what makes the sandbox
genuinely pleasant for local debugging.

- **List-first, no summary aggregations.** The sandbox reuses the production
  **Traces | Sessions** list, grouping, sorting, and filters, but **drops the summary
  panel and histogram** (sessions/cost/tokens/duration/traces/spans totals). For a
  single-dev debugging loop those are monitoring noise, not signal — you want to see what
  just arrived, not roll-ups over a window. The **per-row** columns stay (a trace still
  shows its duration, tokens, spans, model, status — a trace is inherently an aggregate of
  its spans), and remain user-toggleable via the Columns picker. Implementation is a
  conditional that hides the aggregation panel in the sandbox namespace; the list reuses
  the same endpoints and components. v1 UI is that list view plus a small modal for
  sandbox settings.

- **Transport: SSE preferred, polling acceptable; WebSockets deferred.** Updates are
  one-directional (server → UI), so Server-Sent Events fit better and cost far less
  than a bidirectional WebSocket server. Plain polling (every 1–2s) is a fine v1
  fallback for a single-dev, low-volume sandbox. Reviving v1's dedicated WebSocket
  infra is a heavier, **company-level** decision — justified only if realtime is
  wanted beyond the sandbox — so it's out of scope here. The SSE endpoint is **net-new**
  (there's none in `apps/web` today) and assumes the web tier is a long-running process —
  true for our containerized deploy; a serverless web tier would fall back to polling.
  Stream authz is the sandbox middleware (the SSE route lives under `/sandbox/:sandboxOrgId`).

- **Bridging ingestion → UI.** Ingestion runs on the workers, not the web server, so
  we bridge them with **Redis Pub/Sub** (Redis is already in our stack; the Pub/Sub channel
  itself is a small net-new addition — today Redis backs only cache and BullMQ): the worker publishes a
  small message to a sandbox-scoped channel (`org:${organizationId}:sandbox:…`)
  **after the span is persisted** (so any refetch is guaranteed to see it) and **only
  for sandboxes**. The web server subscribes and relays to that sandbox's SSE clients.

- **Push-triggered invalidation, not row-upsert.** The signal carries only ids —
  `{ sandboxId, traceId, sessionId }` — never trace content. On receipt the UI
  **invalidates and refetches the currently visible list query** from the same production
  endpoints; it does *not* splice a single row into the view. This is deliberate:
  traces/sessions are server-computed `AggregatingMergeTree` views with sorting, filters,
  pagination, and per-row aggregation (a trace row sums its spans; a session row its
  traces) — a row-upsert can't keep those correct without re-aggregating on the client.
  Refetching keeps the server the single source of truth, and any missed signal self-heals
  on the next refetch.

- **One signal, coalesced.** The canonical event is "trace upserted" (covers both new
  and growing traces); an optional raw-span "liveness" pulse can show activity before
  the row is meaningful. We coalesce per trace (~one update every few hundred ms) so a
  chatty trace feels live without flooding the UI.

- **Cheap by construction — and cheaper than polling.** The refetch fires only for the
  *currently mounted* view of a connected, focused client (background tabs pause via the
  Page Visibility API), is throttled (~500 ms–1 s, leading+trailing), and is deduped by
  React Query — so a chatty trace is ~1–2 refetches/sec, not one per span. Page 1
  newest-first is a small bounded scan, and with the summary panel gone there's no
  separate aggregate query to run at all. When nobody is watching, the worker's Redis
  `PUBLISH` is dropped
  and **no query runs at all** (unlike timer polling). Fan-out is one Redis subscription
  per web instance, relayed in-process to its SSE clients — so it scales with instances,
  not viewers. Read-after-write: publish only after the span is persisted, and pin the
  refetch to a consistent replica (or accept sub-second lag).

This is about **trace data** appearing live — independent of the LLM-driven feedback
(flaggers/issues), which stays off in a sandbox for now.

## Future (door left open)

- **LLM-driven feedback in a sandbox** — flaggers, evaluations, issue clustering. Off
  by design today; the architecture is built so we can switch it on per-sandbox later.
  When we do, that brings its normal billing, and we can shorten the trace-settling
  debounce so the feedback feels near-real-time for a tight debug loop.
- **Testing a production fix inside a sandbox** — replaying a production issue's traces
  against a candidate fix. Depends on the above, plus crossing the production→sandbox
  data boundary (sensitive data, copy-vs-read). Deferred to its own spec.

## Not in scope

- A separate parallel deployment or new infrastructure — we isolate within the
  existing system.
- Live-mirroring of production traffic into the sandbox.

