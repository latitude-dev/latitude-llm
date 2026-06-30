# Agent Dispatch

> **Documentation** — durable homes after stabilization: a new `dev-docs/agent-dispatch.md`, with cross-links from `dev-docs/notifications.md`, `dev-docs/slack-integration.md`, and `dev-docs/signals.md`. Related current docs: `dev-docs/notifications.md` (fan-out pipeline this mirrors), `dev-docs/slack-integration.md` (the integration pattern this clones), `dev-docs/signals.md` / `specs/signals.md` (the events this consumes), `dev-docs/mcp.md` (how the receiving agent reads Latitude back), `dev-docs/api.md`.

## Contents

1. [Purpose](#purpose)
2. [Scope and non-goals](#scope-and-non-goals)
3. [What is actually dispatchable today (ground truth)](#what-is-actually-dispatchable-today-ground-truth)
4. [Architecture](#architecture)
5. [Triggers and the dispatch decision](#triggers-and-the-dispatch-decision)
6. [Prompt assembly](#prompt-assembly)
7. [Adapters](#adapters)
8. [Data model](#data-model)
9. [Idempotency, guardrails, and failure policy](#idempotency-guardrails-and-failure-policy)
10. [Configuration and UI](#configuration-and-ui)
11. [Security and tenancy](#security-and-tenancy)
12. [Self-hosting](#self-hosting)
13. [Decisions](#decisions)
14. [Tasks](#tasks)

---

## Purpose

Close the production-reliability loop without a human in the middle:

```
Production traces
  → frustration / failure detection (flaggers)          [ships]
  → clustering into Signals                              [ships]
  → escalation → Incidents (source_type = "signal")     [ships]
  → AGENT DISPATCH: wake a hosted coding agent          [this spec]
  → agent investigates via Latitude MCP, opens a PR     [external platform]
```

Latitude already owns everything left of the dispatch step. This spec adds **one outbound side-effect**: when a signal or incident fires, Latitude wakes a coding agent on the customer's chosen platform and hands it a context-rich prompt. The receiving agent does the investigation and PR; Latitude is the **trigger + context provider**, not the agent runtime.

**The one-line model:** Agent Dispatch is a new outbound notification channel that, instead of emailing a human, fires an HTTP request that starts a coding-agent run.

---

## Scope and non-goals

**In scope**

- A new outbound channel ("agent dispatch") that fans out from the same domain events as notifications.
- Vendor adapters that translate a Latitude dispatch into a platform-specific "start an agent" call.
- Per-project configuration (target, repo, triggers, guardrails) and an encrypted credential store.
- A dispatch ledger (idempotency + audit) and a dispatch-history UI.
- Prompt assembly that reuses the incident notification snapshot.

**Non-goals**

- **Latitude does not provision MCP auth for the receiving agent.** The customer's cloud agent is assumed to already have the Latitude MCP connected (OAuth, done once out of band — see `dev-docs/mcp.md`). The dispatcher never mints, forwards, or embeds Latitude MCP credentials. Decision [D1](#decisions).
- Latitude does not run the agent loop, clone the repo, run tests, or open the PR — the platform does.
- Latitude does not own GitHub auth for the agent's repo access — that is configured on the platform.
- **No completion loop and no pre-run human approval.** Latitude does not poll the agent run, track the PR, or gate the dispatch behind an approval. The loop is unattended; the human review is the draft PR in GitHub. Decisions [D5](#decisions), [D7](#decisions).
- No new detection or clustering logic; this consumes existing signal/incident events unchanged.

---

## What is actually dispatchable today (ground truth)

This section is the load-bearing reality check. Each platform was verified against its current public surface (June 2026).

### Cursor — Cloud Agents API ✅ primary target

A first-class, documented REST API for exactly this use case (Cursor's own docs cite "Sentry error → agent", "Linear issue → agent").

- **Endpoint:** `POST https://api.cursor.com/v1/agents` (Cloud Agents API **v1**, public beta).
- **Auth:** Basic or Bearer with a Cursor API key; **service-account keys** exist specifically for non-human automation.
- **Create body (relevant fields):** `prompt.text` (required), `repos[]` (`url`, `startingRef`), `autoCreatePR`, `mode` (`plan` | `agent`), `env` (`{ type: "cloud", name? }` — named saved environment, or self-hosted `pool`/`machine`), `mcpServers[]`, `envVars`, `agentId` (client-supplied, **idempotent** — re-POST returns `409 agent_id_conflict`).
- **Response:** durable `agent` (`id`, `url`, `status`) + initial `run` (`id`, `status`). The `agent.url` is a human-clickable deep link.
- **Status:** poll `GET /v1/agents/{id}/runs/{runId}` or subscribe to SSE at `/v1/agents/{id}/runs/{runId}/stream`. Native delivery webhooks are "coming soon" on v1 (the legacy v0 surface had `statusChange` webhooks: `FINISHED` / `ERROR`).
- **Repo + GitHub:** the Cursor GitHub App must already be authorized on the target repo (one-time admin step), exactly as for UI-launched cloud agents.

**Verdict:** fully doable today, idempotent, with a clean prompt+repo contract and a deep link back. This is the reference adapter.

> The Cursor **Slack** `@cursor` trigger is **not** a programmatic path — API-posted Slack messages are deliberately ignored by the bot. Use the Cloud Agents API, not a Slack bridge.

### Claude Code — Routines `/fire` ✅ secondary target

- **Endpoint:** `POST https://api.anthropic.com/v1/claude_code/routines/{trigger_id}/fire` (the path id is prefixed `trig_`).
- **Headers:** `Authorization: Bearer sk-ant-oat01-…` (a **per-routine** token minted in the Claude Code web UI), `anthropic-beta: experimental-cc-routine-2026-04-01`, `anthropic-version: 2023-06-01`.
- **Body:** `{ "text": "…" }` — freeform run context only (max 65,536 chars). **Not parsed**: structured JSON arrives as a literal string, so the routine's saved prompt must tell the agent how to interpret it.
- **Pre-config (in the routine UI, once):** saved prompt, repo(s), and connectors (incl. Latitude MCP via OAuth). The `/fire` call carries only context, not repo/MCP/auth.
- **Plan/availability:** claude.ai Pro / Max / Team / Enterprise with Claude Code on the web. Endpoint is research-preview behind the dated beta header.

**Verdict:** doable today and the lowest-friction wake. Routines are the only Claude path this spec targets. (The Managed Agents API — `POST /v1/sessions` with Anthropic-hosted sandboxes — exists and is more configurable, but it is heavier and not needed for MVP; explicitly out of scope, see [D3](#decisions).)

### Linear — broker dispatch target ✅ MVP

Rather than integrate every coding-agent platform directly, Latitude can **create a Linear issue** carrying the signal context and let the customer's existing Linear automation route it to a coding agent. Several coding-agent platforms (Cursor and others) support delegating a Linear issue to their agent (assign/mention, or **triage rules** that auto-delegate matching issues with no human touch). One adapter, many downstream agents.

- **Mechanism:** Latitude's Linear integration creates an issue (title + body from the dispatch context, optional team/label/assignee) via the Linear API. The customer configures a Linear **triage rule** ("Delegate → <their agent>") so matching issues auto-start an agent.
- **Why it's attractive:** it is a vendor-neutral broker — one adapter reaches any agent that integrates with Linear, including platforms with no direct dispatch API — and it doubles as a human-visible audit trail in the customer's tracker.
- **Caveat:** the agent hand-off depends on the customer's Linear rules, so the wake is "issue created" on our side; what happens next lives in their workspace.

### Summary matrix

| Platform | Hosted dispatch via stable API? | Mechanism | MVP adapter |
| --- | --- | --- | --- |
| **Cursor** | ✅ Yes | `POST /v1/agents` (v1 public beta) | **Phase 2 (primary)** |
| **Claude Code** | ✅ Yes | Routines `/fire` | **Phase 3** |
| **Linear (broker)** | ✅ Yes | create issue → customer triage rule delegates to an agent | **Phase 4** |
| **Generic webhook** | ✅ Yes (customer owns the receiver) | signed HTTP POST | **Phase 1 (foundation)** |

Platforms without a stable public dispatch API are reached **indirectly** — via the Linear broker (triage-rule delegation) or a self-hosted runner behind the generic webhook adapter.

---

## Architecture

Agent Dispatch is a **new outbound channel** built exactly like the Slack channel (`dev-docs/slack-integration.md`): the existing domain-events worker fans out a new queue job in parallel with notification fan-out; a dedicated worker renders + delivers; a per-vendor adapter does the HTTP; a dedicated ledger gives idempotency and audit.

```
SignalCreated / IncidentCreated (outbox → domain-events worker)        [ships]
   ├──→ notifications:request-*-notifications      (email / in-app / Slack)  [ships]
   └──→ agent-dispatch:request                     (NEW, parallel fan-out)
            │  resolve project dispatch config; apply trigger + mute gates;
            │  rate-limit / cooldown check; build the prompt context snapshot
            ▼
        agent-dispatch:send  (one job per matched config)
            │  claim agent_dispatches ledger row (idempotency)
            │  render vendor payload via the adapter
            │  POST to the platform (Cursor / Claude / Linear / webhook)
            │  store external ids + deep link, mark dispatched
            ▼
        external platform spins up the agent → (its own infra) → PR
```

Key boundary: the `agent-dispatch:request` producer is where **all policy** lives (which trigger, mute, guardrails, prompt assembly). The `agent-dispatch:send` consumer is a thin claim → render → POST → record. This mirrors the notifications producer/consumer split.

**Package layout** (mirrors `@domain/integrations` + Slack):

- `@domain/agent-dispatch` — entities, ports, use-cases (`requestAgentDispatchUseCase`, `sendAgentDispatchUseCase`), prompt assembly, vendor-agnostic dispatch types, errors.
- `@domain/integrations` — extend the existing vendor-agnostic `integrations` parent with `kind = "cursor" | "claude_code" | "linear" | "webhook"` child detail tables (Slack already lives here).
- `@platform/agent-dispatch` (or per-vendor adapters under `@platform/*`) — the concrete HTTP adapters (`CursorAdapter`, `ClaudeRoutineAdapter`, `LinearAdapter`, `WebhookAdapter`) behind a single `AgentDispatchAdapter` port.
- `apps/workers` — new `agent-dispatch` worker (request + send steps), wired through the domain-events fan-out, same as `notification-slack:send`.

---

## Triggers and the dispatch decision

Dispatch reuses the events that already drive alerting:

| Trigger | Domain event | Payload available | Recommended use |
| --- | --- | --- | --- |
| **Incident opened (signal escalation)** | `IncidentCreated` where `sourceType = "signal"` | `organizationId`, `projectId`, `alertIncidentId`, `sourceType`, `sourceId` (= signalId) | **Default for auto-PR.** An escalation means "actively bad right now" — the highest-signal moment to wake an agent. |
| **New signal discovered** | `SignalCreated` | `organizationId`, `projectId`, `signalId`, `createdAt` | Opt-in. Higher volume + more false positives (every new auto-clustered pattern). Better for "investigate / triage", not auto-merge. |
| **Monitor incident** | `IncidentCreated` where `sourceType = "monitor"` | same shape, `sourceId` = monitorId | Opt-in. Known saved-search/tool/user/session watches firing. |

The `agent-dispatch:request` producer applies, in order:

1. **Config lookup** — is there an enabled dispatch config for `(organizationId, projectId)`? (else skip)
2. **Trigger gate** — does the config subscribe to this trigger kind? (else skip)
3. **Mute gate** — a muted signal (`signals.muted_at`) or muted monitor suppresses dispatch, mirroring notification mute. (else skip)
4. **Guardrail gate** — per-config `maxDispatchesPerDay` and `cooldownMinutes` (see [Idempotency, guardrails, failure policy](#idempotency-guardrails-and-failure-policy)). (else skip, logged)

Only after all gates pass does it snapshot the prompt context and enqueue `agent-dispatch:send`.

**No per-dispatch source filters in the MVP.** Dispatch is all-or-nothing per trigger; the way to stop dispatch for one noisy signal is to **mute that signal** (`signals.muted_at`) — the same control that already silences its notifications. This keeps one lever for "I don't care about this signal" instead of a parallel filter surface. (Granular filters — by signal `source`, `flaggerSlug`, severity, priority — are future work, not MVP.)

There is **no human approval step.** The whole point is an unattended `signal → fix-PR` loop; the human review gate is the **draft PR itself**, reviewed in GitHub like any other PR — not an approval before the agent starts. See [D5](#decisions).

---

## Prompt assembly

The dispatcher's real value-add is a context-rich prompt the agent can act on **without a first round-trip**. Latitude already computes a rich incident snapshot for emails/Slack (`dev-docs/notifications.md`): `sampleExcerpt` (latest annotation/eval feedback, capped 200 chars, with author attribution), `trend.points` (14d × 12h occurrence + threshold buckets), `tags` (top-5), `breach` (trigger/baseline/threshold rates). Reuse that exact snapshot source.

The producer assembles a **structured context object**, then renders it to text per adapter:

```ts
interface AgentDispatchContext {
  readonly trigger: "incident.opened" | "signal.discovered" | "monitor.incident"
  readonly organizationName: string
  readonly projectName: string
  readonly projectSlug: string
  readonly signal?: {
    readonly id: string
    readonly slug: string
    readonly name: string
    readonly source: "flagger" | "annotation" | "custom"
    readonly priority: string | null
  }
  readonly incident?: { readonly id: string; readonly severity: string }
  readonly metrics?: {
    readonly occurrences: number
    readonly windowHours: number
    readonly baselinePerHour: number | null
  }
  readonly sampleExcerpt?: string
  readonly tags?: readonly string[]
  readonly deepLinkUrl: string          // console deep link to the signal / incident
  readonly sampleTraceIds?: readonly string[]  // a few representative members for the agent to fetch via MCP
}
```

Rendered prompt (default template; user-overridable per config with `{{placeholders}}`):

```
A Latitude signal has escalated in project "{{projectName}}".

Signal: {{signal.name}} ({{signal.source}})   ID: {{signal.id}}
Incident: {{incident.id}}   Severity: {{incident.severity}}
Trend: {{metrics.occurrences}} occurrences in {{metrics.windowHours}}h (baseline ~{{metrics.baselinePerHour}}/h)
Sample feedback: "{{sampleExcerpt}}"
Tags: {{tags}}
Latitude: {{deepLinkUrl}}

Use your Latitude MCP tools (getSignal, listSignalTraces, getTrace) to inspect this
signal and a few of its member traces ({{sampleTraceIds}}). Identify the most likely
root cause in this repository, implement the smallest correct fix, add a regression
test if applicable, and open a PR describing the signal and the fix.

Do not mute or resolve the signal — a human verifies after deploy.
```

The prompt **names the signal/incident IDs and a deep link** so the agent knows what to pull via MCP. It assumes MCP auth already works ([D1](#decisions)); if a config has no MCP on the receiving side, the same snapshot still gives the agent enough to start from the repo alone.

---

## Adapters

One port, four implementations. The port is vendor-agnostic; the worker selects by `integration.kind`.

```ts
interface AgentDispatchAdapter {
  readonly kind: "cursor" | "claude_code" | "linear" | "webhook"
  // Returns external identifiers + a human deep link, or a tagged error.
  dispatch(input: {
    readonly idempotencyKey: string
    readonly prompt: string
    readonly context: AgentDispatchContext
    readonly config: ResolvedDispatchTarget   // repo, env name, routine id, linear team, webhook url, etc.
    readonly credential: DecryptedCredential   // vendor token (NOT Latitude MCP creds)
  }): Effect.Effect<DispatchResult, DispatchAdapterError, never>
}

interface DispatchResult {
  readonly externalAgentId?: string   // Cursor agent id / Claude session id / Linear issue id
  readonly externalRunId?: string
  readonly deepLinkUrl?: string        // cursor.com/agents/… , claude.ai/code/… , or the Linear issue url
  readonly status: "accepted"
}
```

### Cursor adapter

```
POST https://api.cursor.com/v1/agents
Authorization: Basic <cursorApiKey>:
Content-Type: application/json

{
  "agentId": "<idempotencyKey>",            // e.g. "cursor:incident:clinc456"
  "prompt": { "text": "<rendered prompt>" },
  "repos": [{ "url": "<config.repoUrl>", "startingRef": "<config.startingRef>" }],
  "autoCreatePR": true,
  "mode": "agent",                           // implement autonomously through to a PR
  "env": { "type": "cloud", "name": "<config.environmentName?>" }
}
```

- `agentId` = the ledger idempotency key → create-time dedup (`409` is treated as "already dispatched", not an error).
- **`mode: "agent"`, not `"plan"`.** The loop must run unattended to a PR; plan mode halts for human approval before implementing, which defeats the purpose ([D5](#decisions)). The human gate is the resulting PR, not a pre-implementation approval.
- **`autoCreatePR: true`** so the run ends in a reviewable PR. Latitude **never merges** it (no auto-merge); open as a **draft** where the platform supports it.
- **No `mcpServers` / Latitude credentials in the payload** — MCP is pre-provisioned on the named environment or repo workspace ([D1](#decisions)).
- Store `agent.id`, `run.id`, `agent.url` on the ledger row.

### Claude Code adapter (routines first)

```
POST https://api.anthropic.com/v1/claude_code/routines/<config.routineTriggerId>/fire
Authorization: Bearer <routineToken>
anthropic-beta: experimental-cc-routine-2026-04-01
anthropic-version: 2023-06-01
Content-Type: application/json

{ "text": "<rendered prompt>" }
```

- Repo + connectors (incl. Latitude MCP) are configured in the routine UI; the fire call carries context only.
- The routine's saved prompt should instruct the agent to implement and open a PR autonomously (the routine is the place this behavior is configured, since `/fire` carries only `text`).
- No native idempotency on `/fire` → Latitude-side ledger dedup is mandatory (claim before POST).
- Store the returned session id + url.

### Linear adapter (broker)

```
POST https://api.linear.app/graphql        // issueCreate mutation
Authorization: <linearApiKey or OAuth token>
Content-Type: application/json

{ "query": "mutation { issueCreate(input: { teamId, title, description, labelIds?, assigneeId? }) { issue { id url identifier } } }" }
```

- Creates a Linear issue from the dispatch context (`title` = signal name + trigger; `description` = the rendered prompt + deep link + sample trace ids). The customer's Linear **triage rule** (Delegate → their agent) auto-starts the downstream agent — Latitude does not call the agent platform itself.
- Idempotency: ledger claim before the mutation; optionally set a deterministic external attribute / title marker so a manual re-run is recognizable.
- A vendor-neutral broker reaching any Linear-integrated agent (including platforms with no direct dispatch API). Store the issue `id` + `url`.

### Webhook adapter (foundation + universal fallback)

```
POST <config.webhookUrl>
Content-Type: application/json
X-Latitude-Signature: sha256=<hmac(secret, body)>
X-Latitude-Delivery: <idempotencyKey>

{ "trigger": "...", "context": { ...AgentDispatchContext }, "prompt": "<rendered prompt>" }
```

- HMAC-signed (per-config secret), idempotency key in header, retry with backoff.
- This is what a **self-hosted runner** consumes (their handler runs a CLI agent in their own infra), and the escape hatch for any platform without a first-class adapter.

---

## Data model

Extend the existing vendor-agnostic integrations parent (Slack already uses it — `dev-docs/slack-integration.md`), and add a dispatch ledger. Per the platform no-FK rule, relationships are application-enforced.

```
latitude.integrations                       (parent — EXISTS; add new kinds)
  id, organization_id, kind ∈ {slack, cursor, claude_code, linear, webhook},
  vendor_account_id, installed_by_user_id, installed_at, revoked_at, …
  partial-unique (kind, vendor_account_id) WHERE revoked_at IS NULL   (where meaningful)

latitude.agent_dispatch_configs             (NEW — per project per target)
  id, organization_id, project_id, integration_id,
  enabled boolean,
  triggers jsonb,                -- ["incident.opened", ...]
  target jsonb,                  -- vendor-specific resolved target (repoUrl, startingRef,
                                 --   environmentName?, routineTriggerId?, linearTeamId?, webhookUrl?, autoCreatePR)
  prompt_template text,          -- nullable → default template
  guardrails jsonb,              -- { maxDispatchesPerDay, cooldownMinutes }
  created_at, updated_at

latitude.agent_dispatch_credentials         (NEW — encrypted vendor tokens)
  integration_id (PK), organization_id (denorm for RLS),
  cursor_api_key (encrypted, nullable),
  claude_routine_token (encrypted, nullable),
  linear_api_key (encrypted, nullable),
  webhook_secret (encrypted, nullable)
  -- AES-256-GCM with LAT_MASTER_ENCRYPTION_KEY, same scheme as api-keys + slack tokens

latitude.agent_dispatches                   (NEW — idempotency + audit ledger)
  id, organization_id, project_id, config_id,
  idempotency_key,               -- "<vendor>:<trigger>:<sourceId>", e.g. "cursor:incident:clinc456"
  trigger, source_type, source_id,
  claimed_at, dispatched_at,
  external_agent_id, external_run_id, external_url,
  status,                        -- claimed | dispatched | failed
  error_category, error_detail   -- on failure
  UNIQUE (organization_id, idempotency_key)
```

RLS on all new tables follows the org-scoped pattern (`api_keys` / `slack_*` are the templates). Credentials are encrypted at the repository layer; nothing above sees ciphertext.

---

## Idempotency, guardrails, and failure policy

**Idempotency** (two layers, both required):

1. **Ledger claim** — `INSERT … ON CONFLICT (organization_id, idempotency_key) DO NOTHING RETURNING`. A losing claim short-circuits (the dispatch already happened or is in flight). Mirrors `slack_deliveries`.
2. **Vendor-native** where available — Cursor `agentId` = the same key; a `409 agent_id_conflict` is success, not error. Claude `/fire` and webhooks have no native dedup, so the ledger claim is the only guard there.

Idempotency key = `"<vendor>:<trigger>:<sourceId>"`. One escalation of one signal → at most one agent, even under outbox/queue at-least-once redelivery.

**Guardrails** (per config, enforced in the producer before claiming):

- `maxDispatchesPerDay` — count `agent_dispatches` in the trailing 24h for this config; over cap → skip + log + optional `dispatch.capped` notification.
- `cooldownMinutes` — suppress a second dispatch for the **same source** within the window (an incident that reopens quickly shouldn't spawn a second agent).
- **The PR is the human gate, not a pre-run approval.** Agents run autonomously (`mode: "agent"`) straight to a PR; that PR is opened as a **draft** where supported and is **never auto-merged**. The risk surface is "an unwanted draft PR appears", which is cheap to close — far cheaper than wiring a human approval into every dispatch ([D5](#decisions)).

**Failure policy** (the `agent-dispatch:send` worker, error categories mirror data-destinations):

| Error | Category | Action |
| --- | --- | --- |
| 401/403 from platform | `auth` | Ack (no retry). Surface "reconnect" in settings. |
| 409 idempotency conflict (Cursor) | — | Treat as success; record external ids if returned. |
| 429 | `rate_limited` | Propagate; BullMQ honours `Retry-After`. Does not count toward quarantine. |
| 5xx / network | `transport` | Propagate; BullMQ retries with backoff. |
| 4xx config (bad repo, missing env) | `config` | Ack; mark `failed`; surface actionable error in UI. |

Claim-then-act ordering (stamp `claimed_at` before POST) means a crash mid-POST can drop a dispatch rather than double-fire — same trade-off as Slack ("a missed wake is safer than a duplicate agent + duplicate PR").

---

## Configuration and UI

**Settings → Integrations** (next to Slack):

1. **Connect a target**: pick Cursor / Claude Code / Linear / Webhook; store the vendor credential (encrypted). Cursor: API key + GitHub-app-authorized repo. Claude: routine trigger id + token. Linear: API key/OAuth + team. Webhook: URL + generated secret.
2. **Per-project dispatch config**: enable, choose triggers, repo/env (or Linear team) mapping, prompt template override, guardrails. (To silence one noisy signal, mute the signal — there are no per-dispatch source filters in the MVP.)
3. **MCP checklist (informational, non-enforcing)**: "Latitude MCP connected on this Cursor environment / Claude routine?" — a reminder, since MCP provisioning is the customer's responsibility ([D1](#decisions)). The dispatcher does not verify it.
4. **Dispatch history (MVP)**: the `agent_dispatches` ledger rendered as an audit log — trigger, signal/incident, time, status, and a deep link ("View in Cursor" / "View in Claude" / "View Linear issue"). This ships in the MVP, not later.

A feature flag (`AGENT_DISPATCH_FLAG = "agent-dispatch"`, off by default, per-org) gates the producer fan-out and the settings page, exactly like `SLACK_FLAG`.

---

## Security and tenancy

- All keys/configs are **organization-scoped** with RLS, like `api_keys` and Slack.
- Vendor tokens are AES-256-GCM encrypted with `LAT_MASTER_ENCRYPTION_KEY`.
- Webhook payloads are HMAC-signed; receivers verify before acting.
- **Latitude MCP credentials are never handled by the dispatcher** ([D1](#decisions)) — the single most important security simplification. The blast radius of a dispatch credential leak is "can start agent runs on the customer's platform account", not "can read Latitude data".
- Dispatch respects signal/monitor mute and project-level enablement; a muted signal never wakes an agent.
- Prompts may contain trace excerpts (`sampleExcerpt`) — same data already emailed; honour the same redaction expectations and the 200-char cap.

---

## Self-hosting

- Cursor and Claude Code cloud agents are SaaS; a self-hoster who won't use them uses the **webhook adapter** to a runner in their own infra (`claude -p --bare` or a custom harness), or the **Linear adapter** if their tracker brokers an agent.
- Keep the adapter set permissively licensed and the integration **bring-your-own**: no bundled dependency on any single vendor; the webhook path is always available. Consistent with the OSS/self-host policy in `AGENTS.md`.
- All new infra is namespaced (Postgres tables under `latitude.`, queue topics under the existing registry, Redis keys org-prefixed).

---

## Decisions

- **D1 — The dispatcher does not provision MCP auth for the receiving agent.** The customer's cloud agent is assumed to already have the Latitude MCP connected (OAuth, once, out of band). Latitude never mints, forwards, or embeds MCP credentials at dispatch time. Rationale: MCP is OAuth-first and consent-minted (`dev-docs/mcp.md` — OAuth keys are creatable only via the consent UX, never via API), so unattended minting doesn't exist; pushing MCP provisioning to platform setup keeps the dispatcher to a single outbound call and shrinks the credential blast radius. The rich prompt + deep link + sample trace ids make the agent productive even when MCP is absent.
- **D2 — Adapters: Cursor (primary), Claude routines, Linear broker, webhook (foundation).** Driven by which platforms expose a stable hosted-dispatch API ([ground truth](#what-is-actually-dispatchable-today-ground-truth)). All four ship in the MVP.
- **D3 — Platforms without a stable public dispatch API get no dedicated adapter.** They are reached indirectly via the **Linear broker** (triage-rule delegation) or the **webhook** adapter (self-hosted runner). The Claude Managed Agents path is likewise out of scope; routines are the only Claude path.
- **D4 — Reuse the notification fan-out and the Slack integration pattern wholesale.** Same domain events, same producer/consumer split, same encrypted-credential + idempotency-ledger shapes. Agent dispatch is "a channel that wakes an agent instead of notifying a human".
- **D5 — Fully unattended `signal → draft PR`; no human approval before the agent runs, and `mode: "agent"` (never `"plan"`).** The goal is a hands-off loop, so a pre-run approval gate is explicitly not built. Plan mode is wrong here because it stops to ask a human before implementing — the opposite of the intent. Safety comes from the **draft PR** (reviewed/merged by a human in GitHub, never auto-merged), **signal mute** (the per-signal off switch — no separate dispatch filters in the MVP), and **guardrails** (`maxDispatchesPerDay`, `cooldownMinutes`). `incident.opened` (signal escalation) is the default trigger as the highest-signal moment. The residual risk is an unwanted draft PR, which is cheap to discard.
- **D6 — Idempotency is mandatory and keyed `<vendor>:<trigger>:<sourceId>`.** One escalation → at most one agent. Cursor `agentId` reinforces it natively.
- **D7 — No completion loop.** Latitude does not poll or verify the agent's run or the resulting PR. The dispatch ends at "agent started / issue created"; the real closure of the loop is the customer **merging the PR** in GitHub, which Latitude does not track. Single repo per config for MVP (multi-repo selection is future work).

---

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 — Foundation: fan-out, ledger, webhook adapter

- [ ] **P1-1**: `@domain/agent-dispatch` package — entities, `AgentDispatchContext`, ports (`AgentDispatchAdapter`, repositories), errors (`Data.TaggedError` per `dev-docs/effect-and-errors`).
- [ ] **P1-2**: PG migration — `agent_dispatch_configs`, `agent_dispatch_credentials`, `agent_dispatches`; extend `integrations.kind` enum; RLS policies (api-keys/slack template); no FKs.
- [ ] **P1-3**: Domain-events fan-out — publish `agent-dispatch:request` from `SignalCreated` and `IncidentCreated`, parallel to notifications, dedupe-keyed; behind `AGENT_DISPATCH_FLAG`.
- [ ] **P1-4**: `requestAgentDispatchUseCase` (producer) — config lookup, trigger/mute/guardrail gates, prompt-context snapshot (reuse the incident-notification snapshot source), enqueue `agent-dispatch:send`.
- [ ] **P1-5**: `sendAgentDispatchUseCase` (consumer) — ledger claim, adapter dispatch, record external ids/url, failure-category mapping.
- [ ] **P1-6**: Webhook adapter — HMAC signing, idempotency header, retry/backoff. Encrypted `webhook_secret`.
- [ ] **P1-7**: `apps/workers` wiring — new `agent-dispatch` worker (request + send), topic registry entries, layer composition.
- [ ] **P1-8**: **Dispatch history UI (MVP)** — Settings → Integrations audit log over the `agent_dispatches` ledger: trigger, signal/incident, time, status, and the adapter deep link. Ships with the foundation; adapters add their own deep-link labels.
- [ ] **P1-9**: Tests — producer gate matrix (trigger/mute/guardrail), ledger idempotency under redelivery, webhook signing + retry (PGlite testkit; no `vi.mock` for repos per `dev-docs`/testing skill).

**Exit gate**: a signal escalation in a flagged org fires a single signed webhook with the rendered prompt + context; redelivery does not double-fire; mute and guardrails suppress correctly; the dispatch shows up in the history UI.

### Phase 2 — Cursor adapter (primary)

- [ ] **P2-1**: `CursorAdapter` — `POST /v1/agents` with `agentId` idempotency, `repos`, `autoCreatePR: true`, `mode: "agent"`, `env.name`; map `409` to success; store `agent.id`/`run.id`/`agent.url`. **No MCP creds in payload.**
- [ ] **P2-2**: Credential storage — encrypted `cursor_api_key`; connect/disconnect flow.
- [ ] **P2-3**: Config — repo url + starting ref + optional environment name; `mode: "agent"` and draft-`autoCreatePR` defaults (no plan mode).
- [ ] **P2-4**: Tests — payload shape, idempotency conflict handling, auth/transport/config error categories (adapter HTTP mocked at the boundary, not the repos).

**Exit gate**: an escalation starts a Cursor cloud agent in `agent` mode (idempotently) that runs to a draft PR; the ledger holds the clickable `agent.url`; re-firing the same incident does not create a second agent.

### Phase 3 — Claude Code adapter (routines)

- [ ] **P3-1**: `ClaudeRoutineAdapter` — `POST /v1/claude_code/routines/{trig}/fire` with beta + version headers; ledger-claim dedup (no native idempotency); store session id/url.
- [ ] **P3-2**: Credential + config — encrypted routine token + routine trigger id; connect flow; MCP-checklist reminder copy.
- [ ] **P3-3**: Tests — fire payload (freeform `text`), header correctness, claim-before-POST dedup.

**Exit gate**: an escalation fires a Claude routine exactly once per source; the ledger holds the session deep link.

### Phase 4 — Linear adapter (broker)

- [ ] **P4-1**: `LinearAdapter` — `issueCreate` GraphQL mutation from the dispatch context (title + description + optional team/label/assignee); store issue `id` + `url`. Ledger-claim dedup before the mutation.
- [ ] **P4-2**: Credential + config — encrypted `linear_api_key`/OAuth + team selection; connect flow; copy explaining the customer must set a Linear triage rule (Delegate → their agent) for the downstream agent to start.
- [ ] **P4-3**: Tests — mutation shape, dedup, auth/config error categories.

**Exit gate**: an escalation creates exactly one Linear issue carrying the context + deep link; the ledger holds the issue url. (Downstream agent start is the customer's triage rule — out of Latitude's scope, per [D7](#decisions).)

### Docs

- [ ] **DOC-1**: Author `dev-docs/agent-dispatch.md` (architecture, adapters, data model, idempotency) once Phase 1–2 stabilize; cross-link from `dev-docs/notifications.md`, `dev-docs/slack-integration.md`, `dev-docs/signals.md`.
- [ ] **DOC-2**: Public docs under `docs/` — "Wake a coding agent on a signal" (Cursor + Claude + Linear setup, webhook for self-host), and the MCP pre-provisioning prerequisite.
- [ ] **DOC-3**: Update the skill glossary / `AGENTS.md` only if a new repo-wide rule emerges (e.g. "dispatcher must never handle MCP creds").
