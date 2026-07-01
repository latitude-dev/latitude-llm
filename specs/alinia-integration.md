# Alinia Integration

> **Documentation**: `dev-docs/integrations.md` (durable home after stabilization), cross-links from `dev-docs/evaluations.md`, `dev-docs/scores.md`, `dev-docs/spans.md`, `dev-docs/settings.md`.
> **Linear**: [LAT-717](https://linear.app/latitude/issue/LAT-717/investigate-alinia-integration) · **GitHub**: [#3794](https://github.com/latitude-dev/latitude-llm/issues/3794)
> **Status**: investigation complete — no code shipped yet; this spec is the handoff for implementation.

## Contents

1. [Purpose](#purpose)
2. [What Alinia provides](#what-alinia-provides)
3. [Current Latitude state](#current-latitude-state)
4. [Fit analysis](#fit-analysis)
5. [Recommended architecture](#recommended-architecture)
6. [Data model](#data-model)
7. [Pipeline](#pipeline)
8. [Score contract](#score-contract)
9. [Configuration and UI](#configuration-and-ui)
10. [Phase 2 — inline block/allow](#phase-2--inline-blockallow)
11. [Security, billing, and licensing](#security-billing-and-licensing)
12. [Open questions](#open-questions)
13. [Decisions](#decisions)
14. [Tasks](#tasks)

---

## Purpose

Let a Latitude customer connect their **own Alinia account** so every ingested LLM interaction can be scanned by Alinia Guardrails for safety, compliance, accuracy, and PII risks — **after the fact**, for auditing and reliability workflows inside Latitude.

**MVP (this spec):** post-hoc audit. Latitude calls Alinia asynchronously when a trace completes, persists structured results as scores, and surfaces them on trace/session views and in reliability workflows (issues, signals, filters).

**Phase 2 (explicitly deferred):** inline block/allow at request time. That requires a different integration surface (proxy, SDK hook, or ingest middleware) and is not part of the MVP scope.

---

## What Alinia provides

[Alinia Guard](https://alinia.ai/guardrails/) is a vendor-hosted guardrails API. Customers bring:

- an **API key** (`Authorization: Bearer <key>`)
- a **tenant-specific endpoint URL** (issued in the Alinia console)
- a **detection configuration** — either a `detection_config_id` (pre-built guard profile) or an inline `detection_config` object (category toggles/thresholds)

### Request shape (from public wrappers + marketplace docs)

```http
POST <customer-endpoint>
Authorization: Bearer <alinia-api-key>
Content-Type: application/json

{
  "input": "…",                          // OR "messages": [{ "role": "…", "content": "…" }, …]
  "output": "…",                         // optional — scan assistant output separately
  "context_documents": ["…"],            // optional — RAG context for hallucination checks
  "detection_config_id": "<id>",         // OR "detection_config": { … }
  "metadata": { … }                      // optional passthrough
}
```

### Response shape (normalized by Mozilla `any-guardrail` wrapper)

```json
{
  "result": {
    "flagged": false,
    "category_details": {
      "<category>": { "score": 0.12, "flagged": false, "…": "…" }
    }
  }
}
```

`valid = !result.flagged`. Categories advertised on Alinia's site include **compliance**, **accuracy** (hallucination/RAG), **safety**, **security** (prompt injection/jailbreak), **PII**, and **custom** guards.

### Actions Alinia supports (vendor-side)

Flagging, blocking, redacting, and reporting. Latitude MVP uses **flagging/reporting only** — we record what Alinia would have flagged; we do not block production traffic.

### Licensing note

Alinia is a commercial SaaS API (also on [AWS Marketplace](https://aws.amazon.com/marketplace/pp/prodview-bifp6ukatiwn4)). Latitude does **not** bundle Alinia — the customer supplies credentials (BYOK), consistent with the self-host / bring-your-own infra policy in `AGENTS.md`.

---

## Current Latitude state

| Area | Status |
| --- | --- |
| Alinia code / deps | **None** — no matches in the repo |
| `integrations` parent table | **Exists** — Slack + agent-dispatch kinds today |
| Encrypted credential storage | **Exists** — `LAT_MASTER_ENCRYPTION_KEY` + AES-256-GCM (Slack tokens, agent-dispatch keys) |
| Post-hoc trace analysis rail | **Exists** — `TracesIngested` → debounced `trace-end:run` → `signals:match` / flaggers / queues |
| Score persistence | **Exists** — canonical Postgres `scores` + ClickHouse analytics |
| OTLP `guardrail` operation type | **Exists** — OpenAI Agents SDK auto-instrumentation maps `agent.guardrail` spans; unrelated to Alinia |
| Evaluation `kind: "judge"` | **Exists** — Latitude-managed `llm()` judge; different cost model and no external guardrail categories |

**Conclusion:** Alinia is a net-new integration, but every primitive needed for MVP audit mode already exists. The work is a new `kind = "alinia"` integration + a thin HTTP adapter + a trace-end side effect that writes scores.

---

## Fit analysis

### What the issue asks for

> the user brings their Alinia API key, and can run the guardrails on every llm interaction like llm as judge, for auditing purposes after the fact. later we can integrate to let the guardrail block / allow interactions

| Requirement | Best Latitude hook | Notes |
| --- | --- | --- |
| User brings API key | `integrations` + encrypted `alinia_integration_details` | Same pattern as Slack / agent-dispatch |
| Run on every LLM interaction | Debounced `trace-end:run` fan-out | One scan per completed trace, not per span arrival |
| Like LLM-as-judge | Write **scores** anchored to `trace_id` / `session_id` | Reuse score UI, filters, issue drilldowns — do **not** invent a parallel "guardrail results" table |
| Auditing after the fact | Async worker, no ingest-path blocking | Aligns with live evaluations / flaggers |
| Later block/allow | **Deferred** — needs inline hook | See [Phase 2](#phase-2--inline-blockallow) |

### Approaches considered

| Approach | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **A. Dedicated Alinia integration worker** | Clear ownership, BYOK creds, maps 1:1 to vendor API, no sandbox changes | New queue topic + adapter | **Recommended MVP** |
| **B. Evaluation script calling Alinia via new `alinia()` sandbox primitive** | Reuses evaluation UI | Sandbox becomes non-portable; couples guardrails to evaluation lifecycle; awkward per-category scoring | Reject for MVP |
| **C. Reuse Latitude `llm()` judge evaluations** | Zero new infra | Uses Latitude-managed models/credits, not Alinia categories; wrong vendor | Reject |
| **D. Rely on client OTLP `guardrail` spans** | Already instrumented for OpenAI Agents | Requires customer to run Alinia client-side; doesn't satisfy "bring API key to Latitude" | Complement only, not substitute |

### Why not fold into evaluations?

Live evaluations are the right *shape* (debounced trace-end → async execute → score), but evaluations are **project-defined detectors** with scripts, alignment, and signal membership. Alinia is an **org-level vendor integration** with a fixed vendor response schema and BYOK billing. Mixing them would force every Alinia category through evaluation authoring UX and entangle Alinia scans with evaluation idempotency keys.

Instead, mirror the **evaluation execution rail** without inheriting the evaluation domain model.

---

## Recommended architecture

```
Customer connects Alinia (Settings → Integrations)
  → encrypted api_key + endpoint + detection_config_id stored on org

Production traces ingested (existing OTLP path)
  → TracesIngested
  → debounced trace-end:run
  → NEW: guardrails:scan (when org has active Alinia integration + project enabled)
       → load trace session conversation (same loader as evaluations)
       → POST Alinia Guard API (per enabled category or once with bundled config)
       → write canonical score row(s) per trace
       → optional: signal discovery on flagged categories (Phase 1.5)

UI: trace/session score panel shows Alinia category breakdown
```

**Package layout** (mirrors Slack / agent-dispatch):

| Layer | Package / location |
| --- | --- |
| Port + use-cases | `@domain/integrations` (extend) or `@domain/guardrails` if the surface grows beyond Alinia |
| HTTP adapter | `@platform/alinia` (new, MIT/Apache deps only — `fetch`, no vendor SDK required) |
| Repository | `@platform/db-postgres` — `alinia_integration_details` |
| Worker | `apps/workers/src/workers/guardrails-scan.ts` |
| Settings UI | extend `apps/web/.../settings/integrations` |

---

## Data model

Extend the existing vendor-agnostic parent:

```
latitude.integrations                       (parent — add kind = "alinia")
  id, organization_id, kind = "alinia",
  vendor_account_id = <alinia account id or endpoint host hash>,
  installed_by_user_id, installed_at, revoked_at, …

latitude.alinia_integration_details         (child — alinia-specific)
  integration_id (PK), organization_id (denorm for RLS),
  api_key (encrypted),
  endpoint (text — customer tenant URL),
  detection_config_id (text, nullable),
  detection_config (jsonb, nullable),       — inline overrides; one of id/config required
  enabled_categories (jsonb),               — e.g. ["safety","security","pii","compliance","accuracy"]
  scan_mode (text) = "input_output" | "conversation",
  ...timestamps
```

Per-project gate (lightweight — no new integration row):

```typescript
type ProjectSettings = {
  // existing fields…
  aliniaGuardrails?: {
    enabled: boolean
    sampling?: number // [0, 100], default 100 for MVP
    filter?: FilterSet // reuse shared trace filter registry; {} = all traces
  }
}
```

**Idempotency ledger** (recommended — mirror `slack_deliveries` / `agent_dispatches`):

```
latitude.alinia_scans
  id, organization_id, project_id, integration_id,
  trace_id, idempotency_key,           — UNIQUE (organization_id, trace_id, integration_id)
  claimed_at, completed_at, errored_at,
  raw_response (jsonb, nullable)       — optional debug; category details also land in score metadata
```

RLS: org-scoped on all tables. Encrypt `api_key` at the repository layer with `LAT_MASTER_ENCRYPTION_KEY`.

---

## Pipeline

### Trigger

Hook into the existing `trace-end:run` handler **after** trace load, in parallel with evaluation selection — same debounce boundary, same "trace is complete" semantics.

Gate chain (all must pass):

1. Org has active `integrations.kind = "alinia"` (not revoked)
2. `projects.settings.aliniaGuardrails.enabled = true`
3. Project sampling + `FilterSet` pass (reuse `selectTraceEndItemsUseCase` patterns)
4. Ledger claim succeeds (idempotent per trace)

### Execution

New queue topic:

```typescript
// @domain/queue topic registry
"guardrails": {
  scan: { organizationId, projectId, traceId, integrationId }
}
```

Worker responsibilities:

1. Load `ScriptSessionContext` via existing `loadScriptSessionContext` (`@domain/evaluations`)
2. Map to Alinia payload:
   - `scan_mode = "conversation"` → `messages` array from `session.conversation` (user/assistant turns; skip system if Alinia docs recommend)
   - `scan_mode = "input_output"` → last user input as `input`, last assistant output as `output`
   - attach `metadata`: `{ latitudeTraceId, latitudeSessionId, latitudeProjectId }`
3. Call `@platform/alinia` adapter (`Effect` + tagged errors: `auth`, `rate-limited`, `transport`, `invalid-config`)
4. For each flagged category (or one aggregate score — see [Score contract](#score-contract)), write canonical score
5. Mark ledger `completed_at`; on failure mark `errored_at` + write errored score

**Debounce / volume:** default `sampling: 100` is dangerous for high-traffic projects. MVP should ship with **100% in UI but document cost**, and reuse evaluation-style sampling knobs from day one.

### Failure policy

| Error | Action |
| --- | --- |
| 401 / invalid key | Ack + surface `needsReconnect` on integration record (Slack pattern) |
| 429 | Propagate — BullMQ retries with backoff |
| 5xx / network | Propagate — BullMQ retries |
| 4xx config | Ack — log + optional operator notification; don't poison the queue |

---

## Score contract

Use `source = "custom"` for MVP to avoid a migration on the `ScoreSource` enum. Namespace via `source_id`:

```
source     = "custom"
source_id  = "alinia:<category>"   // e.g. alinia:security, alinia:pii
```

Alternative (cleaner long-term, requires enum migration):

```typescript
type ScoreSource = "evaluation" | "annotation" | "custom" | "guardrail"
// source = "guardrail", source_id = "alinia:<category>"
```

**Per-trace scoring strategy (recommended):** one score row **per flagged category** plus optionally one aggregate `alinia:all` pass/fail row. Do not emit rows for clean categories — keeps score volume bounded.

| Field | Value |
| --- | --- |
| `value` | highest category score from Alinia, normalized `[0,1]` |
| `passed` | `!flagged` |
| `feedback` | human-readable summary, e.g. `"Alinia security: prompt injection pattern detected"` |
| `metadata` | `{ vendor: "alinia", category, categoryDetails, detectionConfigId, rawFlagged }` |
| `trace_id` / `session_id` | from triggering trace |
| `duration` / `cost` | wall time of HTTP call; `cost = 0` (customer pays Alinia directly) |

Idempotency: partial unique index on `(organization_id, project_id, source_id, trace_id)` already exists for evaluation scores — extend the same pattern for `source = "custom" AND source_id LIKE 'alinia:%'` or migrate to `guardrail` source.

**Signal discovery:** flagged Alinia scores with `passed = false` can enter the existing discovery pipeline (`assignOrCreateSignalUseCase`) if we add a project toggle `createSignalsFromAlinia: boolean` (default off for MVP to avoid alert storms).

---

## Configuration and UI

**Settings → Integrations** (alongside Slack):

1. **Connect Alinia** card — form fields: API key, endpoint URL, detection config (id or JSON), category checkboxes
2. **Test connection** button — server fn runs a minimal probe string against Alinia, shows success/failure without persisting a score
3. **Disconnect** — soft-revoke integration parent (`revoked_at`)
4. Per-project section under project settings (or integrations sub-panel): enable toggle, sampling slider, optional trace filter builder (reuse evaluation filter UI components)

**Trace / session UI:**

- Score chip: "Alinia · Security" with pass/fail color
- Expandable detail: category scores table from `metadata.categoryDetails`
- Link to Alinia dashboard (if vendor provides per-request deep links — TBD with Alinia)

**Feature flag:** `ALINIA_GUARDRAILS_FLAG = "alinia-guardrails"` — off by default for staged rollout.

---

## Phase 2 — inline block/allow

Not in MVP. Options ranked by feasibility:

| Option | Mechanism | Latency impact | Notes |
| --- | --- | --- | --- |
| **P2-A. Latitude AI gateway proxy** | Customer routes LLM calls through Latitude; we call Alinia pre/post | High — new product surface | Largest build; only path for true blocking without customer code changes |
| **P2-B. SDK middleware hook** | TS/Python SDK `beforeSend` / `afterReceive` calls Latitude edge endpoint that wraps Alinia | Medium | Requires SDK adoption; fits observability customers |
| **P2-C. Customer-side any-guardrail** | Document pattern; Latitude ingests OTLP `guardrail` spans | None on Latitude | Already partially supported via OpenAI Agents instrumentation |
| **P2-D. Webhook callback** | Alinia scan completes → Latitude webhook → customer app | Async only | Audit-only, not true block |

**Recommendation:** ship MVP audit mode first; validate customer demand; pursue **P2-B** (SDK hook calling a thin `/v1/guardrails/scan` sync endpoint) before a full proxy.

---

## Security, billing, and licensing

- **Tenancy:** all Redis keys `org:${organizationId}:alinia:…`; RLS on all new tables
- **Secrets:** API key encrypted at rest; never returned to browser after save (mask + rotate flow)
- **Latitude billing:** Alinia HTTP calls are **not** `live-eval-scan` credits — customer pays Alinia directly. Do not route through `@platform/ai-vercel`. Optionally track call count as observability metric only.
- **Dependency audit:** `@platform/alinia` should be `fetch` + Zod only — no AGPL / proprietary SDK in the bundle
- **Data residency:** conversation text leaves Latitude for Alinia's API — disclose in connect UI (same class as sending traces to any third-party LLM judge)

---

## Open questions

| # | Question | Owner | Blocks |
| --- | --- | --- | --- |
| Q1 | Exact Alinia OpenAPI / rate limits / pricing per call | Alinia / Gerard | Capacity planning |
| Q2 | Is `detection_config_id` per-org stable? Can one call scan all categories? | Alinia | Worker design (1 vs N HTTP calls per trace) |
| Q3 | Does Alinia return per-category thresholds we should map to `value`, or only boolean `flagged`? | Alinia | Score normalization |
| Q4 | RAG / `context_documents` — can we extract retrieval context from existing spans today? | Latitude eng | Accuracy guard usefulness |
| Q5 | Customer demand: audit-only vs block/allow timeline | Product | Phase 2 priority |
| Q6 | Should flagged Alinia results auto-create signals/issues? | Product | Default toggles |

---

## Decisions

- **D1 — BYOK vendor integration, not bundled.** Customer supplies Alinia credentials; Latitude stores them encrypted. No Alinia dependency in the OSS bundle beyond an optional adapter package.
- **D2 — MVP is post-hoc audit only.** No ingest-path blocking. Matches issue wording ("after the fact") and reuses `trace-end` debounce.
- **D3 — Scores are the audit artifact.** No parallel guardrail-results table. Reuse score UI, filters, and (optionally) signal discovery.
- **D4 — Mirror integrations pattern, not evaluations domain.** Org-level `kind = "alinia"` + per-project enablement/sampling/filter.
- **D5 — `source = "custom"` with `source_id = "alinia:<category>"` for MVP.** Migrate to `source = "guardrail"` when a second vendor appears.
- **D6 — Phase 2 block/allow via SDK sync endpoint, not AI proxy, unless product demands proxy.**

---

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 0 — Investigation (this PR)

- [x] **P0-1**: Document Alinia API contract and category model
- [x] **P0-2**: Map Latitude primitives (integrations, trace-end, scores, evaluations)
- [x] **P0-3**: Propose MVP architecture + Phase 2 options
- [x] **P0-4**: List open questions for Alinia + product

**Exit gate**: `specs/alinia-integration.md` reviewed; implementation phases below are actionable.

### Phase 1 — Connect + audit MVP

- [ ] **P1-1**: PG migration — `alinia_integration_details`, `alinia_scans`; extend `integrations.kind`; RLS
- [ ] **P1-2**: `@platform/alinia` HTTP adapter + response Zod schema + tagged errors
- [ ] **P1-3**: `@domain/integrations` — connect / disconnect / test / findActive use-cases + repository
- [ ] **P1-4**: `guardrails:scan` queue topic + worker; hook from `trace-end:run`
- [ ] **P1-5**: Score writer for Alinia results (`custom` / `alinia:<category>`)
- [ ] **P1-6**: Settings → Integrations UI (connect form, test, disconnect)
- [ ] **P1-7**: Project settings — enable + sampling + filter
- [ ] **P1-8**: Trace score panel — Alinia category detail
- [ ] **P1-9**: Feature flag `alinia-guardrails`
- [ ] **P1-10**: Tests — adapter (recorded fixtures), worker gate matrix, idempotent ledger, PGlite integration test

**Exit gate**: with Alinia sandbox credentials, a trace in a connected org produces Alinia score rows visible in the UI; reconnect banner on bad key; no double-scan on retry.

### Phase 1.5 — Reliability hooks (optional)

- [ ] **P1.5-1**: Project toggle — auto-create signals from flagged Alinia categories
- [ ] **P1.5-2**: Saved-search / issue filter presets for `source_id LIKE 'alinia:%'`
- [ ] **P1.5-3**: Dispatch / notification kind `alinia-guardrail-flagged` (mirror incident notifications)

### Phase 2 — Inline block/allow

- [ ] **P2-1**: Sync `POST /v1/.../guardrails/scan` endpoint (low-latency, no score persistence required)
- [ ] **P2-2**: TS SDK `guardrails` hook calling sync endpoint
- [ ] **P2-3**: Python SDK parity
- [ ] **P2-4**: Docs + example (any-guardrail / Alinia side-by-side)

**Exit gate**: customer can block or redact in their app using Latitude as the Alinia credential broker without storing the key client-side.
