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
  with the *same project names* everywhere; the key does the routing. A sandbox key
  can never write to production and a production key can never write to a sandbox — by
  construction, not by a check that could be missed. You cannot accidentally pollute
  production.

- **Sandbox keys are visibly distinct and can be rate-limited differently.** Keys
  generated for a sandbox are prefixed **`lat_sandbox_`**, so they're easy to spot in
  code, logs, and review. We also leave the door open to give sandbox keys their **own
  (lower) rate limit**: a developer who accidentally ships production code pointing at
  a sandbox key hits errors as soon as real traffic arrives — a loud, immediate signal
  to fix it, instead of silent misuse. Combined with a sandbox being deliberately
  poor for production use (no issues/alerts, short retention, sleeps when idle), this
  makes pointing production at a sandbox self-defeating and quickly noticed.

- **No LLM work runs on sandbox ingestion (by design).** The side-effects of span
  ingestion that cost real money — flagger classification and context extraction,
  evaluations, issue-clustering embeddings — **do not run** in a sandbox. Storing and
  viewing traces works fully; the LLM-driven layer is simply off. This is the core
  scoping decision for now, and it's a clean on/off boundary, built so those features
  can be switched on per-sandbox in the future without rework.

- **Billing is light by construction.** Because the expensive LLM-driven actions don't
  run, there's almost nothing to bill beyond trace ingestion itself. We add **no
  special billing path** — sandbox usage flows through the same meter as production —
  but in practice it's light because the costly actions never fire. The lightness
  comes from *not doing the work*, not from a billing carve-out.

- **Projects appear on demand.** A sandbox shows your full production project list up
  front, so you always know what you can send to. A sandbox project is actually
  created the first time you send traces to that name. You can also create
  **sandbox-only** projects that don't exist in production yet — for prototyping
  something new.

- **Sandbox and production projects are linked by stable identity, not by editable
  text.** A subtlety worth stating: a project's **slug is mutable, but only by a
  deliberate, explicit act** — it can be changed from the dashboard's danger zone, and
  nowhere else. Renaming a project never touches the slug, and the API can't change it
  at all; a slug only ever moves when a human knowingly changes it behind a danger-zone
  guard. So neither name nor slug is a durable key. A sandbox project is first
  associated with the production project of the same slug when traces create it, and
  the link is then pinned to the production project's **stable id**, so it survives
  both renames and deliberate slug changes. A project **rename or slug change** emits an
  event that re-syncs the sandbox project's displayed name/slug to match — cosmetic
  sugar; the underlying link never breaks. (If you reused a name for something
  unrelated, you can unlink it.)

- **Isolation reuses what we already have.** Sandbox data lives under its own
  projects, so it's already separated everywhere, with no risky migration of the trace
  store. The "environment" concept lives only in our control database.

- **Sandbox data never appears in Live.** Production and org-wide views — dashboards,
  analytics, billing rollups — exclude sandbox data entirely. A sandbox is invisible
  from Live; you only ever see it from inside that sandbox.

- **Sandbox count is limited per plan, and the limit is enforced.** Free orgs get
  **exactly one sandbox** — archived or active, there is never a second one; Pro orgs
  get **up to 15** (Enterprise higher). Enforced on the backend and clearly surfaced
  in the UI.

- **Sandboxes sleep after 7 days of inactivity.** With no new traces for 7 days a
  sandbox is archived (put to sleep); you can also archive one manually. Sending spans
  to a sleeping/archived sandbox **fails loudly** — the telemetry call returns a clear
  error telling the developer they're ingesting into an archived sandbox — so nothing
  is silently accepted and no sandbox is silently revived. You reactivate it to resume.
  (Span retention is separate and short — proposed **7 days** — and is a per-row value,
  so it can stay flat or vary by plan later with no structural change.)

- **A sandbox never sends external notifications.** Even once issue detection is
  enabled in the future, a sandbox must **never** reach an external channel — no
  email, Slack, webhook, SMS, or push. A developer's experiments must never page
  teammates or reach customers' alert channels. In-sandbox UI surfacing is fine; only
  outbound alerts are forbidden.

## Realtime (sandbox traces)

A sandbox should feel like watching traces stream into your terminal: you run your
agent and the UI updates as spans arrive, no refresh. This is what makes the sandbox
genuinely pleasant for local debugging.

- **Same experience as production.** The sandbox reuses the production traces UI
  as-is — the **Traces | Sessions** tabs, the same grouping, and the same
  server-computed aggregations (which differ per tab). Realtime only adds live updates
  on top; it never forks the UI or re-implements aggregation. v1 UI is that familiar
  traces/sessions view plus a small modal for sandbox settings.

- **Transport: SSE preferred, polling acceptable; WebSockets deferred.** Updates are
  one-directional (server → UI), so Server-Sent Events fit better and cost far less
  than a bidirectional WebSocket server. Plain polling (every 1–2s) is a fine v1
  fallback for a single-dev, low-volume sandbox. Reviving v1's dedicated WebSocket
  infra is a heavier, **company-level** decision — justified only if realtime is
  wanted beyond the sandbox — so it's out of scope here.

- **Bridging ingestion → UI.** Ingestion runs on the workers, not the web server, so
  we bridge them with **Redis Pub/Sub** (already in our stack): the worker publishes a
  small message to a sandbox-scoped channel (`org:${organizationId}:sandbox:…`)
  **after the span is persisted** (so any refetch is guaranteed to see it) and **only
  for sandboxes**. The web server subscribes and relays to that sandbox's SSE clients.

- **Push invalidation, not data.** The signal carries only ids —
  `{ sandboxId, traceId, sessionId }` — not trace content. The UI refetches the
  affected row from the **same production endpoints** and upserts it into the active
  view: the **trace** row on the Traces tab, the **session** row on the Sessions tab
  (sessionId follows the system's rule — the real `session_id`, else the trace's own
  id). This keeps both views and their differing aggregations exactly correct with
  **no client-side re-aggregation**, and any missed signal self-heals on the next
  routine refetch.

- **One signal, coalesced.** The canonical event is "trace upserted" (covers both new
  and growing traces); an optional raw-span "liveness" pulse can show activity before
  the row is meaningful. We coalesce per trace (~one update every few hundred ms) so a
  chatty trace feels live without flooding the UI.

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
