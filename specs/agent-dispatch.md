# Agent Dispatch

> **Documentation** — durable homes after stabilization: a new `dev-docs/agent-dispatch.md`, with cross-links from `dev-docs/notifications.md`, `dev-docs/slack-integration.md`, and `dev-docs/signals.md`. Related current docs: `dev-docs/notifications.md` (fan-out pipeline this mirrors), `dev-docs/slack-integration.md` (the integration pattern this clones), `dev-docs/signals.md` / `specs/signals.md` (the events this consumes), `dev-docs/mcp.md` (how the receiving agent reads Latitude back), `dev-docs/api.md`.
>
> **Origin** — Customer ask: "make a LangSmith-style engine out of Latitude — pick up user frustration, create signals, and wake a coding agent when a new issue appears to investigate and open a PR." Webhooks are the obvious primitive; this spec goes one step further and **dispatches work directly to hosted coding-agent platforms** (Cursor, Claude Code), with a generic webhook as the universal fallback.

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
14. [Open questions](#open-questions)
15. [Tasks](#tasks)

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
- Per-project configuration (target, repo, triggers, filters, guardrails) and an encrypted credential store.
- A dispatch ledger (idempotency + audit + status).
- Prompt assembly that reuses the incident notification snapshot.

**Non-goals**

- **Latitude does not provision MCP auth for the receiving agent.** The customer's cloud agent is assumed to already have the Latitude MCP connected (OAuth, done once out of band — see `dev-docs/mcp.md`). The dispatcher never mints, forwards, or embeds Latitude MCP credentials. Decision [D1](#decisions).
- Latitude does not run the agent loop, clone the repo, run tests, or open the PR — the platform does.
- Latitude does not own GitHub auth for the agent's repo access — that is configured on the platform.
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

### Claude Code — two viable hosted paths ✅ secondary target

1. **Routines `/fire`** (recommended for the simple case)
   - **Endpoint:** `POST https://api.anthropic.com/v1/claude_code/routines/{trigger_id}/fire` (the path id is prefixed `trig_`).
   - **Headers:** `Authorization: Bearer sk-ant-oat01-…` (a **per-routine** token minted in the Claude Code web UI), `anthropic-beta: experimental-cc-routine-2026-04-01`, `anthropic-version: 2023-06-01`.
   - **Body:** `{ "text": "…" }` — freeform run context only (max 65,536 chars). **Not parsed**: structured JSON arrives as a literal string, so the routine's saved prompt must tell the agent how to interpret it.
   - **Pre-config (in the routine UI, once):** saved prompt, repo(s), and connectors (incl. Latitude MCP via OAuth). The `/fire` call carries only context, not repo/MCP/auth.
   - **Plan/availability:** claude.ai Pro / Max / Team / Enterprise with Claude Code on the web. Endpoint is research-preview behind the dated beta header.

2. **Managed Agents API** (more control, more setup)
   - Define an **agent** (system prompt, tools, MCP servers) and an **environment**, then `POST /v1/sessions` and drive it with user events. Beta header `managed-agents-2026-04-01`, `x-api-key` auth. MCP credentials handled via Anthropic **vaults**. Anthropic-hosted sandbox per session.

**Verdict:** doable today. Routines are the lowest-friction wake; Managed Agents is the heavier, more configurable option. Adapter targets routines first.

### Codex — no stable cloud-dispatch API ⚠️ deferred

Codex Cloud has the weakest programmatic story for *external* dispatch:

- **No documented public REST API** to start a Codex Cloud task. The endpoint the `codex cloud` CLI uses (`POST https://chatgpt.com/backend-api/.../tasks` with a `new_task` body of `{ environment_id, branch }` + `input_items`) is an **internal, ChatGPT-account-authenticated** surface reverse-engineered from the open-source `codex-rs` client. It is not a stable contract and is unsuitable to depend on from a server integration.
- **Slack / Linear integrations** trigger Codex Cloud tasks, but only via human `@Codex` mention — the same non-programmatic limitation as Cursor's Slack. The one automation hook is **Linear triage rules** (auto-delegate matching issues to Codex), which is Linear-brokered, not a direct API.
- **`codex exec` / Codex SDK / `openai/codex-action`** run Codex in **your** process / CI runner, **not** in Codex Cloud. Viable as a *self-hosted runner*, but that is a different shape from "wake a hosted cloud agent".

**Verdict for this spec:** Codex is **not** a first-class cloud-dispatch target today. Two fallbacks are offered as a deferred adapter ([Phase 4](#tasks)):
- **Self-hosted Codex runner**: dispatch hits a customer-run webhook that executes `codex exec`/SDK in their infra (covered by the generic webhook adapter — Codex-specific code is just their handler).
- **Linear broker** (post-MVP, optional): Latitude creates a Linear issue; a customer triage rule delegates it to Codex. Latitude already integrates with Linear via MCP for internal workflows; a customer-facing "create issue" broker is out of MVP scope.

We will **not** build an adapter against the unofficial `chatgpt.com/backend-api`.

### Summary matrix

| Platform | Hosted cloud dispatch via stable API? | Mechanism | MVP adapter |
| --- | --- | --- | --- |
| **Cursor** | ✅ Yes | `POST /v1/agents` (v1 public beta) | **Phase 2 (primary)** |
| **Claude Code** | ✅ Yes | Routines `/fire`; Managed Agents `/v1/sessions` | **Phase 3 (routines first)** |
| **Generic webhook** | ✅ Yes (customer owns the receiver) | signed HTTP POST | **Phase 1 (foundation)** |
| **Codex Cloud** | ❌ No stable API | unofficial backend-api / Slack-Linear mention only | **Phase 4 (deferred: self-host runner / Linear broker)** |

---

## Architecture

Agent Dispatch is a **new outbound channel** built exactly like the Slack channel (`dev-docs/slack-integration.md`): the existing domain-events worker fans out a new queue job in parallel with notification fan-out; a dedicated worker renders + delivers; a per-vendor adapter does the HTTP; a dedicated ledger gives idempotency and audit.

```
SignalCreated / IncidentCreated (outbox → domain-events worker)        [ships]
   ├──→ notifications:request-*-notifications      (email / in-app / Slack)  [ships]
   └──→ agent-dispatch:request                     (NEW, parallel fan-out)
            │  resolve project dispatch config; apply trigger + filter + mute gates;
            │  rate-limit / cooldown check; build the prompt context snapshot
            ▼
        agent-dispatch:send  (one job per matched config)
            │  claim agent_dispatches ledger row (idempotency)
            │  render vendor payload via the adapter
            │  POST to the platform (Cursor / Claude / webhook)
            │  store external ids + deep link, mark dispatched
            ▼
        external platform spins up the agent → (its own infra) → PR
```

Key boundary: the `agent-dispatch:request` producer is where **all policy** lives (which trigger, which filters, mute, guardrails, prompt assembly). The `agent-dispatch:send` consumer is a thin claim → render → POST → record. This mirrors the notifications producer/consumer split.

**Package layout** (mirrors `@domain/integrations` + Slack):

- `@domain/agent-dispatch` — entities, ports, use-cases (`requestAgentDispatchUseCase`, `sendAgentDispatchUseCase`), prompt assembly, vendor-agnostic dispatch types, errors.
- `@domain/integrations` — extend the existing vendor-agnostic `integrations` parent with `kind = "cursor" | "claude_code" | "webhook"` child detail tables (Slack already lives here).
- `@platform/agent-dispatch` (or per-vendor adapters under `@platform/*`) — the concrete HTTP adapters (`CursorAdapter`, `ClaudeRoutineAdapter`, `WebhookAdapter`) behind a single `AgentDispatchAdapter` port.
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
3. **Source filter** — optional narrowing: signal `source` (`flagger` | `annotation` | `custom`), specific `flaggerSlug`s (e.g. only `frustration`), `minSeverity`, signal priority. (else skip)
4. **Mute gate** — a muted signal (`signals.muted_at`) or muted monitor suppresses dispatch, mirroring notification mute. (else skip)
5. **Guardrail gate** — per-config `maxDispatchesPerDay` and `cooldownMinutes` (see [Idempotency, guardrails, failure policy](#idempotency-guardrails-and-failure-policy)). (else skip, logged)
6. **Approval gate (optional, post-MVP)** — if `requireHumanApproval`, enqueue an approvable notification instead of dispatching directly.

Only after all gates pass does it snapshot the prompt context and enqueue `agent-dispatch:send`.

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

One port, three implementations. The port is vendor-agnostic; the worker selects by `integration.kind`.

```ts
interface AgentDispatchAdapter {
  readonly kind: "cursor" | "claude_code" | "webhook"
  // Returns external identifiers + a human deep link, or a tagged error.
  dispatch(input: {
    readonly idempotencyKey: string
    readonly prompt: string
    readonly context: AgentDispatchContext
    readonly config: ResolvedDispatchTarget   // repo, env name, routine id, webhook url, etc.
    readonly credential: DecryptedCredential   // vendor token (NOT Latitude MCP creds)
  }): Effect.Effect<DispatchResult, DispatchAdapterError, never>
}

interface DispatchResult {
  readonly externalAgentId?: string   // Cursor agent id / Claude session id
  readonly externalRunId?: string
  readonly deepLinkUrl?: string        // cursor.com/agents/… or claude.ai/code/…
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
  "autoCreatePR": <config.autoCreatePR>,
  "mode": "<config.mode>",                   // "plan" (default, safer) | "agent"
  "env": { "type": "cloud", "name": "<config.environmentName?>" }
}
```

- `agentId` = the ledger idempotency key → create-time dedup (`409` is treated as "already dispatched", not an error).
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
- No native idempotency on `/fire` → Latitude-side ledger dedup is mandatory (claim before POST).
- Store the returned session id + url. Managed Agents (`/v1/sessions`) is a later variant of the same adapter.

### Webhook adapter (foundation + universal fallback)

```
POST <config.webhookUrl>
Content-Type: application/json
X-Latitude-Signature: sha256=<hmac(secret, body)>
X-Latitude-Delivery: <idempotencyKey>

{ "trigger": "...", "context": { ...AgentDispatchContext }, "prompt": "<rendered prompt>" }
```

- HMAC-signed (per-config secret), idempotency key in header, retry with backoff.
- This is what a **self-hosted Codex runner** consumes (their handler runs `codex exec`), and the escape hatch for any platform without a first-class adapter.

---

## Data model

Extend the existing vendor-agnostic integrations parent (Slack already uses it — `dev-docs/slack-integration.md`), and add a dispatch ledger. Per the platform no-FK rule, relationships are application-enforced.

```
latitude.integrations                       (parent — EXISTS; add new kinds)
  id, organization_id, kind ∈ {slack, cursor, claude_code, webhook},
  vendor_account_id, installed_by_user_id, installed_at, revoked_at, …
  partial-unique (kind, vendor_account_id) WHERE revoked_at IS NULL   (where meaningful)

latitude.agent_dispatch_configs             (NEW — per project per target)
  id, organization_id, project_id, integration_id,
  enabled boolean,
  triggers jsonb,                -- ["incident.opened", ...]
  filters jsonb,                 -- { signalSources?, flaggerSlugs?, minSeverity?, priorities? }
  target jsonb,                  -- vendor-specific resolved target (repoUrl, startingRef,
                                 --   environmentName?, routineTriggerId?, webhookUrl?, mode, autoCreatePR)
  prompt_template text,          -- nullable → default template
  guardrails jsonb,              -- { maxDispatchesPerDay, cooldownMinutes, requireHumanApproval? }
  created_at, updated_at

latitude.agent_dispatch_credentials         (NEW — encrypted vendor tokens)
  integration_id (PK), organization_id (denorm for RLS),
  cursor_api_key (encrypted, nullable),
  claude_routine_token (encrypted, nullable),
  webhook_secret (encrypted, nullable)
  -- AES-256-GCM with LAT_MASTER_ENCRYPTION_KEY, same scheme as api-keys + slack tokens

latitude.agent_dispatches                   (NEW — idempotency + audit + status ledger)
  id, organization_id, project_id, config_id,
  idempotency_key,               -- "<vendor>:<trigger>:<sourceId>", e.g. "cursor:incident:clinc456"
  trigger, source_type, source_id,
  claimed_at, dispatched_at,
  external_agent_id, external_run_id, external_url,
  status,                        -- claimed | dispatched | failed | (later) running | completed
  pr_url,                        -- backfilled when completion is observed (Phase 5)
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
- `mode: "plan"` default for Cursor and a "do not mute/resolve" prompt clause — agents propose, humans dispose. Auto-PR is allowed but defaults to **draft** PRs.

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

1. **Connect a target**: pick Cursor / Claude Code / Webhook; store the vendor credential (encrypted). Cursor: API key + GitHub-app-authorized repo. Claude: routine trigger id + token. Webhook: URL + generated secret.
2. **Per-project dispatch config**: enable, choose triggers, optional filters (signal source, flagger slugs, min severity), repo/env mapping, prompt template override, guardrails.
3. **MCP checklist (informational, non-enforcing)**: "Latitude MCP connected on this Cursor environment / Claude routine?" — a reminder, since MCP provisioning is the customer's responsibility ([D1](#decisions)). The dispatcher does not verify it.
4. **Dispatch history**: the `agent_dispatches` ledger rendered as an audit log — trigger, signal/incident, time, status, and a deep link ("View in Cursor" / "View in Claude"), later the PR link.

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

- Cursor and Claude Code cloud agents are SaaS; a self-hoster who won't use them uses the **webhook adapter** to a runner in their own infra (`claude -p --bare`, `codex exec`, or a custom harness).
- Keep the adapter set permissively licensed and the integration **bring-your-own**: no bundled dependency on any single vendor; the webhook path is always available. Consistent with the OSS/self-host policy in `AGENTS.md`.
- All new infra is namespaced (Postgres tables under `latitude.`, queue topics under the existing registry, Redis keys org-prefixed).

---

## Decisions

- **D1 — The dispatcher does not provision MCP auth for the receiving agent.** The customer's cloud agent is assumed to already have the Latitude MCP connected (OAuth, once, out of band). Latitude never mints, forwards, or embeds MCP credentials at dispatch time. Rationale: MCP is OAuth-first and consent-minted (`dev-docs/mcp.md` — OAuth keys are creatable only via the consent UX, never via API), so unattended minting doesn't exist; pushing MCP provisioning to platform setup keeps the dispatcher to a single outbound call and shrinks the credential blast radius. The rich prompt + deep link + sample trace ids make the agent productive even when MCP is absent.
- **D2 — Cursor is the primary adapter, Claude routines the secondary, webhook the foundation.** Driven by which platforms expose a stable hosted-dispatch API ([ground truth](#what-is-actually-dispatchable-today-ground-truth)).
- **D3 — Codex Cloud is not a first-class target.** No stable public dispatch API; only the unofficial ChatGPT backend-api (rejected) or human `@Codex` mentions. Codex is supported indirectly via the webhook adapter (self-hosted `codex exec`) and, post-MVP, an optional Linear broker.
- **D4 — Reuse the notification fan-out and the Slack integration pattern wholesale.** Same domain events, same producer/consumer split, same encrypted-credential + idempotency-ledger shapes. Agent dispatch is "a channel that wakes an agent instead of notifying a human".
- **D5 — `incident.opened` (signal source) is the default trigger; `mode: "plan"` + draft PRs are the safe defaults.** Escalation is the highest-signal moment; agents propose, humans dispose.
- **D6 — Idempotency is mandatory and keyed `<vendor>:<trigger>:<sourceId>`.** One escalation → at most one agent. Cursor `agentId` reinforces it natively.

---

## Open questions

- **Completion loop**: MVP records the deep link and leaves verification to humans. Phase 5 adds status backfill — Cursor poll/SSE/(future webhook); Claude session status. Is poll-on-a-schedule acceptable, or wait for Cursor's v1 webhooks before building it?
- **Approval gate**: should `requireHumanApproval` ship in MVP (Slack-button "send agent?") or post-MVP? Leaning post-MVP; `mode: "plan"` + draft PR covers most of the risk.
- **Claude Managed Agents vs Routines**: routines are simpler but research-preview and claude.ai-account-bound; Managed Agents is API-key-based and more durable. Ship routines first, add Managed Agents if customers need org-API-key auth?
- **Linear broker for Codex**: worth building as a generic "create issue in tracker" dispatch target (also useful beyond Codex), or leave to the customer's own webhook handler?
- **Multiple repos per project**: a signal may span services. MVP is one repo per config; multi-repo selection (let the agent/heuristics pick) is post-MVP.

---

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 — Foundation: fan-out, ledger, webhook adapter

- [ ] **P1-1**: `@domain/agent-dispatch` package — entities, `AgentDispatchContext`, ports (`AgentDispatchAdapter`, repositories), errors (`Data.TaggedError` per `dev-docs/effect-and-errors`).
- [ ] **P1-2**: PG migration — `agent_dispatch_configs`, `agent_dispatch_credentials`, `agent_dispatches`; extend `integrations.kind` enum; RLS policies (api-keys/slack template); no FKs.
- [ ] **P1-3**: Domain-events fan-out — publish `agent-dispatch:request` from `SignalCreated` and `IncidentCreated`, parallel to notifications, dedupe-keyed; behind `AGENT_DISPATCH_FLAG`.
- [ ] **P1-4**: `requestAgentDispatchUseCase` (producer) — config lookup, trigger/source/mute/guardrail gates, prompt-context snapshot (reuse the incident-notification snapshot source), enqueue `agent-dispatch:send`.
- [ ] **P1-5**: `sendAgentDispatchUseCase` (consumer) — ledger claim, adapter dispatch, record external ids/url, failure-category mapping.
- [ ] **P1-6**: Webhook adapter — HMAC signing, idempotency header, retry/backoff. Encrypted `webhook_secret`.
- [ ] **P1-7**: `apps/workers` wiring — new `agent-dispatch` worker (request + send), topic registry entries, layer composition.
- [ ] **P1-8**: Tests — producer gate matrix (trigger/filter/mute/guardrail), ledger idempotency under redelivery, webhook signing + retry (PGlite testkit; no `vi.mock` for repos per `dev-docs`/testing skill).

**Exit gate**: a signal escalation in a flagged org fires a single signed webhook with the rendered prompt + context; redelivery does not double-fire; mute and guardrails suppress correctly.

### Phase 2 — Cursor adapter (primary)

- [ ] **P2-1**: `CursorAdapter` — `POST /v1/agents` with `agentId` idempotency, `repos`, `autoCreatePR`, `mode`, `env.name`; map `409` to success; store `agent.id`/`run.id`/`agent.url`. **No MCP creds in payload.**
- [ ] **P2-2**: Credential storage — encrypted `cursor_api_key`; connect/disconnect flow.
- [ ] **P2-3**: Config — repo url + starting ref + optional environment name + `mode` (default `plan`) + draft-PR default.
- [ ] **P2-4**: Tests — payload shape, idempotency conflict handling, auth/transport/config error categories (adapter HTTP mocked at the boundary, not the repos).

**Exit gate**: an escalation starts a Cursor cloud agent (idempotently) and the ledger holds the clickable `agent.url`; re-firing the same incident does not create a second agent.

### Phase 3 — Claude Code adapter (routines)

- [ ] **P3-1**: `ClaudeRoutineAdapter` — `POST /v1/claude_code/routines/{trig}/fire` with beta + version headers; ledger-claim dedup (no native idempotency); store session id/url.
- [ ] **P3-2**: Credential + config — encrypted routine token + routine trigger id; connect flow; MCP-checklist reminder copy.
- [ ] **P3-3**: Tests — fire payload (freeform `text`), header correctness, claim-before-POST dedup.
- [ ] **P3-4** (optional): Managed Agents variant (`/v1/sessions`) behind the same port if org-API-key auth is needed.

**Exit gate**: an escalation fires a Claude routine exactly once per source; the ledger holds the session deep link.

### Phase 4 — Codex (deferred / indirect)

- [ ] **P4-1**: Document the **self-hosted Codex runner** recipe against the webhook adapter (customer handler runs `codex exec`/SDK). No Latitude-side Codex adapter.
- [ ] **P4-2** (optional, post-MVP): **Linear broker** dispatch target — Latitude creates a Linear issue from the dispatch context; customer triage rule delegates to Codex. Evaluate as a generic tracker target, not Codex-specific.
- [ ] **P4-3**: Explicitly **do not** build against `chatgpt.com/backend-api` (unofficial, unstable, ChatGPT-account auth).

**Exit gate**: Codex is reachable via webhook → self-hosted `codex exec`; no dependency on any unofficial Codex Cloud API.

### Phase 5 — Completion loop + UI polish `[POST-MVP]`

- [ ] **P5-1**: Status backfill — Cursor poll/SSE (and v1 webhooks when GA), Claude session status; advance ledger `running`/`completed` and capture `pr_url`.
- [ ] **P5-2**: GitHub PR-merge linkage — optionally `resolveIncident` / mute signal / add member traces to a dataset (via MCP/use-cases) on merge.
- [ ] **P5-3**: Dispatch history UI in Settings → Integrations (audit log + deep links + PR link).
- [ ] **P5-4** (optional): Approval gate (`requireHumanApproval`) — Slack/in-app "send agent?" action before dispatch.

**Exit gate**: the dispatch ledger shows live status and the resulting PR; optional auto-resolve closes the loop on merge.

### Docs

- [ ] **DOC-1**: Author `dev-docs/agent-dispatch.md` (architecture, adapters, data model, idempotency) once Phase 1–2 stabilize; cross-link from `dev-docs/notifications.md`, `dev-docs/slack-integration.md`, `dev-docs/signals.md`.
- [ ] **DOC-2**: Public docs under `docs/` — "Wake a coding agent on a signal" (Cursor + Claude setup, webhook for self-host), and the MCP pre-provisioning prerequisite.
- [ ] **DOC-3**: Update the skill glossary / `AGENTS.md` only if a new repo-wide rule emerges (e.g. "dispatcher must never handle MCP creds").
