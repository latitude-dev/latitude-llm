# Codemode Observability UI

> **Documentation**: `dev-docs/spans.md`, `docs/telemetry/frameworks/cloudflare-codemode.mdx`  
> **Context**: Cloudflare Code Mode example emits multi-trace orchestration (plan → sandbox tools → sub-agent → summarize). Latitude ingests all spans but the console presents them as unrelated newest-first trace rows.

## Problem

A single user turn in a codemode agent produces **many traces** in one session:

1. `ai.generateText` — codemode plan  
2. `ai.toolCall codemode` — sandbox execution (host)  
3. `ai.toolCall delegateWeatherResearch` — inner tool (separate trace today)  
4. `ai.toolCall formatTravelBrief` — inner tool (separate trace today)  
5. Sub-agent traces — `getWeatherDetail`, `scoreComfort`, etc.  
6. `ai.streamText` — user-facing summary  

**Traces tab** lists these flat, **newest first** — the story reads backwards.

**Session drawer** limitations today:

- **Conversation** loads messages from `latestTraceId` but already fetches **session spans** via `useSpansBySessionCollection` for the activity scrubber. For codemode, the summary trace carries the full message chain (plan tool-call + result + assistant text), so the `codemode` block appears — but it is opaque (no code, no step list).
- **Spans tab** is hidden for multi-trace sessions (`singleTrace` gate in `session-slot.tsx`).
- `latitude.codemode.inner_tool` exists on spans (`instrumentCodemodeTools`) but the web app never reads it.

## Goal

Open a codemode session and **read the orchestration top-to-bottom once**, expanding only where something failed — without opening five trace drawers or mentally reversing a table.

## Non-goals

- Replacing generic trace/session views for non-codemode workloads  
- Running or replaying codemode in the UI  
- Cloudflare `useAgentToolEvents` UI parity (inspiration only)  
- One root trace per user turn in ingest (future consideration, not this spec)  
- Traces-tab "group by session" unless Phase 3 dogfood shows Phase 1–2 insufficient

## Decisions

| ID | Decision |
|---|---|
| **D1** | Tab name: **Run** (session drawer, multi-trace sessions only). |
| **D2** | **Telemetry contract first** — stable span attributes before UI heuristics; example app updated in Phase 0. |
| **D3** | **Turn grouping** — derive turns from user messages on `latestTraceId` conversation (see algorithm below); assign traces/spans to turns by time window. |
| **D4** | **Phase 1 fetches session spans** — reuse `useSpansBySessionCollection` (already used by Conversation timeline and Metadata tab). |
| **D5** | **Sub-agent drill-in requires explicit link metadata** — no overlap-only matching in v1. Block Phase 2 drill-in on `latitude.agent_tool.parent_tool_call_id` (+ optional `run_id`). |
| **D6** | **Phase detection priority**: (1) `latitude.codemode.phase` attr, (2) `experimental_telemetry.functionId` on span attrs (verify ingest maps it — otherwise falls through to priority 3), (3) operation + name heuristics for legacy data. |

## Telemetry contract (Phase 0)

SDK + docs emit these **span attributes** (all optional for backward compat, required for codemode example after Phase 0):

| Attribute | Values | Set on |
|---|---|---|
| `latitude.codemode.phase` | `plan` \| `execute` \| `summarize` | Root model/tool spans for each orchestration phase |
| `latitude.codemode.inner_tool` | `true` | Inner sandbox tool spans (already shipped) |
| `latitude.codemode.turn_id` | string | All spans in one user turn (default: `{sessionId}:{turnIndex}`) |
| `latitude.agent_tool.parent_tool_call_id` | string | Sub-agent root span / traces |
| `latitude.agent_tool.run_id` | string | Sub-agent run (when available from `runAgentTool`) |

**Phase 0 telemetry code changes**

- `instrumentCodemodeTools`: propagate OTel context so inner tool spans are **children** of the active `ai.toolCall codemode` span when parent context exists.  
- Cloudflare codemode example worker: set `latitude.codemode.phase` on plan / execute / summarize tracers; set `parent_tool_call_id` when delegating to sub-agent.  
- Document contract in `docs/telemetry/frameworks/cloudflare-codemode.mdx`.

