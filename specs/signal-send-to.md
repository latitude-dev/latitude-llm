# Signal "Send to" — manual dispatch from the signal detail page

> **Documentation** — durable homes after stabilization: `dev-docs/agent-dispatch.md` (manual trigger + send flow) and `dev-docs/signals.md` (signal detail page actions). Related current docs: `dev-docs/agent-dispatch.md`, `dev-docs/signals.md`, `dev-docs/mcp.md`.
>
> **Depends on** — the shipped Agent Dispatch system (`specs/agent-dispatch.md`, all four adapter phases complete): `@domain/agent-dispatch` (context assembly, prompt rendering, ledger, use-cases), `@platform/agent-dispatch` (Cursor / Claude routines / Linear / webhook adapters), the `agent-dispatch` worker, and the Settings → Integrations UI.
>
> **Origin** — LAT-730 ("Add a 'Send to' button in the signal detail page").

## Contents

1. [Purpose](#purpose)
2. [Ground truth — what exists today](#ground-truth--what-exists-today)
3. [Concept: one prompt, two delivery modes](#concept-one-prompt-two-delivery-modes)
4. [UX](#ux)
5. [Behavior per destination](#behavior-per-destination)
6. [Data and API changes](#data-and-api-changes)
7. [Security and tenancy](#security-and-tenancy)
8. [Out of scope](#out-of-scope)
9. [Open questions](#open-questions)
10. [Testing plan](#testing-plan)
11. [Tasks](#tasks)

---

## Purpose

Agent Dispatch today is **event-driven only**: a `SignalCreated` or `IncidentCreated` event fans out through `agent-dispatch:request` → `agent-dispatch:send`, gated by per-project configs, triggers, mute, and guardrails. There is no way for a human looking at a specific signal to say "send *this one* to my agent, now".

LAT-730 adds that manual path: a **"Send to"** button on the signal detail page (`apps/web/src/routes/_authenticated/projects/$projectSlug/signals/$signalId/index.tsx`) opening a selector with two groups:

- **Common agent harnesses** (local): Cursor, Claude Code, Codex, OpenCode — the user's own terminal/editor agent. Latitude cannot start these remotely; the deliverable is the assembled investigation prompt, handed to the user to paste or run.
- **Cloud integrations the user has set up**: Cursor Cloud, Claude Code Cloud, Linear, Webhook — the four existing `AGENT_DISPATCH_KINDS`. The deliverable is an immediate, user-initiated dispatch through the existing adapter for the project's connected config.

The one-line model: **"Send to" is a manual trigger for the existing agent-dispatch pipeline, plus a copy-prompt escape hatch for agents Latitude cannot reach.**

## Ground truth — what exists today

Everything below was verified in code; the feature is mostly composition, not new machinery.

| Piece | Where | Reused as |
| --- | --- | --- |
| Signal detail page header actions (`SignalTriageControls`, `SignalLifecycleActions`, rename) | `apps/web/src/routes/_authenticated/projects/$projectSlug/signals/$signalId/index.tsx` | Placement for the "Send to" button |
| Context snapshot for a signal (name, source, priority, tags, sample excerpt, sample trace ids, sample conversations, deep link) | `packages/domain/agent-dispatch/src/helpers/build-dispatch-context.ts` (`buildDispatchContextFromSignal`) | The payload for both delivery modes |
| Prompt rendering (default template + per-config Mustache override) | `packages/domain/agent-dispatch/src/helpers/render-prompt.ts` | The text sent to cloud targets and copied for local harnesses |
| Dispatch execution: ledger claim → adapter POST → record external ids | `packages/domain/agent-dispatch/src/use-cases/send-agent-dispatch.ts` | Called for manual cloud sends |
| Vendor adapters (Cursor `POST /v0/agents`, Claude routines `/fire`, Linear `issueCreate`, HMAC webhook) | `packages/platform/agent-dispatch/src/adapters/*` | Unchanged |
| Per-project configs + org-level integrations + encrypted credentials + audit ledger | `agent_dispatch_configs` / `integrations` / `agent_dispatch_credentials` / `agent_dispatches` (`packages/platform/db-postgres/src/schema/agent-dispatch-*.ts`) | Unchanged; ledger records manual sends too |
| Web server functions for dispatch settings (list integrations/configs/dispatches, vendor HTTP helpers) | `apps/web/src/domains/agent-dispatch/agent-dispatch.functions.ts` | Extended with send/prompt functions |
| Feature flag `agent-dispatch` | `packages/domain/agent-dispatch/src/constants.ts`, `isAgentDispatchEnabled` server fn | Gates the cloud group |
| Grouped dropdown menu (`DropdownMenuLabel`, separators, icons, disabled items) | `packages/ui/src/components/dropdown-menu/dropdown-menu.tsx` | The selector |
| Copy-a-prompt-into-your-coding-agent pattern (`getCodingAgentTelemetryPrompt`), `CopyButton`, `CodeBlock`, `Tabs` | `apps/web/src/routes/_authenticated/projects/$projectSlug/-components/onboarding-integration-snippets.ts`, `@repo/ui` | The local-harness modal |
| Harness icons: `claude-code`, `opencode` exist; **`cursor` and `codex` do not** | `packages/ui/src/components/icons/custom-icons/providers/provider-map.ts` | Two new icons needed |

What does **not** exist: any deeplink infrastructure (`cursor://…` appears only in an OAuth-redirect validation test), any manual dispatch trigger (the enum is `["incident.opened", "signal.discovered", "monitor.incident"]`), and any public "send signal" API.

## Concept: one prompt, two delivery modes

Both groups share the same assembled artifact: `buildDispatchContextFromSignal` → `renderDispatchPrompt`. That prompt already names the signal, priority, tags, a sample annotation/eval excerpt, sample trace ids, up to two conversation excerpts, and the console deep link, and instructs the agent to use Latitude MCP tools when available. The two modes differ only in delivery:

- **Cloud**: Latitude POSTs the prompt to the configured platform via the existing adapter, claims a ledger row, and surfaces the returned deep link ("View in Cursor" / the Linear issue URL).
- **Local**: Latitude renders the prompt in a modal for the user to copy, alongside a ready-made CLI one-liner per harness. Nothing is dispatched and nothing is written to the ledger — it is a clipboard action, mirroring the onboarding "paste this into your coding agent" pattern.

## UX

### Button placement

A `Send to` outline button (send icon + label, `size="sm"` in the compact header) in the header `actions` of the signal detail page, rendered **before** `SignalTriageControls` — i.e. the first action, since it is the page's primary "do something about this" affordance. Component lives at `apps/web/src/routes/_authenticated/projects/$projectSlug/signals/$signalId/-components/signal-send-to.tsx` following the sibling `-components/` convention.

The button always renders (the local-harness group has no prerequisites). It is disabled while the signal is loading or not found.

### Selector

Clicking opens a `@repo/ui` `DropdownMenu` with two labeled sections (via `DropdownMenuLabel` + separator):

```
Send to
├─ Open in your agent
│    Cursor · Claude Code · Codex · OpenCode        (always present)
├─ ──────────────────────
└─ Send to integration                              (requires `agent-dispatch` flag)
     Cursor Cloud · Claude Code Cloud · Linear · Webhook
       — only kinds with an enabled config for this project
     "Connect an integration…"  → /projects/$projectSlug/settings/integrations
       — shown when the flag is on but no config matches
```

- **Loading**: while `listSendToDestinations` (new server fn, see below) resolves, the integration section shows a single disabled "Loading integrations…" item. The local group never waits on it.
- **Empty state**: flag on + zero enabled configs → the integration section shows one item, "Connect an integration…", navigating to the existing Settings → Integrations page (`apps/web/src/routes/_authenticated/projects/$projectSlug/settings/integrations/index.tsx`). Flag off → the integration section is omitted entirely (local group only).
- **Icons**: `ProviderIcon` entries — reuse `claude-code` and `opencode`; add `cursor` and `codex` icons to `packages/ui/src/components/icons/custom-icons/providers/`.
- At most **one item per cloud kind** can appear: the current model allows one active integration per kind per org (`AgentDispatchIntegrationRepository.findActiveByKind`) and one config per `(project, integration)`, so the selector never needs per-config disambiguation.

### Feedback states (cloud sends)

- **Pending**: the clicked item shows a spinner and the menu stays interactive-disabled until the send resolves (single-flight; a second click is a no-op).
- **Success**: toast "Sent to Cursor Cloud" with an inline "View" link when the adapter returned a deep link (`agent.url`, Linear issue URL). Claude routines and webhooks return no navigable URL → plain success toast pointing at "Dispatch history" in settings.
- **Failure**: destructive toast via `toUserMessage`. `auth`/`config` adapter failures append "Check the integration in Settings → Integrations." Transport/rate-limit failures read "Could not reach <platform>. Try again." — manual sends do **not** retry in the background (the human is present; see [Behavior](#cloud-integrations-cursor-cloud--claude-code-cloud--linear--webhook)).

### Local-harness modal

Selecting a local harness opens a modal (`Modal.Root`, same pattern as `SignalLifecycleActions`'s confirm modal):

- Title: "Send to Cursor" (etc.). Body: the rendered prompt in a `CodeBlock` with a `CopyButton`, prefetched via the new `getSignalDispatchPrompt` server fn (skeleton while loading).
- Below the prompt, a per-harness "or run from your terminal" `CodeBlock` with the CLI one-liner (see [Behavior](#local-harnesses-cursor--claude-code--codex--opencode)).
- A short hint line: "Works best with the Latitude MCP connected — see docs" linking to the MCP docs page, since the prompt tells the agent to use Latitude MCP tools when available (and degrades gracefully when not — the prompt already carries trace ids and excerpts as starting evidence).

## Behavior per destination

### Local harnesses (Cursor / Claude Code / Codex / OpenCode)

All four get the **same rendered prompt** (default template; no per-config template exists for local harnesses). The only per-harness difference is the CLI one-liner:

| Harness | CLI snippet (prompt via heredoc/quoting handled by the snippet builder) |
| --- | --- |
| Cursor | copy prompt → paste into Cursor chat; terminal alternative `cursor-agent "<prompt>"` |
| Claude Code | `claude "<prompt>"` |
| Codex | `codex "<prompt>"` |
| OpenCode | `opencode run "<prompt>"` |

- Long prompts (sample conversations can reach ~12k chars, `SAMPLE_CONVERSATIONS_MAX_CHARS`) make shell quoting fragile. The CLI snippets therefore use the **copied clipboard** as the source of truth ("copy the prompt, then run `claude` and paste"), with the one-liner shown for short prompts only — exact cutoff decided at implementation. See [Open questions](#open-questions) (Q4).
- **No deeplinks in the MVP.** There is no verified, stable public URL scheme for pre-filling a prompt into Cursor/Claude Code/Codex/OpenCode; the repo has no deeplink precedent beyond MCP OAuth callbacks. If Cursor ships a documented prompt deeplink, an "Open in Cursor" button can be added later without reshaping this feature (Q1).
- **Nothing is recorded.** A copy action is not a dispatch; it writes no `agent_dispatches` row. The dispatch-history UI stays a faithful ledger of actual outbound calls.

### Cloud integrations (Cursor Cloud / Claude Code Cloud / Linear / Webhook)

A manual send reuses `sendAgentDispatchUseCase` end-to-end (ledger claim → adapter → record), with these deliberate differences from automatic dispatch:

| Gate | Automatic | Manual send |
| --- | --- | --- |
| Feature flag `agent-dispatch` | required | required |
| Config enabled for project | required | required |
| Config subscribes to the trigger (`config.triggers`) | required | **bypassed** — clicking is the subscription |
| Signal mute (`signals.muted_at`) | suppresses | **bypassed** — mute silences automatic fan-out; an explicit human click overrides it |
| Guardrails (`maxDispatchesPerDay`, `cooldownMinutes`) | enforced | **bypassed** — guardrails exist to bound unattended volume; a human-initiated send is its own approval (Q2) |
| Retry on transport/429 | BullMQ backoff | **none** — the server fn returns the failure; the user retries by clicking again |

- **New trigger value `manual`** added to `AGENT_DISPATCH_TRIGGERS` (`packages/domain/agent-dispatch/src/constants.ts`) and the `AgentDispatchTrigger` union. The settings UI's `ACTIVE_DISPATCH_TRIGGERS` (`agent-dispatch-section.tsx`) is untouched — `manual` is never a subscribable config trigger, only a ledger/`context.trigger` value. Dispatch history labels it "Manual send".
- **Execution is synchronous in the web server fn**, not enqueued. Precedent: `agent-dispatch.functions.ts` already makes direct vendor HTTP calls from server fns (`fetchCursorRepositories`, `fetchLinearTeams`); the adapter call is one POST, and the user needs the returned deep link immediately. The worker path (`apps/workers/src/workers/agent-dispatch.ts`) stays automatic-only. The server fn provides `AgentDispatchAdaptersLive` plus the same repository layers the worker composes.
- **Idempotency**: key `<vendor>:<configId>:manual:<signalId>:<sendId>` (vendor stays the first segment so the dispatch-history kind parser keeps working) where `sendId` is a client-generated id created when the user clicks. Repeated deliberate sends of the same signal are allowed (each click mints a new `sendId`); double-submits of one click dedupe on the ledger's `UNIQUE (organization_id, idempotency_key)` exactly like automatic dispatch.
- **Per-kind semantics** (unchanged, inherited from the adapters):
  - **Cursor Cloud** — starts a cloud agent on the config's repo (`repoUrl`/`startingRef`, `autoCreatePR`); toast links to `agent.url`.
  - **Claude Code Cloud** — fires the config's routine with the prompt as `text`; toast links to dispatch history (routines return no per-run URL today; the history row carries the routine URL).
  - **Linear** — creates an issue in the config's team (title = signal name + "manual send", description = prompt + deep link); toast links to the issue URL. The customer's triage rules may delegate it onward.
  - **Webhook** — HMAC-signed POST with `{ trigger: "manual", context, prompt }`; toast confirms delivery (2xx) only.

## Data and API changes

**No new tables, no migrations.** The `agent_dispatches` ledger, configs, credentials, and integrations tables are reused as-is (`trigger` is `varchar`, so `manual` needs no schema change — verify the column, not an enum, during P1).

Domain (`@domain/agent-dispatch`):

- Add `"manual"` to `AGENT_DISPATCH_TRIGGERS` and thread it through `AgentDispatchTrigger` / `agentDispatchContextSchema`.
- New pure helper `buildManualDispatchIdempotencyKey({ configId, signalId, sendId })` next to `buildDispatchIdempotencyKey`.
- No changes to `sendAgentDispatchUseCase`, adapters, or the worker.

Web server functions (`apps/web/src/domains/agent-dispatch/agent-dispatch.functions.ts`):

- `listSendToDestinations({ projectId })` — enabled configs for the project joined with their integration kind, returned as `{ configId, kind }[]`. Backed by the existing `AgentDispatchConfigRepository.listEnabledByProject`.
- `getSignalDispatchPrompt({ projectId, signalId })` — `buildDispatchContextFromSignal` (trigger `manual`) + `renderDispatchPrompt` (default template), returning `{ prompt }` for the local-harness modal. Requires the ClickHouse client for `ScoreAnalyticsRepository` and the trace reader; the web server already composes CH layers (see `signals.functions.ts`).
- `sendSignalToIntegration({ projectId, signalId, configId, sendId })` — validates the config belongs to the project and is enabled, validates the signal belongs to the project (the same `SignalRepository.findById` + project check `requestAgentDispatchUseCase` performs), builds context, renders the prompt **with the config's `promptTemplate`**, and runs `sendAgentDispatchUseCase` inline. Returns `{ status, externalUrl? }`.

**No public REST/SDK/MCP surface in this feature.** UI leads, matching the R1 builder precedent in `specs/signals.md` ("Web `createServerFn` handlers … no REST/SDK regen — UI leads"). A public `dispatchSignal` operation is future work (see [Out of scope](#out-of-scope)).

## Security and tenancy

- Every server fn goes through `requireSession()` and `withPostgres(…, organizationId)` — RLS scopes configs, credentials, signals, and ledger rows to the caller's org, same as every existing agent-dispatch function.
- The config→project and signal→project checks prevent a valid session from dispatching another project's signal through an unrelated config.
- Credentials never leave the server: the send fn decrypts inside `sendAgentDispatchUseCase` exactly as the worker does; the client only ever sees `{ configId, kind }`.
- The copied prompt contains the same trace excerpts already emailed/dispatched automatically — no new data-exposure class; the 200-char excerpt cap and 12k conversation cap apply unchanged.

## Out of scope

- **Public API/SDK/MCP `dispatchSignal` operation** — would let external automations trigger manual sends; deferred until the UI flow stabilizes.
- **Deeplinks that open a local harness with the prompt pre-filled** — no stable public scheme verified for any of the four harnesses (Q1).
- **Per-send prompt editing** — a "customize before send" textarea; the per-config `promptTemplate` in settings remains the only customization point (Q5).
- **New integration kinds** (GitHub issues, Slack, Devin, etc.) and multiple configs per kind per project.
- **Completion tracking** — Latitude still does not poll the agent run or the resulting PR (decision D7 of `specs/agent-dispatch.md` stands).
- **"Send to" from other surfaces** (signals list rows, incident pages, trace pages) — detail page only for the MVP; the command-palette entry is a stretch task in Phase 2.

## Open questions

1. **Cursor prompt deeplink** — does Cursor (or any of the four harnesses) publish a stable URL scheme to open a new chat/agent with pre-filled text? If confirmed, add an "Open in Cursor" button to the local modal. Needs vendor-docs verification; do not assume from the `cursor://` OAuth callback scheme.
2. **Guardrail bypass** — this spec bypasses `maxDispatchesPerDay`/`cooldownMinutes` for manual sends on the grounds that guardrails bound *unattended* volume. If product wants a cap on manual sends too (e.g. shared daily budget), enforce the same `checkGuardrails` in `sendSignalToIntegration` and surface "Daily dispatch limit reached" in the toast.
3. **Muted-signal sends** — this spec allows sending a muted signal (mute gates automatic fan-out only). Confirm this reading with product; the alternative is a confirm modal ("This signal is muted — send anyway?").
4. **CLI one-liner vs. clipboard-first** — prompts with conversation excerpts are too long to quote safely in a shell one-liner. Proposal: modal always leads with Copy; the one-liner renders only when the prompt is under a threshold (~1,500 chars), otherwise the terminal tab says "copy the prompt and paste it into `<agent>`". Decide the threshold during implementation.
5. **Prompt review before send** — should the cloud send show the rendered prompt for a final look (one more click) instead of sending immediately? Current spec sends immediately for parity with the low-ceremony triage actions on the page; the ledger + toast give post-hoc visibility.
6. **Codex cloud** — OpenAI Codex has a cloud offering; it is not an `AGENT_DISPATCH_KIND` today. Adding it is an Agent Dispatch adapter question (new spec/phase), not part of LAT-730; the Linear/webhook brokers reach it indirectly meanwhile.

## Testing plan

Per the testing skill: PGlite testkit for anything repository-backed, no `vi.mock` for repositories, adapter HTTP mocked at the boundary.

- **Domain**: `buildManualDispatchIdempotencyKey` shape; `agentDispatchContextSchema` accepts `trigger: "manual"`; `renderDispatchPrompt` output for a signal-only context (no incident/metrics lines) — extends `render-prompt.test.ts`.
- **Server fns** (unit-style over the use-case composition with PGlite): rejects when the flag is off; rejects config/project mismatch and signal/project mismatch; allows a muted signal; bypasses `config.triggers`; double-submit with the same `sendId` returns `skipped-already-dispatched` while a new `sendId` dispatches again; `auth`/`config` adapter failures mark the ledger row failed and return the category; transport failures propagate without retry.
- **Ledger/history**: a manual send appears in `listAgentDispatches` with `trigger: "manual"` and the external URL; the history UI renders the "Manual send" label.
- **UI**: selector renders both groups; integration group hidden without the flag; empty state links to settings; local modal shows prompt + copy + per-harness snippet; pending/success/error toasts (component tests where the existing suite has precedent, otherwise covered by manual QA).
- **Manual QA**: one end-to-end send per kind against a seeded org (webhook via a local receiver verifying the HMAC signature and `trigger: "manual"`), plus copy-paste of the prompt into at least two real harnesses (Claude Code, Cursor) confirming the agent can act on the deep link + trace ids without MCP.

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 — Manual dispatch backbone (domain + server fns)

- [x] **P1-1**: Add `"manual"` to `AGENT_DISPATCH_TRIGGERS`; thread through `AgentDispatchTrigger`, `agentDispatchContextSchema`, and the dispatch-history label map. Verify `agent_dispatches.trigger` is a plain varchar (no migration).
- [x] **P1-2**: `buildManualDispatchIdempotencyKey` helper + tests.
- [x] **P1-3**: `listSendToDestinations` server fn (enabled configs by project → `{ configId, kind }[]`).
- [x] **P1-4**: `getSignalDispatchPrompt` server fn (context + default prompt render; CH layers wired as in `signals.functions.ts`).
- [x] **P1-5**: `sendSignalToIntegration` server fn — validation (flag, config↔project, signal↔project), context build, per-config template render, inline `sendAgentDispatchUseCase` with `AgentDispatchAdaptersLive`, mapped outcome `{ status, externalUrl? }`.
- [~] **P1-6**: Tests per the [testing plan](#testing-plan) — domain tests landed (idempotency key, `manual` context trigger); the server-fn matrix is pending (apps/web has no repository-backed server-fn test precedent yet).

**Exit gate**: a manual send from a script/server-fn test dispatches exactly once per `sendId` through each adapter kind, appears in the ledger with `trigger: "manual"`, bypasses trigger subscription/mute/guardrails, and respects the feature flag and org scoping.

### Phase 2 — "Send to" UI on the signal detail page

- [x] **P2-1**: `cursor` icon added to the `@repo/ui` provider icon set (`provider-map.ts` + icon component); `codex` maps to the existing OpenAI mark.
- [x] **P2-2**: `signal-send-to.tsx` component — button + grouped dropdown (local group always; integration group behind the flag with loading/empty/connect states), mounted in the detail-page header actions before `SignalTriageControls`.
- [x] **P2-3**: Local-harness modal — prompt `CodeBlock` with copy, clipboard-first CLI hint per harness (per Q4), MCP hint link.
- [x] **P2-4**: Cloud send flow — single-flight pending state, success toast with external link, failure toasts per category (settings pointer on `auth`/`config`).
- [x] **P2-5**: Dispatch-history label for `manual` in the settings audit log.
- [ ] **P2-6** *(stretch)*: command-palette entries ("Send to Cursor…", etc.) via `useRegisterCommands`, following `use-signal-triage-commands.tsx`.

**Exit gate**: from a seeded project with a connected Cursor config, a user opens a signal, sends it to Cursor Cloud, and lands on the running agent via the toast link; with no integrations the selector still offers the four local harnesses and a working copy-prompt modal; the flag-off org sees only the local group.

### Phase 3 — Docs and follow-ups

- [x] **P3-1**: Update `dev-docs/agent-dispatch.md` (manual trigger, gate table, sync send path).
- [ ] **P3-2**: Public docs (`docs/agent-dispatch/…`) — "Send a signal to your agent" page covering both groups.
- [ ] **P3-3**: Resolve open questions Q1 (deeplink), Q2/Q3 (guardrails/mute product confirmation), Q6 (Codex cloud adapter) — file follow-up issues where the answer creates new work.

**Exit gate**: docs match shipped behavior; each unresolved open question has an owner or a follow-up issue.
