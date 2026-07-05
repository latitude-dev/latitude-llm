# Agent Dispatch

Agent Dispatch wakes a customer's hosted coding agent when Latitude detects a signal escalation or (optionally) a new signal. Latitude assembles a context-rich prompt and POSTs to the configured platform; the agent investigates via Latitude MCP and opens a PR on the customer's side.

See also: [`agent-data-access.md`](agent-data-access.md) (the inbound counterpart — the read surface the dispatched agent uses to investigate and build dashboards), [`notifications.md`](notifications.md) (fan-out pipeline this mirrors), [`slack-integration.md`](slack-integration.md) (integration pattern), [`signals.md`](signals.md) (events consumed), [`mcp.md`](mcp.md) (MCP pre-provisioning prerequisite).

## Architecture

```
SignalCreated / IncidentCreated (domain-events worker)
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

Settings → Integrations (feature flag `agent-dispatch`):

1. Connect a target (org-level credential)
2. Per-project dispatch config: enable, triggers, target mapping, guardrails
3. Dispatch history audit log

The settings UI currently exposes `signal.discovered` (new signal) and `incident.opened` (escalating signal) for hosted agent/webhook targets. Linear only exposes `signal.discovered` so it creates follow-up issues for new signals rather than every escalation. `monitor.incident` remains in the domain trigger enum for future expansion but is not exposed in the current UI. Muted signals/monitors suppress dispatch (same as notifications).

Guardrails: `maxDispatchesPerDay`, `cooldownMinutes` per config. The current UI uses defaults and does not expose these controls.

## Data model

- `integrations` — parent row per connected target (`kind ∈ {cursor, claude_code, linear, webhook}`)
- `agent_dispatch_credentials` — encrypted vendor tokens (AES-256-GCM)
- `agent_dispatch_configs` — per-project enabled config + target JSON + triggers + guardrails
- `agent_dispatches` — idempotency ledger + audit (`UNIQUE (organization_id, idempotency_key)`)

Idempotency key: `<vendor>:<trigger>:<sourceId>`.

## Failure policy

| Error | Action |
| --- | --- |
| 401/403 | Ack, mark failed (`auth`), surface reconnect in settings |
| 409 (Cursor) | Success |
| 429 | Retry (BullMQ) |
| 5xx / network | Retry; ledger row stays `claimed` until success or ack failure |
| 4xx config | Ack, mark failed (`config`) |

Transport retries re-use an in-flight `claimed` ledger row rather than creating a duplicate dispatch.