## Turn grouping algorithm

When **`latitude.codemode.turn_id`** is present on spans/traces, group by it directly (authoritative). The message-timestamp algorithm below is the **fallback** for legacy data lacking `turn_id`.

**Fallback algorithm** (sessions have `traceIds[]` and `latestTraceId` but no turn index):

1. Load conversation messages from **`latestTraceId`** (existing behavior).  
2. Enumerate **user messages** in order → each defines a turn `turnIndex` (0-based).  
3. Turn time window: `[userMessage.atMs, nextUserMessage.atMs)` (last turn: `[atMs, session.endTime]`).  
4. Assign each **trace** to the turn whose window contains `trace.startTime`.  
5. Assign each **session span** to the same turn by `span.startTime`.  
6. **Orphan traces** (no user message yet, e.g. partial ingest): fall into turn 0 or an "Unassigned" bucket shown collapsed at top.

Turn label: first 80 chars of user message text, or `"Turn {n}"`.

## Phase detection (within a turn)

After sorting assigned traces/spans by `startTime ASC`, build the Run tree:

| Node | Detection (first match) |
|---|---|
| **Plan** | span/trace with `latitude.codemode.phase=plan`, OR name `ai.generateText` + metadata `functionId=codemode-plan` |
| **Execute (codemode)** | span/trace with `phase=execute`, OR `ai.toolCall codemode`, OR parent of inner-tool spans. *Note: `phase=execute` may be unavailable on the `ai.toolCall codemode` span itself (emitted by `createCodeTool` / AI SDK); rely on operation name + inner-tool parent fallback there.* |
| **Inner tool** | span with `latitude.codemode.inner_tool=true` (group under Execute; sort by startTime) |
| **Sub-agent** | span/trace with `latitude.agent_tool.run_id` or tag/metadata `subagent` / example role metadata |
| **Summarize** | `phase=summarize`, OR `ai.streamText` + `functionId=codemode-summary` |

Legacy fallback (pre-Phase-0 data): infer Plan/Summarize from trace names + example tags only; show **"Unlabeled phase"** badge when confidence is low.

## UI design

### Run tab (Phase 1)

New tab in **session detail drawer** when `session.traceIds.length > 1`.

```
Turn 1 — "Compare Barcelona vs Paris…"
├─ Plan · 18.3s                    [→ trace]
├─ Codemode execution · 4.3s
│  ├─ delegateWeatherResearch · 4.3s   [→ trace]
│  └─ formatTravelBrief · <1ms         [→ span]
├─ Sub-agent · WeatherResearch · 3.1s  [→ traces]  (linked via parent_tool_call_id)
└─ Summarize · 3.2s                [→ trace]
```

- Row click → existing trace drawer or inline span detail panel.  
- Error badge on failed span/trace; expand shows tool validation / exception from span attrs.  
- **Traces tab unchanged** (newest-first); Run tab is the chronological debug view.

**Motivation**: multi-trace sessions lack a Spans tab today — Run tab is the session-scoped span/trace navigator.

### Codemode card in Conversation (Phase 2)

Enhance the `codemode` tool-call block (visible on summary trace message chain):

- **Collapsed**: name, duration, status, inner step count.  
- **Expanded**: syntax-highlighted **generated code** (from tool input `code`); step list (shared `buildCodemodeRunTimeline` Execute subtree); link **Open in Run tab**.

Data: session spans + `toolCallSpanMap` from existing `useSessionConversationSpanMaps`.

### Sub-agent drill-in (Phase 2)

Only when `latitude.agent_tool.parent_tool_call_id` matches the delegate inner-tool span's `toolCallId`:

- **Sub-agent** badge on delegate row.  
- Drill-in lists child traces/spans sharing the same `parent_tool_call_id` or `run_id`.  
- Breadcrumb: `Session → Turn N → delegateWeatherResearch → Sub-agent`.

If link metadata absent: show delegate row without drill-in (no time-overlap guessing).

### Span tab enhancements (Phase 3)

