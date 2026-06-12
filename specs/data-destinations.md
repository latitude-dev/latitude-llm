# Data destinations

> **Documentation (future)**: `dev-docs/data-destinations.md` once Phase 2 stabilizes.
> **Linear**: [LAT-665](https://linear.app/latitude/issue/LAT-665/posthog-integration)

## Context

A customer asked for a PostHog integration: they want their Latitude traces inside their own PostHog project. The real capability behind that ask is bigger than PostHog — it is **outbound synchronization of customer telemetry into customer-owned systems** (analytics tools, object storage, data lakes). PostHog is the first destination; the system must be extensible to others, and to data structures beyond spans/traces/sessions (scores, issues, …) later.

Today nothing pushes telemetry out of the platform. Exports are user-initiated CSV emails (`exports:generate`), the Slack integration delivers notifications (not data), and `@platform/analytics-posthog` is our own internal product analytics (write-only, env-configured, single-tenant — explicitly **not** the pattern to follow for customer-facing integrations).

### Industry survey (how the market ships this)

Researched Langfuse, LangSmith, Braintrust, Helicone, Arize Phoenix, Datadog LLM Obs, and PostHog's own CDP. The market splits cleanly into **two destination families**:

| Family | Who ships it | Mechanism |
| --- | --- | --- |
| **Event-push** | Langfuse→PostHog (hourly batch), Helicone→PostHog (per-request), PostHog CDP realtime destinations | Scheduled or streaming worker maps records to the destination's event schema and POSTs batches with the customer's write key. Retry + quarantine-on-chronic-failure. |
| **File-drop** | LangSmith (Parquet to customer S3, Hive-partitioned, recurring jobs), Braintrust (JSONL/Parquet automations), Langfuse (S3/GCS/Azure scheduled exports), PostHog batch exports (S3/BigQuery/Snowflake/…) | Scheduled job writes Parquet/JSONL windows into a customer-owned bucket. At-least-once; window re-run is the backfill primitive. |

Notable non-options: nobody forwards stored traces over OTLP (OTel GenAI semconv is still pre-stable in mid-2026; collector-side tee is the customer-side answer); nobody ships zero-copy warehouse shares; pull-API + Fivetran/Airbyte pushes orchestration onto customers and no LLM-obs vendor maintains first-party connectors.

The universal delivery contract is **at-least-once + idempotent dedup at the destination**. PostHog specifically: events dedup on `(toDate(timestamp), event, distinct_id, uuid)` — a stable client-generated `uuid` per event makes retries and window re-runs safe. Cautionary tale: Langfuse's PostHog integration once flooded customer instances at ~18k events/sec (langfuse#12786) — per-destination throughput caps are a requirement, not a nicety. PostHog ingestion also bills the customer per event, so filters/sampling/redaction per destination are product features.

### PostHog target schema (v1 destination)

Official docs: [LLM analytics overview](https://posthog.com/docs/llm-analytics), [manual capture (the `$ai_*` event schema)](https://posthog.com/docs/llm-analytics/manual-capture), [capture & batch API](https://posthog.com/docs/api/capture), [historical migrations](https://posthog.com/docs/migrate).

PostHog LLM Analytics consumes four native event types via `POST {host}/batch/` with the project API key (`phc_…`, public write-only) in the body. Ingestion hosts: `https://us.i.posthog.com` (US), `https://eu.i.posthog.com` (EU), or a self-hosted domain. Body limit 20 MB per batch (individual events have their own ingestion size limit — verify the current cap during implementation); no rate limit on capture; `historical_migration: true` flags backfills past spike detection and billing, and **requires event timestamps at least 48 hours old**:

- **`$ai_generation`** — one LLM call. Required: `$ai_trace_id`, `$ai_model`, `$ai_provider`, `$ai_input`, `$ai_input_tokens`, `$ai_output_choices`, `$ai_output_tokens`. Optional: `$ai_span_id`, `$ai_parent_id`, `$ai_span_name`, `$ai_session_id`, `$ai_latency`, `$ai_is_error`, `$ai_error`, cost props (`$ai_input_cost_usd`, …), cache-token props, `$ai_tools`.
- **`$ai_embedding`** — embedding call (same id/latency/cost props, `$ai_input` + `$ai_input_tokens`).
- **`$ai_span`** — non-LLM step (tool call, retrieval): `$ai_trace_id`, `$ai_input_state`, `$ai_output_state`, plus id/latency/error props.
- **`$ai_trace`** — root: `$ai_trace_id`, `$ai_input_state`, `$ai_output_state`, `$ai_session_id`.

Hierarchy is `$ai_trace_id` + `$ai_span_id`/`$ai_parent_id` — a 1:1 mapping from our OTel span model. **Sessions are not a separate event**: `$ai_session_id` is a property and PostHog groups on it. This resolves the open question in LAT-665 about "sending 3 entities": we read **only spans** from ClickHouse and the trace/session structure travels as properties. PostHog also auto-creates a pseudo-trace grouping from `$ai_generation`/`$ai_span` events that carry a `$ai_trace_id`, so partial traces (root span never ingested or sampled away) still render without an `$ai_trace` event.

## Goals

- An org member can connect a destination (v1: PostHog — host + project API key) to a Latitude project and have new spans/traces/sessions appear in their PostHog LLM Analytics within minutes, continuously.
- The engine is **destination-agnostic**: adding Mixpanel, generic webhook, or S3-Parquet file-drop later means a new adapter + config schema, not a new pipeline.
- The engine is **source-agnostic enough**: spans are the v1 source, but the cursor/window/delivery shape doesn't preclude scores or issues as future sources.
- Credentials encrypted at rest (existing AES-256-GCM helper, `LAT_MASTER_ENCRYPTION_KEY`).
- At-least-once delivery with deterministic idempotency — retries and window re-runs never duplicate data in the destination.
- The span-ingest hot path is untouched: zero latency or coupling added to `apps/ingest` or the span-ingestion worker.
- Per-destination redaction (exclude all user-content fields, not just prompt/completion), throughput caps, and failure quarantine.
- Gated behind a `destinations` feature flag. Sandbox/Test Mode organizations are excluded entirely.

## Decisions

- **Sync model: scheduled micro-batch pull, not per-event push.** A per-destination job runs on an interval (default 5 min), reads the spans window `(cursor, now − safety_lag]` from ClickHouse by `ingested_at`, maps, delivers, then advances the cursor. Rationale: (a) the ingest hot path stays untouched; (b) `spans` is a ReplacingMergeTree fed by `async_insert` — rows settle eventually, and a watermark with a safety lag reads settled data instead of racing merges; (c) `ingested_at` catches late-arriving spans that `start_time` would miss; (d) this is what the entire market ships (Langfuse hourly, LangSmith interval jobs, PostHog batch exports). A near-real-time per-event mode can be added later as a delivery mode on the same registry; it is not v1. **Caveat the cursor design must absorb:** `ingested_at` is stamped by `apps/ingest` at HTTP receipt (`ingest-spans.ts`), once per request batch — so (1) many spans share an identical millisecond, and (2) rows become visible in ClickHouse only after the ingestion queue/worker inserts them, so the safety lag must cover ingest-queue lag (not just merge settling) and ops must alarm when queue lag approaches the safety lag — a span that becomes visible behind the watermark is silently lost forever.
- **Read spans only; traces/sessions travel as properties.** `$ai_trace` events are emitted from root spans (`parent_span_id` empty) in the window; `$ai_session_id` mirrors our session semantics: `coalesce(session_id, trace_id)` — the same fallback `sessions_mv` applies since migration `00016_session_parity` (every trace belongs to a session; session-less traces are single-trace sessions keyed by their trace id). No reads from the `traces`/`sessions` aggregating tables (they're "correct after merges" and would need finalization; spans are the source of truth they derive from).
- **Idempotency: deterministic event UUIDs — and first-delivered-wins at the destination.** Event `uuid` = UUIDv5 of `(destination_id, span_id, event_name)`, with stable `timestamp`/`distinct_id`/`event` across retries. PostHog's sort-key dedup turns at-least-once into effectively-once. Spans are write-once in Latitude (the only writer is the ingest pipeline; there is no update path) — but OTLP clients are at-least-once, so a client retry re-inserts the same span with identical content and a newer `ingested_at`; it reappears in a later window, maps to identical events, and PostHog dedups it to a no-op. Degenerate input (instrumentation re-sending a `span_id` with *changed* content, which ingestion does not reject) is first-delivered-wins at the destination — accepted, not engineered around. Every future event-push adapter must define an equivalent deterministic identity; file-drop adapters get idempotency from deterministic object keys (window-addressed paths).
- **The cursor is compound — `(ingested_at, span_id)` — and advances only after the whole window is delivered.** Because `ingested_at` is stamped once per ingest request batch, a timestamp-only cursor that stops mid-batch (cap hit, chunk boundary) would silently skip same-timestamp siblings. The window read orders by `(ingested_at, span_id)` and resumes strictly after the cursor pair. Cursor writes are optimistic (`UPDATE … WHERE` the cursor still equals the value the run started from), so a stale concurrent run can never move it backwards or double-advance. An empty window still advances the cursor to the window end (keeps idle projects cheap and lag observable). A retryable failure mid-window retries the whole window (safe via deterministic UUIDs) — a failed delivery never advances the cursor. When the per-run cap truncates a window (throughput decision), the run delivers the truncated window completely and advances the cursor to its end; the invariant is **the cursor only ever points at the end of fully delivered data**, not "windows are never split". No per-chunk bookkeeping.
- **Destinations are project-scoped, N per org, and die with their project.** The customer mental model is "this Latitude project → my PostHog project". Rows carry `organization_id + project_id`, unique on `(project_id, kind)` in v1 (relaxable later). A `ProjectDeleted` consumer deletes the project's destinations and sync runs (same cascade pattern as notifications; org purge emits `ProjectDeleted` per project, so it's covered too). Without the cascade the sweep would keep exporting residual ClickHouse data for a deleted project — spans outlive the Postgres row until CH cleanup, delivery keeps succeeding, and quarantine never triggers. We do **not** reuse the `integrations` parent table: its invariants (one active per org+kind, cross-org vendor-account exclusivity, OAuth token lifecycle) don't apply to write-key destinations. One `destinations` table with a kind-discriminated config; if a future destination needs OAuth-grade lifecycle, it gets its own details table then.
- **Config vs credentials split.** Non-secret config (`host`, redaction flags, interval, event filters) is plain jsonb validated by a Zod discriminated union on `kind` in `@domain/destinations`. Numeric knobs are bounds-validated — `intervalMs` 1–60 min, `maxSpansPerRun` 1k–50k — they are user input, not trusted constants. Secrets live in a single `credentials` text column: a kind-discriminated JSON object (Zod union, like `config`), AES-256-GCM-encrypted as a whole and decrypted at the repository boundary (same pattern as `slack_integration_details.bot_access_token`). The shape is per-kind — `{ apiKey }` for PostHog; a future destination can hold multiple secrets (`{ accessKeyId, secretAccessKey }`) or an entire service-account key file without schema or migration changes. Anything that needs querying or indexing is not a secret and belongs in `config`.
- **Custom host is an SSRF vector and is validated.** The worker POSTs to a user-supplied URL from inside our infrastructure, on a scheduler, with retries. Custom hosts must be `https://`, must resolve to public unicast IPs (re-validated at request time to defeat DNS rebinding, or routed through an egress proxy), and redirects are never followed. US/EU presets pin the official ingestion hosts `https://us.i.posthog.com` / `https://eu.i.posthog.com`.
- **Scheduling: BullMQ, not Temporal.** A run is a single-step batch job (read window → map → POST → advance cursor) — exactly the `monitors:sweepSavedSearchMonitors` shape. A repeatable `destinations:sweep` (every minute, `scheduleRepeatable` with stable key) selects due destinations by `last_run_at` (interval elapsed — `cursor_ingested_at` is a data watermark, not a schedule) and fans out `destinations:runSync` with `dedupeKey: destinations:runSync:${destinationId}`, so at most one run per destination is queued. The optimistic cursor write guards the residual race if a run outlives its dedupe window. Temporal would buy nothing here; backfills are just enqueued historical windows.
- **Failure policy: quarantine on chronic failure of any kind (like PostHog CDP).** Transport/5xx/429 → job fails and BullMQ retries with exponential backoff, cursor untouched. 401/invalid-key → non-retryable, fails the run immediately. Both terminal outcomes count: a run that ends non-retryable **or exhausts BullMQ retries** increments `consecutive_failures`; at N (default 5) the destination is quarantined (`status = 'quarantined'`) and stops being scheduled — a decommissioned self-hosted PostHog must not retry forever. Surfaced in settings UI (Phase 2 adds a notification). Editing credentials or host resets the counter and re-activates. Stored failure messages are sanitized: HTTP status + our own error taxonomy, never raw response bodies (they can echo span payloads back into Postgres).
- **Throughput caps — and the ceiling they define.** The per-run cap counts **spans read** (default 50k; events are derived, and a root span's two events are never split across runs or chunks). Delivery is chunked (500 events per `/batch/` POST, 20 MB guard). If a window exceeds the cap, deliver the cap, advance the compound cursor to the last delivered span, and let the next run continue — graceful catch-up instead of a Langfuse-style flood. This makes cap/interval the **maximum sustained rate** (50k spans / 5 min ≈ 166 spans/s per destination); a project persistently above it falls behind monotonically — Phase 3 adds the lag alarm. Catch-up windows reach the adapter with their window as delivery context; the PostHog adapter flags windows ending >48h ago as `historical_migration: true` (its own rule — PostHog requires ≥48h-old timestamps for it) so a resumed or long-quarantined destination doesn't trip spike detection; younger backlog is delivered live.
- **Oversized events are truncated, then dropped — never wedged on.** A span with multi-MB `input_messages` can exceed PostHog's per-event ingestion limit; since the cursor only advances past delivered windows, one such span would otherwise poison its window and freeze the destination forever. Policy: an event over the per-event limit gets its content properties truncated with an explicit `latitude_truncated: true` marker; if still oversized, the event is dropped and counted (`events_dropped` on the sync run). The cursor always advances.
- **Redaction default: payloads ON, toggle OFF per destination — and the toggle covers *all* user content.** `excludePayloads` nulls every content-bearing property in one pass: `$ai_input`, `$ai_output_choices`, `$ai_input_state`, `$ai_output_state`, `$ai_tools` (tool schemas are customer IP), and replaces `$ai_error` with the span's `error_type` only (provider error messages routinely quote prompt content). Tokens, costs, latency, model/provider, ids and timing always flow. The mapper derives a redaction set of property names from config and nulls them in a single pass — per-field granularity later is a config-only change (an optional `redaction: { input?, output?, tools? }` object can supersede the boolean without migration). Default sends payloads (that's the product value), but the toggle exists from day one because it's a compliance blocker for some customers (precedent: Helicone `includeData`, LangSmith `export_fields`).
- **`distinct_id` mapping**: the span's end-user identifier when present (the same attribute the `sessions` MV aggregates into `user_id`); otherwise fall back to `trace_id` with `$process_person_profile: false` so anonymous traffic doesn't mint PostHog persons (each costs the customer money). Resolution is per span: a trace where only some spans carry the user attribute mixes person-attributed and anonymous events — acceptable v1 (PostHog groups the trace view by `$ai_trace_id`); revisit per-trace resolution if person analytics matter.
- **Backfill is "re-run windows", deferred to Phase 3.** New destinations start syncing from their creation time (cursor = now). Backfill = enqueue historical windows; the delivery context makes adapters apply their own backfill mechanics automatically (PostHog: `historical_migration: true`, valid only for events ≥48h old — younger windows go as live events). The mechanism is identical to a normal run, so v1 ships without it and Phase 3 adds the UI/use-case.
- **Sandbox organizations are excluded.** Sandbox/Test Mode orgs cannot create destinations (rejected at the use-case boundary) and the sweep's due-selection filters them out — sandbox data never leaves the platform.
- **Idle projects back off automatically.** A project can stop sending traces while its destination stays configured (customer stopped using Latitude, kept the project) — without backoff we'd probe it every `intervalMs` forever. Every run that reads zero spans increments `consecutive_empty_runs` (reset by the first non-empty run); the sweep's effective due-interval is `min(intervalMs × 2^consecutive_empty_runs, 60 min)`. A dead project converges to one cheap ClickHouse probe per hour; when it wakes, the first sync lands within the 60-min cap (plus safety lag) and cadence snaps back to `intervalMs`. Future refinement (not v1): a `TracesIngested` consumer that resets the backoff instantly on new data.
- **Adapter port shape — vendor backfill mechanics live in adapters, not the engine.** `@domain/destinations` defines the port; `@platform/<vendor>` implements it (email-transport pattern). v1 port: `DestinationDeliverer.deliver(events: DestinationEvent[], config, credentials, context: { window: { start, end } }) → Effect<DeliveredCount, DeliveryError>` where `DeliveryError` is tagged retryable/non-retryable. The `context` carries destination-agnostic delivery facts the engine already knows — the window being delivered, hence its age. Each adapter derives its own vendor mechanics from it: PostHog sets `historical_migration: true` when the window ends more than 48h ago (its rule, its flag), a future Mixpanel adapter would route old windows to `/import` instead of `/track` (its ~5-day rule), file-drop adapters ignore it (objects are window-addressed anyway). The engine never knows the words "historical" or "backfill". The worker holds a `Record<DestinationKind, DestinationDeliverer>` registry — exhaustive, TS-enforced, like the Slack notification renderer registry.
- **New platform package `@platform/data-destinations`** (`packages/platform/data-destinations`), separate from `@platform/analytics-posthog`. The existing package is internal product analytics (our key, env-config, fire-and-forget SDK client). The destination adapter is multi-tenant (customer keys per call), uses raw `fetch` against `/batch/` (no SDK client per tenant), and needs deterministic UUIDs + `historical_migration` control. Sharing code would couple two things that evolve independently. One package for all vendor adapters (`src/posthog/`, future `src/mixpanel/`, …), mirroring how `@platform/email-transport` implements the `@domain/email` port; a vendor splits out into a nested sibling package (`packages/platform/data-destinations/<vendor>` — the workspace glob is `packages/**`) only if its dependencies get heavy (e.g., a future S3 adapter pulling the AWS SDK).
- **Feature flag**: single `destinations` flag gates the settings UI and the sweep's destination selection. Plan gating (e.g., paid-only) is a follow-up product decision; the flag is the v1 gate.
- **Sync-run audit table** (`destination_sync_runs`): one row per run with window, counts, status, error. Powers the settings UI ("last synced 3 min ago · 1,240 events") and debugging. Errors are recorded in two cheap places, not a separate error store: the sanitized `error` column on the run row (user-facing debugging in settings) and a structured worker log line per run for ops (metrics + Datadog alerting). Pruned after 30 days by the sweep.

## Architecture

### Data flow

```
                       ┌──────────────────────────── every minute (scheduleRepeatable) ───┐
                       │ destinations:sweep                                               │
                       │   SELECT active destinations                                     │
                       │     WHERE last_run_at + interval·idle_backoff ≤ now              │
                       │     (flag on, org not sandbox)                                   │
                       │   → pub.publish("destinations", "runSync", { destinationId },    │
                       │       { dedupeKey: `destinations:runSync:${destinationId}` })    │
                       └──────────────────────────────────────────────────────────────────┘
                                                  │
                                                  ▼
apps/workers destinations worker — one run:
  1. load destination (Postgres, RLS) — skip unless status='active'
  2. window end = now − SAFETY_LAG(5min); cursor = (cursor_ingested_at, cursor_span_id)
  3. spans  = SpanRepository.listByIngestedAtWindow(orgId, projectId, cursor, windowEnd, limit)
              (LIMIT 1 BY span_id, ORDER BY (ingested_at, span_id), strictly after cursor pair)
  4. events = mapper(kind).toEvents(spans, config)            — pure: redaction set, truncation/drop
  5. delivered = deliverer(kind).deliver(events, config, credentials, { window })
              — chunked POSTs; adapter derives vendor backfill mechanics from window age
                (PostHog: historical_migration when window end older than its 48h rule)
  6. CAS-advance cursor to last delivered span (ingested_at, span_id) — window end if empty;
     update last_run_at + consecutive_empty_runs; write destination_sync_runs row
  on retryable error    → throw (BullMQ retry, cursor untouched);
                          exhausted retries count toward consecutive_failures
  on non-retryable error → record failure; consecutive_failures≥5 → status='quarantined'
```

### PostHog span→event mapping (v1)

| Latitude span | PostHog event | Notes |
| --- | --- | --- |
| span with LLM operation (`model` set, non-embedding) | `$ai_generation` | tokens, cache tokens, cost (microcents → USD), `$ai_tools` from `tool_definitions`, `$ai_error` from status |
| embedding-operation span | `$ai_embedding` | |
| any other span | `$ai_span` | `$ai_input_state`/`$ai_output_state` from tool/span IO |
| root span (`parent_span_id` empty), **additionally** | `$ai_trace` | `$ai_input_state`/`$ai_output_state` from root span messages |

Common properties: `$ai_trace_id`, `$ai_span_id`, `$ai_parent_id`, `$ai_span_name` (span `name`), `$ai_session_id` (`coalesce(session_id, trace_id)`, matching `sessions_mv` parity), `$ai_latency` (duration_ns → s), `$ai_provider`, `timestamp` = span `end_time`, `uuid` = UUIDv5(destination_id, span_id, event_name), `distinct_id` per the decision above. `properties.latitude_project_id` / `latitude_span_url` ride along for cross-linking back into Latitude; `latitude_truncated: true` marks events whose content was cut by the oversized-event policy. Traces whose root span never arrives simply emit no `$ai_trace` — PostHog's pseudo-trace grouping covers them.

### Tables

```text
destinations
  id                      cuid PK
  organization_id         cuid NOT NULL
  project_id              cuid NOT NULL
  kind                    varchar(64) NOT NULL      -- 'posthog' | (future) 'webhook' | 's3_parquet' | ...
  name                    text NOT NULL             -- display name
  config                  jsonb NOT NULL            -- kind-discriminated, non-secret (host, excludePayloads,
                                                    --   eventFilters, intervalMs, maxSpansPerRun) — bounds-validated
  credentials             text NOT NULL             -- AES-256-GCM encrypted, kind-discriminated JSON
                                                    --   ({ apiKey } for posthog; multi-secret / key-file for future kinds)
  status                  varchar(16) NOT NULL      -- 'active' | 'paused' | 'quarantined'
  consecutive_failures    integer NOT NULL DEFAULT 0
  last_failure_message    text                       -- sanitized: status + taxonomy, never response bodies
  cursor_ingested_at      tzTimestamp NOT NULL      -- watermark; initialized to created_at
  cursor_span_id          varchar(16) NOT NULL DEFAULT ''  -- compound-cursor tie-breaker within a millisecond
  last_run_at             tzTimestamp               -- sweep due-selection; NULL = never ran
  consecutive_empty_runs  integer NOT NULL DEFAULT 0 -- idle backoff: effective interval = min(interval × 2^n, 60min)
  created_by_user_id      cuid NOT NULL
  ...timestamps()

  UNIQUE (project_id, kind)                          -- v1; relax if multi-destination-per-kind is needed
  index on (organization_id)
  index on (status, last_run_at)                     -- sweep due-selection
  RLS by organization_id

  -- cursor advance is optimistic: UPDATE ... WHERE cursor_ingested_at/cursor_span_id
  -- still equal the values the run started from
```

```text
destination_sync_runs
  id                      cuid PK
  organization_id         cuid NOT NULL              -- denormalized for RLS
  destination_id          cuid NOT NULL
  window_start            tzTimestamp NOT NULL
  window_end              tzTimestamp NOT NULL
  status                  varchar(16) NOT NULL       -- 'succeeded' | 'failed'
  spans_read              integer NOT NULL
  events_sent             integer NOT NULL
  events_dropped          integer NOT NULL DEFAULT 0 -- oversized-event policy
  error                   text                       -- sanitized, see failure policy
  started_at              tzTimestamp NOT NULL
  finished_at             tzTimestamp NOT NULL
  ...timestamps()

  index on (destination_id, started_at)
  RLS by organization_id                             -- pruned >30d by the sweep
```

No FKs, app-layer integrity, per platform rule.

### Code layout

| Package / app | Responsibility |
| --- | --- |
| `packages/domain/destinations` | `Destination` entity (Zod, kind-discriminated config + credentials schemas, bounds + host validation), `DestinationRepository` + `DestinationSyncRunRepository` ports, `DestinationDeliverer` port, **pure mappers per kind** (`mappers/posthog.ts`: spans → `$ai_*` events, deterministic UUIDs, redaction set, truncation/drop), use cases: `createDestination` (rejects sandbox orgs), `updateDestination`, `pauseDestination`, `resumeDestination` (status back to `active`; cursor untouched, backlog catches up via capped runs), `deleteDestination`, `deleteProjectDestinations` (`ProjectDeleted` cascade), `runDestinationSync` (window math, compound-cursor CAS advance, failure/quarantine policy, idle backoff), `testDestinationConnection` |
| `packages/platform/data-destinations` (`src/posthog/`) | `PosthogDeliverer` adapter: chunked `fetch` POSTs to `{host}/batch/`, 20 MB + per-event size guards, retryable/non-retryable error mapping (5xx/429 vs 401), `historical_migration` derived from the delivery-context window (48h rule lives here), SSRF guard on custom hosts (https, public-IP resolution, no redirects) |
| `packages/platform/db-postgres` | `schema/destinations.ts`, `schema/destination-sync-runs.ts`, repository adapters (credentials encrypt/decrypt at the mapper boundary, optimistic cursor update) |
| `packages/platform/db-clickhouse` | `SpanRepository.listByIngestedAtWindow(orgId, projectId, cursor, windowEnd, limit)` — settled-row read (`LIMIT 1 BY span_id`, `ORDER BY (ingested_at, span_id)`, strictly after the compound cursor) |
| `packages/domain/queue` | New topic `destinations`: `sweep` (repeatable) + `runSync` (`{ organizationId, projectId, destinationId }`) |
| `apps/workers/src/workers/destinations.ts` | Sweep handler (due-selection by `last_run_at`, flag + sandbox exclusion, fan-out, runs pruning) and runSync handler (deliverer registry, wiring of ClickHouse + Postgres layers, exhausted-retry failure accounting); `ProjectDeleted` consumer for the destinations cascade |
| `apps/web` project settings → integrations | Destination cards: create/edit form (kind picker — v1 only PostHog: host select US/EU/custom + API key + redaction toggle), status + last-run info, pause/resume/delete, "Test connection" |

### Extensibility map (not v1, but the registry must not preclude them)

- **More event-push destinations**: Mixpanel, Amplitude, generic webhook — new mapper + deliverer + config schema; engine unchanged.
- **File-drop destinations**: S3/GCS Parquet, Hive-partitioned (`project/date/`) — same cursor/window engine; the deliverer writes objects instead of POSTing (potentially `INSERT INTO FUNCTION s3(...)` straight from ClickHouse). Iceberg commit-frequency limits fit this batch cadence. This is the real "data lake" answer for warehouse-minded customers and the most-shipped pattern among competitors (LangSmith, Braintrust, Langfuse).
- **More sources**: scores → PostHog custom events (Langfuse precedent: their score export), issues → webhook. A source contributes `(read window, map)` and reuses cursor + delivery.
- **OTLP forwarding**: revisit when OTel GenAI semconv stabilizes; today no vendor ships it for stored traces.

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 — Sync engine + PostHog destination (flag-gated, no UI)

Goal: a destination row created via script/seed syncs a project's spans into a real PostHog project end-to-end; quarantine and retry behavior covered by tests.

- [ ] **P1-1**: `packages/domain/destinations` — entity + kind-discriminated config/credentials Zod schemas (bounds on `intervalMs`/`maxSpansPerRun`; custom host: https-only, hostname shape), ports (`DestinationRepository`, `DestinationSyncRunRepository`, `DestinationDeliverer`), `DestinationId` brand in `@domain/shared/id.ts`, in-memory test doubles via `./testing`. `createDestination` rejects sandbox orgs.
- [ ] **P1-2**: PostHog mapper in `@domain/destinations/mappers/posthog.ts` — pure spans→events: `$ai_generation`/`$ai_embedding`/`$ai_span` + `$ai_trace` from roots, deterministic UUIDv5, microcents→USD, `$ai_session_id = coalesce(session_id, trace_id)`, `distinct_id` fallback with `$process_person_profile: false`, redaction-set pass (`$ai_input`, `$ai_output_choices`, `$ai_input_state`, `$ai_output_state`, `$ai_tools`, `$ai_error`→`error_type`), oversized-event truncate-then-drop with `latitude_truncated` marker. Unit-tested against fixture spans (LLM call, tool span, root, error span, session-less trace, anonymous, redacted, oversized).
- [ ] **P1-3**: Postgres schema + migration (`destinations` incl. `cursor_span_id` + `last_run_at`, `destination_sync_runs` incl. `events_dropped`), repository adapters with credentials encrypt/decrypt round-trip and optimistic cursor update (PGlite tests: ciphertext ≠ plaintext, unique `(project_id, kind)` violation mapping, quarantine counter updates, CAS rejects stale cursor writes).
- [x] **P1-4**: `SpanRepository.listByIngestedAtWindow` in `@platform/db-clickhouse` — settled-row window read, ordered by `(ingested_at, span_id)` strictly after the compound cursor, limit + last `(ingested_at, span_id)` return for cursor advancement. chdb testkit tests incl. late-arrival inside the safety lag and a same-millisecond batch cut by the limit (no span skipped on resume).
- [ ] **P1-5**: `@platform/data-destinations` (posthog adapter) — chunked `/batch/` delivery, 20 MB + per-event size guards (verify PostHog's current per-event cap), span-atomic chunking, retryable vs non-retryable error mapping, `historical_migration` derived from the delivery-context window (the 48h threshold is this adapter's rule, tested here), SSRF guard (https, public-IP resolution at request time, no redirects). Verify against a real PostHog project what an invalid `phc_` key returns on `/batch/` — the 401 assumption underpins quarantine and test-connection. Fetch-mocked tests (happy, 401, 429, oversized chunk split, private-IP host rejected, old window sets the flag).
- [ ] **P1-6**: `runDestinationSyncUseCase` — window math (safety lag, retention clamp — never silently skip backlog: a resumed destination catches up via capped runs, max-spans carry-over via compound cursor), CAS cursor advance only after delivery (window end on empty window), consecutive-failure → quarantine policy incl. exhausted-retry accounting, idle-backoff counter (increment on empty run, reset on non-empty), window passed to the deliverer as delivery context (no vendor backfill logic in the engine), sync-run row writing (`events_dropped`, sanitized error). In-memory tests for every branch (empty window, cap hit mid same-timestamp batch, retryable mid-window, quarantine at N, stale CAS, backoff growth + reset).
- [ ] **P1-7**: Queue topic `destinations` (`sweep`, `runSync`) + `apps/workers/src/workers/destinations.ts` — repeatable sweep registration (stable key), due-selection by `last_run_at` with idle backoff, excluding sandbox orgs and flag-off orgs, fan-out with dedupeKey, runs pruning; runSync wiring of layers + deliverer registry. Error policy: throw on retryable (BullMQ backoff), ack on non-retryable; final-failure hook increments `consecutive_failures`.
- [ ] **P1-8**: `destinations` feature flag registered (off). Seed/CLI path to create a destination for local smoke testing against a real PostHog project.
- [ ] **P1-9**: Deletion cascade — `ProjectDeleted` consumer deletes the project's destinations and sync runs (org purge emits `ProjectDeleted` per project, so it's covered). Test: deleting a project stops its sweep selection and removes rows.

**Exit gate**:

- With the flag on locally, ingesting spans into a project with a seeded PostHog destination lands `$ai_generation`/`$ai_span`/`$ai_trace` events in PostHog LLM Analytics within ~2 sweep intervals; re-running the same window produces zero duplicates (verified by stable UUIDs).
- A capped run that cuts a same-`ingested_at` batch loses no spans on the next run (compound cursor).
- An invalid API key — and an unreachable host, after retries — quarantines the destination after N runs and stops scheduling it.
- Deleting the project deletes its destinations and stops the sync.
- Hot path untouched: no diffs under `apps/ingest` or the span-ingestion worker.

### Phase 2 — Settings UI + connection validation

Goal: an org member configures, monitors, pauses, and removes destinations from project settings.

- [ ] **P2-1**: `testDestinationConnectionUseCase` — PostHog: POST a `$ai_metric`-free no-op/canary event (or validate via a minimal capture) and surface success/failure before saving. Known limits to document in the UI copy: `phc_` keys are write-only, so a *valid key for the wrong project* passes the test and silently sends data to that other project — the test proves reachability + key acceptance, not project identity; the canary event is visible in the customer's PostHog.
- [ ] **P2-2**: Destination section in project settings → integrations: list cards (kind icon, name, status, last run summary from `destination_sync_runs`), create/edit modal (host US/EU/custom, API key, name, `excludePayloads` toggle), pause/resume, delete (hard delete; cursor history goes with it), "Test connection". Gated by the `destinations` flag. Forms follow `useForm` + `createFormSubmitHandler` + `fieldErrorsAsStrings`.
- [ ] **P2-3**: API/server functions for CRUD + test-connection, org-scoped authz at the boundary.
- [ ] **P2-4**: Quarantine surfacing: card shows quarantined state + `last_failure_message`; editing credentials resets `consecutive_failures` and re-activates. (Optional, decide at impl time: a `destination_quarantined` notification kind via the notifications system.)
- [ ] **P2-5**: Tests — CRUD use cases, test-connection mapping, UI form validation paths.

**Exit gate**:

- A user in Acme connects a real PostHog project from settings, sees "last synced … · N events" update, pauses/resumes, and a bad key shows quarantined with a clear re-connect path.

### Phase 3 — Backfill + hardening

Goal: existing data can be exported, and the engine is production-trustworthy under load.

- [ ] **P3-1**: Backfill: `backfillDestinationUseCase` enqueues historical windows (bounded chunks); adapters apply their backfill mechanics from the delivery context (PostHog: `historical_migration: true`). UI offers "include history since …" on create or on demand. Progress visible via sync runs.
- [ ] **P3-2**: Throughput tuning: per-run caps + sweep cadence validated against a high-volume org; confirm graceful catch-up (no Langfuse-style burst), document the constants and the sustained-rate ceiling they imply (cap/interval).
- [ ] **P3-3**: Observability: worker metrics/log lines per run (spans read, events sent/dropped, lag = now − cursor), alarm path for destinations stuck >X behind, **and an alarm when span-ingestion queue lag approaches the safety lag** (spans becoming visible behind the watermark are lost to all destinations, silently).
- [ ] **P3-4**: Promote durable knowledge to `dev-docs/data-destinations.md`; delete this spec.

**Exit gate**:

- A new destination on a project with 30 days of history backfills completely, idempotently, without tripping PostHog spike detection or starving live sync.

### Phase 4 — Next destinations (future, unscheduled)

Directional only; each gets its own spec section when picked up:

- [ ] **P4-a**: Generic webhook destination (event-push family; same engine).
- [ ] **P4-b**: S3/GCS Parquet file-drop (Hive-partitioned, window-addressed object keys; evaluate `INSERT INTO FUNCTION s3` from ClickHouse vs worker-side Parquet writing).
- [ ] **P4-c**: Scores as a second source (PostHog custom events; Langfuse precedent).
- [ ] **P4-d**: OTLP forwarding — revisit once OTel GenAI semconv stabilizes.
