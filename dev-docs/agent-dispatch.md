# Agent Dispatch

Agent Dispatch wakes a customer's hosted coding agent when Latitude detects a signal escalation or (optionally) a new signal. Latitude assembles a context-rich prompt and POSTs to the configured platform; the agent investigates via Latitude MCP and opens a PR on the customer's side.

See also: [`agent-data-access.md`](agent-data-access.md) (the inbound counterpart — the read surface the dispatched agent uses to investigate and build dashboards), [`notifications.md`](notifications.md) (fan-out pipeline this mirrors), [`slack-integration.md`](slack-integration.md) (integration pattern), [`signals.md`](signals.md) (events consumed), [`mcp.md`](mcp.md) (MCP pre-provisioning prerequisite).

## Architecture

```
SignalCreated / SignalRegressed / IncidentCreated (domain-events worker)
   ├──→ notifications:* (email / in-app / Slack)
   └──→ agent-dispatch:request
            │  config lookup, trigger/mute/guardrail gates, prompt snapshot
            ▼
        agent-dispatch:send (one job per matched config)
            │  ledger claim → adapter POST → record external ids
            ▼
        external platform runs the agent → PR (outside Latitude)
```

Packages:

- `@domain/agent-dispatch` — entities, use cases, ports, prompt assembly
- `@platform/agent-dispatch` — HTTP adapters (Cursor, Claude routines, Linear broker, webhook)
- `@platform/db-postgres` — configs, encrypted credentials, dispatch ledger
- `apps/workers` — `agent-dispatch` worker (request + send)

## Adapters

| Kind | Mechanism | Idempotency |
| --- | --- | --- |
| `webhook` | HMAC-signed JSON POST | Ledger claim |
| `cursor` | `POST /v0/agents` with `source.repository`, optional `source.ref`, and `target.autoCreatePr: true` | Ledger claim + Cursor agent id |
| `claude_code` | Routines `/fire` with beta header | Ledger claim |
| `linear` | GraphQL `issueCreate` (customer triage rule delegates to agent) | Ledger claim |

**MCP:** The dispatcher never mints or forwards Latitude MCP credentials. The customer's Cursor environment or Claude routine must already have MCP connected (OAuth, once, out of band).

## Configuration

Settings → Integrations:

1. Connect a target (org-level credential)
2. Per-project dispatch config: enable, triggers, target mapping, guardrails
3. Dispatch history audit log

The settings UI exposes `signal.discovered` (new signal), `incident.opened` (escalating signal), `signal.regressed` (a resolved signal started occurring again), and `monitor.incident` (threshold or escalating monitor) for hosted agent/webhook targets. Linear only exposes `signal.discovered` so it creates follow-up issues for new signals rather than every escalation. `signal.discovered` fires only for `origin = 'system'` signals (auto-discovered); hand-built `origin = 'user'` signals are skipped on creation — humans already chose to create them. Runtime conditions dispatch for any signal origin: `incident.opened` when the signal opens an incident, `signal.regressed` when a `SignalRegressed` claim reopens it. Muted, ignored, or resolved signals (and muted monitors) suppress dispatch (same as notifications) — resolved matters because a delayed request can land after the user archived the signal.

## Manual sends ("Send to")

The signal detail page has a **Send to** button (`signal-send-to.tsx`) with two groups:

- **Open in your agent** (Cursor, Claude Code, Codex, OpenCode) — always available; renders the default dispatch prompt in a copy modal (`getSignalDispatchPrompt`). Nothing is written to the ledger — a copy is not a dispatch.
- **Send to integration** — behind the `agent-dispatch` flag; lists kinds with an enabled config for the project (`listSendToDestinations`) and runs `sendAgentDispatchUseCase` synchronously in the `sendSignalToIntegration` server fn with trigger `manual`.

Manual sends keep the feature flag, config-enabled check, org RLS, and ledger idempotency (`<vendor>:<configId>:manual:<signalId>:<sendId>`; each click mints a new `sendId`), but deliberately bypass trigger subscription, signal mute, and guardrails — an explicit human click is its own approval. Transport failures are returned to the user without background retry.

Guardrails: `maxDispatchesPerDay`, `cooldownMinutes` per config. The current UI uses defaults and does not expose these controls.

## Data model

- `integrations` — parent row per connected target (`kind ∈ {cursor, claude_code, linear, webhook}`)
- `agent_dispatch_credentials` — encrypted vendor tokens (AES-256-GCM)
- `agent_dispatch_configs` — per-project enabled config + target JSON + triggers + guardrails
- `agent_dispatches` — idempotency ledger + audit (`UNIQUE (organization_id, idempotency_key)`)

Idempotency key: `<vendor>:<configId>:<trigger>:<sourceId>:<window>` (automatic) or `<vendor>:<configId>:manual:<sourceId>:<sendId>` (manual sends).

## Failure policy

| Error | Action |
| --- | --- |
| 401/403 | Ack, mark failed (`auth`), surface reconnect in settings |
| 409 (Cursor) | Success |
| 429 | Retry (BullMQ) |
| 5xx / network | Retry; ledger row stays `claimed` until success or ack failure |
| 4xx config | Ack, mark failed (`config`) |

Transport retries re-use an in-flight `claimed` ledger row rather than creating a duplicate dispatch.