- **Inner tool** badge when `latitude.codemode.inner_tool`.  
- Filter: **Codemode inner tools**.  
- Friendly phase label from `latitude.codemode.phase` when present.  
- With Phase 0 nesting, a single codemode trace span tree shows inner tools indented under `ai.toolCall codemode`.

## Data & APIs

| Phase | Data source |
|---|---|
| 0 | Telemetry SDK only |
| 1 | `use-session-traces.ts` + **`useSpansBySessionCollection`** + conversation messages from `latestTraceId` |
| 2 | Same + `toolCallSpanMap` / span detail for code + drill-in |
| 3 | Per-trace spans (existing); optional session-span waterfall if query cost acceptable |

**No new backend endpoints for Phase 1–2** — client-side `buildCodemodeRunTimeline({ session, traces, spans, messages })`.

## Success metrics

- Codemode QA time-to-root-cause **< 60s** without Traces tab (internal).  
- Barcelona vs Paris example: Run tab order matches real execution order in fixture test.  
- Example README links to Run tab workflow.

## User stories

1. Debug failed codemode run — see phase + failing inner tool + validation error.  
2. Drill into sub-agent from delegate step (with link metadata).  
3. Read generated code beside execution results.  
4. Filter `cloudflare-codemode` sessions and open Run tab directly.

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 0 — Telemetry contract (P0)

- [ ] **P0-0a**: Nest inner tool spans under codemode parent via OTel context in `instrumentCodemodeTools`.  
- [ ] **P0-0b**: Emit `latitude.codemode.phase`, `latitude.codemode.turn_id` from codemode example worker tracers.  
- [ ] **P0-0c**: Emit `latitude.agent_tool.parent_tool_call_id` (+ `run_id` when available) on sub-agent delegation.  
- [ ] **P0-0d**: Document attributes in `cloudflare-codemode.mdx`.  
- [ ] **P0-0e**: Unit test: inner span has `inner_tool` + parent span id when context active.

**Exit gate**: Example session ingests spans with phase + inner_tool nesting verifiable in ClickHouse/MCP.

### Phase 1 — Run tab (P0)

- [ ] **P0-1**: Implement `buildCodemodeRunTimeline()` with turn algorithm + phase detection (D6 priority).  
- [ ] **P0-2**: Add **Run** tab to session drawer (`traceIds.length > 1`).  
- [ ] **P0-3**: Wire `useSpansBySessionCollection` + session traces + latestTrace messages.  
- [ ] **P0-4**: Row navigation to trace drawer / span detail; error badges.  
- [ ] **P0-5**: Vitest fixtures from codemode example session (plan → inner tools → summarize order).

**Exit gate**: Run tab for `qa-a8624440`-shaped session shows correct chronological tree; legacy sessions degrade gracefully with unlabeled phases.

### Phase 2 — Conversation card + sub-agent drill-in (P1)

- [ ] **P1-6**: Expandable codemode tool block (code + steps + link to Run tab).  
- [ ] **P1-7**: Sub-agent drill-in gated on `parent_tool_call_id` (D5).  
- [ ] **P1-8**: Breadcrumb navigation session ↔ run step ↔ sub-agent.

**Exit gate**: Failed inner tool visible from Conversation; sub-agent reachable when Phase 0 metadata present.

### Phase 3 — Span UI polish (P2)

- [ ] **P2-9**: Inner-tool badge + filter in Spans tab.  
- [ ] **P2-10**: Phase labels on span rows.  
- [ ] **P2-11**: (Optional) Traces tab group-by-session if dogfood warrants.

**Exit gate**: Codemode trace opened in Spans tab shows nested inner tools post-Phase-0.

## Review history

| Round | Verdict | Notes |
|---|---|---|
| 1 | Approve with changes | No turn primitive; Phase 1 needs spans; example-only heuristics; overlap linking risky; consider telemetry-first reorder. |
| 2 | **APPROVE** | All round-1 items resolved. Minor nits folded in (`turn_id` authoritative over time windows; execute phase heuristic note). Engineering cleared for Phase 0+1. |
