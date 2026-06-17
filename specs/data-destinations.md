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

The universal delivery contract is **at-least-once + idempotent dedup at the destination**. PostHog specifically: events dedup on `(toDate(timestamp), event, distinct_id, uuid)` — a stable client-generated `uuid` per event makes retries and window re-runs safe. Cautionary tale: Langfuse's PostHog integration once flooded customer instances at ~18k events/sec (langfuse#12786) — per-destination throughput caps are a requirement, not a nicety. PostHog ingestion also bills the customer per event, so filters/sampling/payload exclusion per destination are product features.

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
- Per-destination payload exclusion (omit all user-content fields, not just prompt/completion), throughput caps, and failure quarantine.
- Gated behind a `destinations` feature flag. Sandbox/Test Mode organizations are excluded entirely.

## Decisions

- **Sync model: scheduled micro-batch pull, not per-event push.** A per-destination job runs on an interval (default 5 min), reads the spans window `(cursor, now − safety_lag]` from ClickHouse by `ingested_at`, maps, delivers, then advances the cursor. Rationale: (a) the ingest hot path stays untouched; (b) `spans` is a ReplacingMergeTree fed by `async_insert` — rows settle eventually, and a watermark with a safety lag reads settled data instead of racing merges; (c) `ingested_at` catches late-arriving spans that `start_time` would miss; (d) this is what the entire market ships (Langfuse hourly, LangSmith interval jobs, PostHog batch exports). A near-real-time per-event mode can be added later as a delivery mode on the same registry; it is not v1. **Caveat the cursor design must absorb:** `ingested_at` is stamped by `apps/ingest` at HTTP receipt (`ingest-spans.ts`), once per request batch — so (1) many spans share an identical millisecond, and (2) rows become visible in ClickHouse only after the ingestion queue/worker inserts them, so the safety lag must cover ingest-queue lag (not just merge settling) and ops must alarm when queue lag approaches the safety lag — a span that becomes visible behind the watermark is silently lost forever.
- **Read spans only; traces/sessions travel as properties.** `$ai_trace` events are emitted from root spans (`parent_span_id` empty) in the window; `$ai_session_id` mirrors our session semantics: `coalesce(session_id, trace_id)` — the same fallback `sessions_mv` applies since migration `00016_session_parity` (every trace belongs to a session; session-less traces are single-trace sessions keyed by their trace id). No reads from the `traces`/`sessions` aggregating tables (they're "correct after merges" and would need finalization; spans are the source of truth they derive from).
- **Idempotency: deterministic event UUIDs — and first-delivered-wins at the destination.** Event `uuid` = UUIDv5 of `(destination_id, span_id, event_name)`, with stable `timestamp`/`distinct_id`/`event` across retries. PostHog's sort-key dedup turns at-least-once into effectively-once. Spans are write-once in Latitude (the only writer is the ingest pipeline; there is no update path) — but OTLP clients are at-least-once, so a client retry re-inserts the same span with identical content and a newer `ingested_at`; it reappears in a later window, maps to identical events, and PostHog dedups it to a no-op. Degenerate input (instrumentation re-sending a `span_id` with *changed* content, which ingestion does not reject) is first-delivered-wins at the destination — accepted, not engineered around. Every future event-push adapter must define an equivalent deterministic identity; file-drop adapters get idempotency from deterministic object keys (window-addressed paths). **Caveat (verified 2026-06-18): PostHog's sort-key dedup is *eventual and partial*, not transactional** — it's an async ClickHouse merge on the order of hours (never guaranteed), so overlapping windows show **transient duplicate rows** (and inflated counts/cost) until it runs, and a residual fraction may never merge (UUID-uniqueness is best-effort). The trace view groups by `$ai_trace_id`, so trace counts don't inflate from duplicate event rows regardless. So the deterministic UUID is the safety net for *unavoidable* overlap (retries, resume gap-fills) — **not** a license to manufacture overlap. The coverage-bounded backfill decision below keeps overlap to that unavoidable minimum instead of re-exporting `[floor, now]` on every import.
- **The cursor is compound — `(ingested_at, span_id)` — and advances only after the whole window is delivered.** Because `ingested_at` is stamped once per ingest request batch, a timestamp-only cursor that stops mid-batch (cap hit, chunk boundary) would silently skip same-timestamp siblings. The window read orders by `(ingested_at, span_id)` and resumes strictly after the cursor pair. Cursor writes are optimistic (`UPDATE … WHERE` the cursor still equals the value the run started from), so a stale concurrent run can never move it backwards or double-advance. An empty window still advances the cursor to the window end (keeps idle projects cheap and lag observable). A retryable failure mid-window retries the whole window (safe via deterministic UUIDs) — a failed delivery never advances the cursor. When the per-run cap truncates a window (throughput decision), the run delivers the truncated window completely and advances the cursor to its end; the invariant is **the cursor only ever points at the end of fully delivered data**, not "windows are never split". No per-chunk bookkeeping.
- **Destinations are project-scoped, N per org, and die with their project.** The customer mental model is "this Latitude project → my PostHog project". Rows carry `organization_id + project_id`, unique on `(project_id, kind)` in v1 (relaxable later). A `ProjectDeleted` consumer deletes the project's destinations and sync runs (same cascade pattern as notifications; org purge emits `ProjectDeleted` per project, so it's covered too). Without the cascade the sweep would keep exporting residual ClickHouse data for a deleted project — spans outlive the Postgres row until CH cleanup, delivery keeps succeeding, and quarantine never triggers. We do **not** reuse the `integrations` parent table: its invariants (one active per org+kind, cross-org vendor-account exclusivity, OAuth token lifecycle) don't apply to write-key destinations. One `destinations` table with a kind-discriminated config; if a future destination needs OAuth-grade lifecycle, it gets its own details table then.
- **Config vs credentials split.** Destination-level non-secret config (`host`, `intervalMs`, event filters) is plain jsonb validated by a Zod discriminated union on `kind` in `@domain/destinations`; per-source non-secret config (payload exclusion, per-run cap) is a second source-discriminated union on `destination_sources.config`. Numeric knobs are bounds-validated — `intervalMs` 1–60 min (destination), `maxRecordsPerRun` 1k–50k (per source) — they are user input, not trusted constants. Secrets live in a single `credentials` text column: a kind-discriminated JSON object (Zod union, like `config`), AES-256-GCM-encrypted as a whole and decrypted at the repository boundary (same pattern as `slack_integration_details.bot_access_token`). The shape is per-kind — `{ apiKey }` for PostHog; a future destination can hold multiple secrets (`{ accessKeyId, secretAccessKey }`) or an entire service-account key file without schema or migration changes. Anything that needs querying or indexing is not a secret and belongs in `config`.
- **Custom host is an SSRF vector and is validated.** The worker POSTs to a user-supplied URL from inside our infrastructure, on a scheduler, with retries. Custom hosts must be `https://`, must resolve to public unicast IPs (re-validated at request time to defeat DNS rebinding, or routed through an egress proxy), and redirects are never followed. US/EU presets pin the official ingestion hosts `https://us.i.posthog.com` / `https://eu.i.posthog.com`.
- **Scheduling: BullMQ, not Temporal.** A run is a single-step batch job (read window → map → POST → advance cursor) — exactly the `monitors:sweepSavedSearchMonitors` shape. A repeatable `destinations:sweep` (every minute, `scheduleRepeatable` with stable key) selects due destinations by `last_run_at` (interval elapsed — `cursor_ingested_at` is a data watermark, not a schedule) and fans out `destinations:runSync` with `dedupeKey: destinations:runSync:${destinationId}`, so at most one run per destination is queued. The optimistic cursor write guards the residual race if a run outlives its dedupe window. Temporal would buy nothing here; backfills are just enqueued historical windows.
- **Failure policy: quarantine on chronic failure of any kind (like PostHog CDP).** Transport/5xx/429 → job fails and BullMQ retries with exponential backoff, cursor untouched. 401/invalid-key → non-retryable, fails the run immediately. Both terminal outcomes count: a run that ends non-retryable **or exhausts BullMQ retries** increments `consecutive_failures`; at N (default 5) the destination is quarantined (`status = 'quarantined'`) and stops being scheduled — a decommissioned self-hosted PostHog must not retry forever. Surfaced in settings UI (Phase 2 adds a notification). Editing credentials or host resets the counter and re-activates. Stored failure messages are sanitized: HTTP status + our own error taxonomy, never raw response bodies (they can echo span payloads back into Postgres).
- **Throughput caps — and the ceiling they define.** The per-run cap counts **spans read** (default 50k; events are derived, and a root span's two events are never split across runs or chunks). Delivery is chunked (500 events per `/batch/` POST, 20 MB guard). If a window exceeds the cap, deliver the cap, advance the compound cursor to the last delivered span, and let the next run continue — graceful catch-up instead of a Langfuse-style flood. This makes cap/interval the **maximum sustained rate** (50k spans / 5 min ≈ 166 spans/s per destination); a project persistently above it falls behind monotonically — Phase 3 adds the lag alarm. Catch-up windows reach the adapter with their window as delivery context; the PostHog adapter flags windows ending >48h ago as `historical_migration: true` (its own rule — PostHog requires ≥48h-old timestamps for it) so a resumed or long-quarantined destination doesn't trip spike detection; younger backlog is delivered live.
- **Oversized events are truncated, then dropped — never wedged on.** A span with multi-MB `input_messages` can exceed PostHog's per-event ingestion limit; since the cursor only advances past delivered windows, one such span would otherwise poison its window and freeze the destination forever. Policy: an event over the per-event limit gets its content properties truncated with an explicit `latitude_truncated: true` marker; if still oversized, the event is dropped and counted (`events_dropped` on the sync run). The cursor always advances.
- **Payload exclusion default: payloads ON, toggle OFF per source — and the toggle covers *all* user content.** `excludePayloads` (a per-source config field) nulls every content-bearing property in one pass: `$ai_input`, `$ai_output_choices`, `$ai_input_state`, `$ai_output_state`, `$ai_tools` (tool schemas are customer IP), and replaces `$ai_error` with the span's `error_type` only (provider error messages routinely quote prompt content). Tokens, costs, latency, model/provider, ids and timing always flow. The mapper derives an excluded-property set of names from config and nulls them in a single pass — per-field granularity later is a config-only change (an optional `exclude: { input?, output?, tools? }` object can supersede the boolean without migration). Default sends payloads (that's the product value), but the toggle exists from day one because it's a compliance blocker for some customers (precedent: Helicone `includeData`, LangSmith `export_fields`). (This is field *exclusion* — choosing not to send whole parts of the payload — not PII *redaction*, which scrubs sensitive substrings from within fields.)
- **`distinct_id` mapping**: the span's end-user identifier when present (the same attribute the `sessions` MV aggregates into `user_id`); otherwise fall back to `trace_id` with `$process_person_profile: false` so anonymous traffic doesn't mint PostHog persons (each costs the customer money). Resolution is per span: a trace where only some spans carry the user attribute mixes person-attributed and anonymous events — acceptable v1 (PostHog groups the trace view by `$ai_trace_id`); revisit per-trace resolution if person analytics matter.
- **Backfill is coverage-bounded "re-run windows" (Phase 3 — implemented, LAT-681).** New destinations start at creation time and live advances the cursor *forward*; a backfill exports historical windows bounded *above* at **`coverage_start_at`** — the lower edge of what the source already covers — so it never re-sends the `[coverage_start_at, now]` range live already owns. `coverage_start_at` is a per-source watermark, the mirror of `watermark` (which is the upper/live edge): initialized to creation time, extended **leftward only** (`least(coverage_start_at, floor)`, monotonic — it never moves toward now), and advanced **only when the whole window chain drains**, so a partial failure never claims undelivered coverage (conservative; the chain carries its `coverage_floor` and the extend fires on the final, no-`next` window). `since` still clamps to the org retention floor; the realized window is `[clampedStart, coverage_start_at)`, which becomes empty — a no-op that writes **no sync-run row** — once you've reached the floor. **An absent upper bound ⇒ the use case declines to backfill** (it must never default to `now`, which would reintroduce the full live overlap). Two entry points share `backfillDestinationUseCase`: on-demand / create-time import (`requestDestinationBackfillUseCase` fans out one job per enabled source with `end = coverage_start_at`) and resume gap-fill (`end =` the resume instant — an *interior* hole, not a coverage extension, so `least` keeps `coverage_start_at` unchanged). The delivery context still drives vendor mechanics (PostHog `historical_migration: true` for windows ≥48h old; younger windows go live). **Reach** is the org's retention window (Free 30d / Pro 90d / Ent 365d, resolved via a `DestinationRetentionPolicy` port) — but reach is *not* the binding constraint; **resource footprint is.** A single backfill is a gentle one-window-in-flight drip, yet it can hold a worker slot + steady ClickHouse reads for **days** (a mid-tier org ≈ 5 days) with no fairness/priority budget today. The governance answer (P3-2) is a **budgeted low-priority backfill lane** (✅ shipped — separate `destinations-backfill` queue, concurrency 3) **+ a hard one-chain-per-source guard** (✅ shipped — `acquireBackfill` CAS) **+ a self-serve volume cap** (open product question), decoupled from reach (a Pro org still gets 90d, just paced). TTL data-loss is a narrow, **whale-only** risk — the oldest slice expires mid-migration only when `ingest_rate > backfill_throughput`; oldest-first processing + parallelized delivery keep all realistic tiers loss-free. Full analysis, the duration/footprint table, and the open product questions: [Backfill resource governance & throughput](#backfill-resource-governance--throughput).
- **Sandbox organizations are excluded.** Sandbox/Test Mode orgs cannot create destinations (rejected at the use-case boundary) and the sweep's due-selection filters them out — sandbox data never leaves the platform.
- **Idle projects back off automatically.** A project can stop sending traces while its destination stays configured (customer stopped using Latitude, kept the project) — without backoff we'd probe it every `intervalMs` forever. Every run that reads zero spans increments `consecutive_empty_runs` (reset by the first non-empty run); the sweep's effective due-interval is `min(intervalMs × 2^consecutive_empty_runs, 60 min)`. A dead project converges to one cheap ClickHouse probe per hour; when it wakes, the first sync lands within the 60-min cap (plus safety lag) and cadence snaps back to `intervalMs`. Future refinement (not v1): a `TracesIngested` consumer that resets the backoff instantly on new data.
- **Adapter port shape — vendor backfill mechanics live in adapters, not the engine.** `@domain/destinations` defines the port; `@platform/<vendor>` implements it (email-transport pattern). v1 port: `DestinationDeliverer.deliver(events: DestinationEvent[], config, credentials, context: { window: { start, end } }) → Effect<DeliveredCount, DeliveryError>` where `DeliveryError` is tagged retryable/non-retryable. The `context` carries destination-agnostic delivery facts the engine already knows — the window being delivered, hence its age. Each adapter derives its own vendor mechanics from it: PostHog sets `historical_migration: true` when the window ends more than 48h ago (its rule, its flag), a future Mixpanel adapter would route old windows to `/import` instead of `/track` (its ~5-day rule), file-drop adapters ignore it (objects are window-addressed anyway). The engine never knows the words "historical" or "backfill". The worker holds a `Record<DestinationKind, DestinationDeliverer>` registry — exhaustive, TS-enforced, like the Slack notification renderer registry.
- **New platform package `@platform/data-destinations`** (`packages/platform/data-destinations`), separate from `@platform/analytics-posthog`. The existing package is internal product analytics (our key, env-config, fire-and-forget SDK client). The destination adapter is multi-tenant (customer keys per call), uses raw `fetch` against `/batch/` (no SDK client per tenant), and needs deterministic UUIDs + `historical_migration` control. Sharing code would couple two things that evolve independently. One package for all vendor adapters (`src/posthog/`, future `src/mixpanel/`, …), mirroring how `@platform/email-transport` implements the `@domain/email` port; a vendor splits out into a nested sibling package (`packages/platform/data-destinations/<vendor>` — the workspace glob is `packages/**`) only if its dependencies get heavy (e.g., a future S3 adapter pulling the AWS SDK).
- **Feature flag**: single `destinations` flag is the v1 gate, and it gates exactly one thing — **the settings UI**. Creation is **UI-only**: the flag-gated project-settings UI is the sole way a destination comes into existence (no public API/MCP/CLI creation surface — a deliberate, scoped exception to the "machine-facing by default" principle, because a customer write-key destination is an operator action, not an agent capability). The **sweep does not re-check the flag**: the runtime stop is `pause` (status `paused`), available both to the customer in settings and to an operator via backoffice, so there is no need to also gate the sweep on the flag. Consequence, by design: turning the flag off blocks new creation and hides the UI but does **not** halt already-created destinations — stopping a destination is a pause, not a flag flip. (Sandbox orgs are still excluded from the sweep — that exclusion lives in `listDue`, not the flag.) Plan gating (e.g., paid-only) is a follow-up product decision.
- **Sync-run audit table** (`destination_sync_runs`): one row per run with window, counts, status, error. Powers the settings UI ("last synced 3 min ago · 1,240 events") and debugging. Errors are recorded in two cheap places, not a separate error store: the sanitized `error` column on the run row (user-facing debugging in settings) and a structured worker log line per run for ops (metrics + Datadog alerting). Pruned after 30 days by a separate nightly `pruneSyncRuns` job (not the every-minute sweep — retention is coarse).

## Architecture

### Data flow

```
                       ┌──────────────────────────── every minute (scheduleRepeatable) ───┐
                       │ destinations:sweep                                               │
                       │   SELECT active destinations                                     │
                       │     WHERE last_run_at + interval·idle_backoff ≤ now              │
                       │     (status='active', org not sandbox)                           │
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
  4. events = mapper(kind).toEvents(spans, config)            — pure: excluded-property set, truncation/drop
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

**Run accounting: `events_sent ≈ spans_read + traces`.** Because the root-span row maps to *two* events (its own `$ai_generation`/`$ai_span` **plus** the `$ai_trace`), one event is emitted per span and one extra per root span — so `events_sent = spans_read + (root spans in the window)`. A full backfill of a project with 40,769 spans across 1,578 traces reports **40,769 records read / 42,347 events sent** (`40,769 + 1,578`), and that gap is exactly the trace count, not duplication. Two consequences worth stating because the run-history numbers surprise people: (1) "records read" counts **spans, not traces** — a project with "not many traces" still reads tens of thousands of spans (~26 spans/trace here); (2) a green `events_sent` only means PostHog's `/batch` returned 200, which it does for **any** write key regardless of project — it is **not** proof the events landed in the project you're viewing (see the false-success note under *Test connection* / credentials-reset-coverage). Verify arrival by event volume in the target PostHog project, never by the sent count alone.

**Backfilled events are dated to the span's original `end_time`, not the import time** — `timestamp = end_time`, so a trace that happened on May 30 lands in PostHog on May 30 regardless of when the backfill ran (this is the point of `historical_migration`). Consequence, and the single most common "my backfill didn't work" false alarm: PostHog's LLM/traces view defaults to a recent window, so a just-completed backfill of older history shows **nothing "today"** — the events are there, sitting at their historical position. Verify by widening the PostHog time filter to the **backfilled range** (the source's `end_time` span, which can be far behind the ClickHouse `ingested_at` that drove window selection — bulk/seeded data is ingested in seconds but spans weeks of real time). An empty recent view is expected, not a delivery failure.

Common properties: `$ai_trace_id`, `$ai_span_id`, `$ai_parent_id`, `$ai_span_name` (span `name`), `$ai_session_id` (`coalesce(session_id, trace_id)`, matching `sessions_mv` parity), `$ai_latency` (duration_ns → s), `$ai_provider`, `timestamp` = span `end_time`, `uuid` = UUIDv5(destination_id, span_id, event_name), `distinct_id` per the decision above. `properties.latitude_project_id` / `latitude_span_url` ride along for cross-linking back into Latitude; `latitude_truncated: true` marks events whose content was cut by the oversized-event policy. Traces whose root span never arrives simply emit no `$ai_trace` — PostHog's pseudo-trace grouping covers them.

### Tables

```text
destinations
  id                      cuid PK
  organization_id         cuid NOT NULL
  project_id              cuid NOT NULL
  kind                    varchar(64) NOT NULL      -- 'posthog' | (future) 'webhook' | 's3_parquet' | ...
  name                    text NOT NULL             -- display name
  config                  jsonb NOT NULL            -- kind-discriminated, non-secret, destination-level only
                                                    --   (host, intervalMs) — bounds-validated. Per-source settings
                                                    --   (payload exclusion, per-run cap) live on destination_sources.
  credentials             text NOT NULL             -- AES-256-GCM encrypted, kind-discriminated JSON
                                                    --   ({ apiKey } for posthog; multi-secret / key-file for future kinds)
  status                  varchar(16) NOT NULL      -- 'active' | 'paused' | 'quarantined' (quarantine is destination-level)
  consecutive_failures    integer NOT NULL DEFAULT 0
  last_failure_message    text                       -- sanitized: status + taxonomy, never response bodies
  created_by_user_id      cuid NOT NULL
  ...timestamps()

  UNIQUE (project_id, kind)                          -- v1; relax if multi-destination-per-kind is needed
  index on (organization_id)
  RLS by organization_id
```

```text
destination_sources                                 -- one row per (destination, source); config + status + cursor
  organization_id         cuid NOT NULL              -- denormalized for RLS
  destination_id          cuid NOT NULL
  source                  varchar(32) NOT NULL       -- 'spans' | (future) 'scores' | 'issues' | ...
  status                  varchar(16) NOT NULL DEFAULT 'enabled'  -- 'enabled' | 'disabled' (disabled keeps cursor, skipped by sweep)
  config                  jsonb NOT NULL             -- source-discriminated per-source settings (excludePayloads, maxRecordsPerRun)
  watermark               tzTimestamp NOT NULL       -- cursor high-water mark (upper/live edge); initialized to created_at
  watermark_id            varchar(32) NOT NULL DEFAULT ''  -- compound-cursor tie-breaker (spans: span_id)
  coverage_start_at       tzTimestamp NOT NULL DEFAULT now()  -- lower edge of coverage; backfill upper bound. Init = created_at;
                                                    --   extended leftward only (least), advanced when a backfill chain fully drains.
  backfill_started_at     tzTimestamp               -- set while a backfill chain is in flight, cleared on completion/terminal failure;
                                                    --   NULL = none. Surfaced as DestinationRecord.backfillInProgress for the UI guard.
  last_run_at             tzTimestamp               -- sweep due-selection; NULL = never ran
  consecutive_empty_runs  integer NOT NULL DEFAULT 0 -- idle backoff: effective interval = min(interval × 2^n, 60min)
  ...timestamps()

  PRIMARY KEY (destination_id, source)
  index on (last_run_at)                             -- sweep due-selection
  RLS by organization_id

  -- cursor advance is optimistic: UPDATE ... WHERE watermark/watermark_id
  -- still equal the values the run started from
```

```text
destination_sync_runs
  id                      cuid PK
  organization_id         cuid NOT NULL              -- denormalized for RLS
  destination_id          cuid NOT NULL
  source                  varchar(32) NOT NULL       -- which source produced this run
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
  RLS by organization_id                             -- pruned >30d by the nightly pruneSyncRuns job
```

No FKs, app-layer integrity, per platform rule.

### Code layout

| Package / app | Responsibility |
| --- | --- |
| `packages/domain/destinations` | `Destination` entity (Zod, kind-discriminated config + credentials schemas, bounds + host validation), `DestinationRepository` + `DestinationSyncRunRepository` ports, `DestinationDeliverer` port, **pure mappers per kind** (`mappers/posthog.ts`: spans → `$ai_*` events, deterministic UUIDs, excluded-property set, truncation/drop), use cases: `createDestination` (rejects sandbox orgs), `updateDestination`, `pauseDestination`, `resumeDestination` (status back to `active`; for a source whose paused gap reached past the historical boundary it advances the live cursor to `now` **and enqueues the gap backfill itself** — the engine owns the gap, not a dismissible UI prompt), `requestDestinationBackfill` (fan-out per enabled source, bounded at `coverage_start_at`), `deleteDestination`, `deleteProjectDestinations` (`ProjectDeleted` cascade), `runDestinationSync` (window math, compound-cursor CAS advance, failure/quarantine policy, idle backoff), `testDestinationConnection` |
| `packages/platform/data-destinations` (`src/posthog/`) | `PosthogDeliverer` adapter: chunked `fetch` POSTs to `{host}/batch/`, 20 MB + per-event size guards, retryable/non-retryable error mapping (5xx/429 vs 401), `historical_migration` derived from the delivery-context window (48h rule lives here), SSRF guard on custom hosts (https, public-IP resolution, no redirects) |
| `packages/platform/db-postgres` | `schema/destinations.ts`, `schema/destination-sync-runs.ts`, repository adapters (credentials encrypt/decrypt at the mapper boundary, optimistic cursor update) |
| `packages/platform/db-clickhouse` | `SpanRepository.listByIngestedAtWindow(orgId, projectId, cursor, windowEnd, limit)` — settled-row read (`LIMIT 1 BY span_id`, `ORDER BY (ingested_at, span_id)`, strictly after the compound cursor) |
| `packages/domain/queue` | New topic `destinations`: `sweep` (repeatable) + `runSync` (`{ organizationId, projectId, destinationId }`) |
| `apps/workers/src/workers/destinations.ts` | Sweep handler (due-selection by `last_run_at`, sandbox exclusion via `listDue`, fan-out), nightly `pruneSyncRuns` handler (audit-row retention GC), and runSync handler (deliverer registry, wiring of ClickHouse + Postgres layers, exhausted-retry failure accounting); `ProjectDeleted` consumer for the destinations cascade |
| `apps/web` project settings → integrations | Destination cards: create/edit form (kind picker — v1 only PostHog: host select US/EU/custom + API key + exclude-payloads toggle), status + last-run info, pause/resume/delete, "Test connection" |

### Extensibility map (not v1, but the registry must not preclude them)

- **More event-push destinations**: Mixpanel, Amplitude, generic webhook — new mapper + deliverer + config schema; engine unchanged.
- **File-drop destinations**: S3/GCS Parquet, Hive-partitioned (`project/date/`) — same cursor/window engine; the deliverer writes objects instead of POSTing (potentially `INSERT INTO FUNCTION s3(...)` straight from ClickHouse). Iceberg commit-frequency limits fit this batch cadence. This is the real "data lake" answer for warehouse-minded customers and the most-shipped pattern among competitors (LangSmith, Braintrust, Langfuse).
- **More sources**: scores → PostHog custom events (Langfuse precedent: their score export), issues/behaviours → webhook or upsert. A source contributes `(read window, map)` and reuses cursor + delivery — **but only if it satisfies the source contract below.** v1 spans satisfy it trivially; mutable sources do not without changes.
- **OTLP forwarding**: revisit when OTel GenAI semconv stabilizes; today no vendor ships it for stored traces.

### Source contract — append-only vs mutable sources (Phase 4 design)

The v1 engine is built on spans' three properties: **append-only, immutable, write-once.** The cursor/window/scheduling/quarantine/idle-backoff machinery is source-agnostic and stays untouched for any new source. Two things are span-specific and must generalize per-source: the **read/identity contract** and **delete handling**. A source may feed a destination only if it presents as a **monotonic-watermark change-log**:

- **Watermark.** The cursor generalizes from `ingested_at` to any monotonic per-row column. Mutable sources use **`updated_at`**: a row whose `updated_at` advances re-enters a later window and re-delivers. (Issues already carry `updatedAt` via `timestamps()`.)
- **Deletes ⇒ soft-delete is mandatory.** A watermark sweep is blind to a hard delete — the row is gone, nothing re-enters any window. So any mutable source that feeds a destination **must be soft-deleted** (`deletedAt`), turning a delete into a tombstone update the watermark catches. **Reconciliation/snapshot-diff is explicitly rejected** (stateful, expensive, doesn't fit the cheap cursor model). **Prerequisite, not a destinations task:** `issues` is *hard-deleted today* (`schema/issues.ts`: "Issues are not soft-deleted") — exporting issues requires a source-side soft-delete migration first, upstream of this engine.
- **Idempotency becomes version-aware.** The span trick (deterministic UUIDv5 + destination dedup) is *correct only because span content is immutable* — first-delivered-wins is harmless. It is **wrong** for a mutable entity (it would dedup the update away). Mutable sources pick one of two shapes, a `(source × destination)` decision that lives in the mapper/deliverer, never the engine:
  - **Event-sourced projection** — emit `created/updated/resolved/deleted` as distinct append-only events keyed by `(entity_id, updated_at)`; the destination stays append-only and the consumer folds to current state. Fits PostHog events, webhooks, S3.
  - **Entity upsert** — map to a last-write-wins primitive: PostHog person/group `$set`, webhook `PUT`, warehouse `MERGE`, S3 overwrite-by-key.
- **Deliverer port generalizes** from `deliver(events)` to a typed **change-set**: `deliver(Array<{ op: 'upsert' | 'delete', … }>)`. Spans always emit `upsert`/append (existing dedup → effectively-once); mutable sources emit upsert/delete and each adapter translates `delete` to its primitive. Per-destination delete capability varies and some destinations cannot purge: PostHog can't delete events (emit a `deleted: true` state event or use the heavy person/event-deletion API), webhook = `DELETE`, file-drop = rewrite partition / delete-marker. Append-only event capture can only emit a tombstone and rely on the consumer to honor it — a documented per-destination limitation.

**Scheduling & state — per source, with destination-level quarantine.** Going multi-source changes the *unit* of three things, while the sweep/prune topology stays a single timer each:

- **`runSync` is per `(destination, source)`.** The sweep fans out one job per due source, `dedupeKey: destinations:runSync:${destinationId}:${source}`, so sources progress concurrently with independent caps/intervals and a stuck source never blocks another. This maps 1:1 onto today's single-window engine (parameterize by source: swap the read port, cursor key, mapper) — no loop-over-sources, no multi-cursor run.
- **Per-source state moves out of the `destinations` row into `destination_sources`** — one row per `(destination_id, source)` holding the per-source `config` (source-discriminated: `excludePayloads`, `maxRecordsPerRun`), `status` (`enabled`/`disabled`), `watermark` (+ tie-breaker id), `last_run_at`, and `consecutive_empty_runs`. The cursor columns that were inline span-only on `destinations` are extracted, and `excludePayloads`/`maxSpansPerRun` move off the destination `config` into the per-source `config` (renamed `maxRecordsPerRun`). **Enabling/disabling a source is a row's `status`, not a schema change** — `disabled` keeps the cursor and is skipped by the sweep, so re-enabling resumes where it left off.
- **The sweep stays a single, source-agnostic timer.** One every-minute `destinations:sweep` selects due **source rows** (join `destination_sources` → active, non-sandbox `destinations`; `status='enabled'`; per-row due predicate `last_run_at + intervalMs·2^consecutive_empty_runs ≤ now`) and fans out. The minute tick is a heartbeat; per-source cadence is data in the row, not a separate timer. `destinations:prune` likewise stays one nightly GC.
- **Quarantine + credentials stay destination-level.** Credentials/host are shared across a destination's sources, so auth/host/transport failures are destination faults: they increment `consecutive_failures` on the `destinations` row and quarantine the destination (gating all its source jobs via `status='active'`). Source-specific faults (mapping error, oversized-drop) are per-run outcomes on that source's sync-run row and do **not** quarantine. `destination_sync_runs` gains a `source` column → one row per `(destination, source, run)`.

**Source selection & preview.** Which sources a destination can export is a **per-kind capability** — `DESTINATION_KIND_META[kind].supportedSources` — because it's semantic: PostHog's LLM-analytics model is span-granular (`$ai_*` derive from spans), so it takes `spans`, not whole traces/sessions; a future raw object-store sink could take coarser sources. The UI offers only the kind's supported sources and gates enable on them; it must stay in sync with the `(source × kind)` mapper registry. With one supported source the settings UI shows that source's config inline (no enable/disable switch — you can't disable the only source); enable/disable switches appear once a kind supports ≥2. A read-only **delivery preview** (`previewDestinationDelivery`: sample the source's latest record via the read port → map with the candidate per-source config → return the events) lets users see exactly what gets sent before saving; "No data yet" when the source is empty. Per-source config edits are saved **in the same transaction** as the destination row (`updateDestination` takes `sourceConfigs`), so the form never half-applies.

**Implementation sequencing.** Two halves, split by how speculative they are:

- **Read/cursor/scheduling generalization** (DestinationSource read port + generic mapper, `destination_sources` with per-source config + status, per-kind `supportedSources`, per-source `runSync`, single sweep over source rows, delivery preview) is useful for *any* second source — even another append-only one (scores) — and carries no delete/mutable assumptions. **Decision (2026-06-16): do this before QA**; **implemented 2026-06-17 (LAT-684 Half A)** so the engine is in its multi-source shape and QA validates the lasting structure once. Spans remain the sole wired source.
- **Change-set deliverer (`op: upsert|delete`) + version-aware idempotency + soft-delete tombstones** is the genuinely mutable-source half: the op vocabulary and projection-vs-upsert seams are unknowable until a delete-capable source exists, and it's blocked on the source's soft-delete migration regardless. It slots in additively (the read side doesn't change), so it **waits for the first mutable source (N=2)**. Until then the deliverer keeps `deliver(events[])`.

### Backfill resource governance & throughput

The headline concern is **resource footprint**, not data loss or reach: *"we can't afford a backfill burning days of DB + worker compute … I don't think it's advisable to allow customers to kickstart a backfill that would take days of compute"* (Gerard). Two facts frame it: (1) **total compute is fixed** — a backfill is `rows × (read + map + POST)`; you can only make it *short-and-intense* or *long-and-gentle*, never cheap; (2) **a single backfill is already gentle** — a sequential chain, one window in flight per `(destination, source)` (~1k spans/s drip, not a spike). So the lever is **governance** (cap what one customer triggers; bound rate/concurrency so backfill never competes with live), not raw speed. Note the tension: making backfill *faster* (parallel POSTs) cuts duration but *raises* peak intensity — it front-loads the same cost, partly against the concern.

**What bounds the problem today (all shipped):**

- **Reach = the org's retention window** (Free 30d / Pro 90d / Ent 365d + overrides; 7d sandbox clamp), resolved via `DestinationRetentionPolicy`. Backfilling past it is pointless — those spans are already TTL-deleted. Nothing trusts a caller-supplied limit.
- **Coverage-bounded, windowed, paid-once** (LAT-681): a fixed range `[clampedStart, coverage_start_at)`, never chases `now`, runs once (`coverage_start_at` advances on drain → re-triggers are no-ops). `requestDestinationBackfillUseCase` skips any source already at the floor, and the UI only offers Backfill when `backfillAvailable` — no no-op compute.
- **A budgeted backfill lane** (LAT-682): `backfill` + `runBackfillWindow` run on a separate `destinations-backfill` queue at `concurrency 3`, while live sync stays on `destinations`. So backfill occupies **at most 3 worker slots cluster-wide, ever** — it can never starve live sync or other orgs. Per-org fairness is largely free (one window in flight per chain → a single-destination whale uses one slot); a true per-org budget is a later refinement only if multi-destination orgs prove a problem.
- **Hard one-chain-per-source guard** (LAT-682): `acquireBackfill` is an atomic CAS on `backfill_started_at` — a starting chain claims the marker only if none is running (null, or heartbeat stale per `DESTINATION_BACKFILL_STALE_MS` ⇒ wedged). A racing second trigger (two tabs, an API retry) loses the CAS and declines (`outcome: "in_progress"`). This replaces the earlier *advisory* marker. The card drives its "Backfilling… %/Cancel" UI off the polled freshness query (`refetchInterval` while in flight) so progress tracks live.
- **Failure is visible** (LAT-682): a backfill window writes a sync-run row only on success and never quarantines (a heavy backfill can't take down live sync). On terminal failure `recordBackfillFailureUseCase` writes a single `failed` `backfill` run row (surfaces in run history like a live failure) and clears the marker — so a dead chain no longer vanishes silently.

**Throughput model (napkin math, one destination).** Sequential chain; per window: read ≤ `maxRecordsPerRun` (50k) spans → map → sequential chunked POSTs (≤500 events/POST, ≤20 MB) → re-enqueue. events/span ≈ 1.8 (QA-confirmed); chunks/window ≈ 180; **POST round-trip ≈ 0.2s — an *estimate*, unmeasured, and the dominant term (36 of ~45s/window)**; window total ≈ 45s → **≈ 1,000 spans/s ≈ 86M spans/day** per destination (~6× the live sweep ceiling, since backfill re-enqueues immediately). The entire model rests on that POST-latency constant — at 0.4s every figure below doubles; **measuring it is the prerequisite to committing to any further mitigation (open Q1).**

| Client | spans/day | Plan | Total | Time @ ~1k/s | Footprint |
| --- | --- | --- | --- | --- | --- |
| Hobby | 50k | Free 30d | 1.5M | ~25 min | trivial |
| Small | 500k | Pro 90d | 45M | ~12.5 h | half a day, one slot |
| Medium | 5M | Pro 90d | 450M | **~5 days** | **mid-tier — the governance trigger** |
| Large | 50M | Ent 365d | 18.25B | ~211 days | a slot for months |
| Whale | 500M | Ent 365d | 182.5B | ~5.8 years | never converges |

Medium already costs ~5 days of a worker slot + steady CH reads, self-service one-click — that's why the lane (above) is the load-bearing fix, well before the enterprise tail. Egress is fine (~25k events/s spread across *different* customer PostHog projects, no per-project burst); the pain was always Latitude-side slot starvation, which the lane now caps.

**TTL race — real but whale-only.** Spans TTL-delete at `start_time + retention_days + 30`. The engine processes **oldest-first** (load-bearing — never reorder newest-first) and must outrun the deletion frontier (1 history-day/real-day). A slice is lost **iff `backfill_throughput < ingest_rate`** (the cursor covers `throughput/ingest_rate` history-days per real-day; `>1` ⇒ the gap only widens, nothing is lost — the 30-day grace is cushion, not a hard deadline). Medium (~17×) and Large (~1.7×) complete with no loss; **only the Whale tier (ingest > throughput) loses the tail.**

**Whale-tier duration improvements (future, behind the lane — not needed for correctness).** For the genuinely-doesn't-converge tiers: **parallelize chunk POSTs within a window** (~10×, contained to the PostHog adapter — lifts the TTL-loss threshold ~10× so even a whale clears it, but raises peak intensity so it *must* stay inside the lane budget) and **concurrent sub-range chains per destination** (linear speedup — only behind a per-org budget, else it's a starvation multiplier). Both are duration fixes for the whale TTL case; gate them on the open questions below.

**Open questions (product, not engineering):**

- **Q1 (blocking any further work):** re-measure real per-POST latency and events/span against a high-volume project — the whole model hinges on ~0.2s / ~1.8.
- **Q2 — self-serve volume cap:** what's the default cap for a one-click backfill (row budget / day cap / most-recent-N), above which it's paced-background or ops-gated rather than self-serve? Sized to what one lane slot can chew without competing with live.
- **Q3 — whale TTL / full-retention policy:** is full-retention backfill for enterprise whales a product promise, or "best-effort, most-recent-N with clear UI messaging"? (The parallel-POST improvement shrinks the set of clients this applies to.)
- **Q4:** is backfill concurrency a product knob (enterprise buys more lane) or a flat system budget?

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`
>
> **Status (2026-06-16)**: Phase 1 + Phase 2 land complete — the full engine (P1-1…P1-9) and the settings UI + CRUD + test-connection (P2-1/2/3) are merged. **P1-8** closed (flag registered; seed-CLI dropped as redundant once the UI shipped). **P2-4** descoped — quarantine surfacing + recovery already shipped in P2-2; only an optional `destination_quarantined` notification remains. Remaining: **P2-5** (cross-cutting tests), **P3-2** throughput, **P3-3** observability, **P3-4** docs. **(2026-06-18)** **P3-1** coverage-bounded backfill landed — `backfillDestinationUseCase` gains a nullable upper bound `end`, per-source `coverage_start_at` watermark (extended leftward on chain drain), `requestDestinationBackfillUseCase` fan-out, resume-owned gap backfill, and create-time import; verified live. Also documented: PostHog dedup (by `(uuid, timestamp, event, distinct_id)` via ReplacingMergeTree merges) is *eventual and partial* — on the order of hours, never guaranteed — and the trace view groups by `$ai_trace_id`, so trace counts don't inflate from duplicate event rows regardless. That's why backfill is coverage-bounded rather than dedup-reliant. **PostHog invalid-key behavior resolved (2026-06-16):** `/batch/` returns 200 for any key (delivery never quarantines on a bad key — fire-and-forget, accepted), while `/flags/?v=2` returns 401 (test-connection validates the key via that endpoint, cache-backed). Residual gap — a key revoked *after* creation stops delivering silently — is accepted; deferred fix is an hourly connection-revalidation sweep. Next step is an end-to-end QA pass ([`data-destinations-qa.md`](./data-destinations-qa.md)); no implementation blocker. **(2026-06-18, P3-2 governance)** Shipped the budgeted backfill lane (separate `destinations-backfill` queue, concurrency 3), the hard one-chain-per-source guard (`acquireBackfill` CAS — supersedes the advisory marker), terminal-failure visibility (`recordBackfillFailureUseCase` → `failed` backfill run row), and live card polling. The backfill-throughput analysis was **folded into this spec** ([Backfill resource governance & throughput](#backfill-resource-governance--throughput)) and the standalone `data-destinations-backfill-throughput.md` removed; the remaining P3-2 work is the open product questions (self-serve cap, whale full-retention policy, paid-concurrency knob) plus re-measuring the throughput constants. Also confirmed live on a 40.7k-span / 1.6k-trace project: run accounting is `events = spans + traces` (root spans emit an extra `$ai_trace`), and backfilled events carry the span's historical `end_time` as their PostHog `timestamp` (so they appear at their real date, not "today").

### Wave order (parallel execution plan)

Tasks grouped into waves; each wave's tasks are independent of each other (disjoint packages/files) and can run as parallel agents in separate worktrees branched from `development` after the previous wave merges. Critical path: P1-1 → P1-3 → P1-6 → P1-7 → P1-8.

| Wave | Tasks | Status |
| --- | --- | --- |
| 1 | **P1-1** (LAT-666), **P1-4** (LAT-667) | ✅ merged |
| 2 | **P1-2** (LAT-668), **P1-3** (LAT-669), **P1-5** (LAT-670) | ✅ merged |
| 3 | **P1-6** (LAT-671), **P1-9** (LAT-672), **P2-1** (LAT-674), **P2-3** (LAT-673) | ✅ merged |
| 4 | **P1-7** (LAT-675), **P2-2** (LAT-676) | ✅ merged |
| — | **QA gate** (no Linear issue yet) | ⬜ end-to-end QA pass before Phase 3 (PostHog 401 question resolved — see status note) |
| 5 | ~~**P1-8** (LAT-677)~~ done · ~~**P2-4** (LAT-678)~~ descoped → optional notification · **P3-3** (LAT-679) | ⬜ P3-3 observability remains |
| 6 | **P2-5** (LAT-680), ~~**P3-1** (LAT-681)~~ ✅ done, **P3-2** (LAT-682) 🟡 lane + guard + failure-visibility done | ⬜ tests · ✅ coverage-bounded backfill · 🟡 governance shipped, remainder is product Qs |
| 7 | **P3-4** (LAT-683) | ⬜ promote this spec to `dev-docs/` and delete it |

### Phase 1 — Sync engine + PostHog destination (flag-gated, no UI)

Goal: a destination row created via script/seed syncs a project's spans into a real PostHog project end-to-end; quarantine and retry behavior covered by tests.

- [x] **P1-1**: `packages/domain/destinations` — entity + kind-discriminated config/credentials Zod schemas (bounds on `intervalMs`/`maxSpansPerRun`; custom host: https-only, hostname shape), ports (`DestinationRepository`, `DestinationSyncRunRepository`, `DestinationDeliverer`), `DestinationId` brand in `@domain/shared/id.ts`, in-memory test doubles via `./testing`. `createDestination` rejects sandbox orgs.
- [x] **P1-2**: PostHog mapper in `@domain/destinations/mappers/posthog.ts` — pure spans→events: `$ai_generation`/`$ai_embedding`/`$ai_span` + `$ai_trace` from roots, deterministic UUIDv5, microcents→USD, `$ai_session_id = coalesce(session_id, trace_id)`, `distinct_id` fallback with `$process_person_profile: false`, excluded-property pass (`$ai_input`, `$ai_output_choices`, `$ai_input_state`, `$ai_output_state`, `$ai_tools`, `$ai_error`→`error_type`), oversized-event truncate-then-drop with `latitude_truncated` marker. Unit-tested against fixture spans (LLM call, tool span, root, error span, session-less trace, anonymous, payload-excluded, oversized).
- [x] **P1-3**: Postgres schema + migration (`destinations` incl. `cursor_span_id` + `last_run_at`, `destination_sync_runs` incl. `events_dropped`), repository adapters with credentials encrypt/decrypt round-trip and optimistic cursor update (PGlite tests: ciphertext ≠ plaintext, unique `(project_id, kind)` violation mapping, quarantine counter updates, CAS rejects stale cursor writes).
- [x] **P1-4**: `SpanRepository.listByIngestedAtWindow` in `@platform/db-clickhouse` — settled-row window read, ordered by `(ingested_at, span_id)` strictly after the compound cursor, limit + last `(ingested_at, span_id)` return for cursor advancement. chdb testkit tests incl. late-arrival inside the safety lag and a same-millisecond batch cut by the limit (no span skipped on resume).
- [x] **P1-5**: `@platform/data-destinations` (posthog adapter) — chunked `/batch/` delivery, 20 MB + per-event size guards (verify PostHog's current per-event cap), span-atomic chunking, retryable vs non-retryable error mapping, `historical_migration` derived from the delivery-context window (the 48h threshold is this adapter's rule, tested here), SSRF guard (https, public-IP resolution at request time, no redirects). Verify against a real PostHog project what an invalid `phc_` key returns on `/batch/` — the 401 assumption underpins quarantine and test-connection. Fetch-mocked tests (happy, 401, 429, oversized chunk split, private-IP host rejected, old window sets the flag).
- [x] **P1-6**: `runDestinationSyncUseCase` — window math (safety lag, retention clamp — never silently skip backlog: a resumed destination catches up via capped runs, max-spans carry-over via compound cursor), CAS cursor advance only after delivery (window end on empty window), consecutive-failure → quarantine policy incl. exhausted-retry accounting, idle-backoff counter (increment on empty run, reset on non-empty), window passed to the deliverer as delivery context (no vendor backfill logic in the engine), sync-run row writing (`events_dropped`, sanitized error). In-memory tests for every branch (empty window, cap hit mid same-timestamp batch, retryable mid-window, quarantine at N, stale CAS, backoff growth + reset).
- [x] **P1-7**: Queue topic `destinations` (`sweep`, `runSync`, nightly `pruneSyncRuns`) + `apps/workers/src/workers/destinations.ts` — repeatable sweep registration (stable key), due-selection by `last_run_at` with idle backoff, excluding sandbox orgs (via `listDue`), fan-out with dedupeKey; separate nightly `pruneSyncRuns` job for audit-row retention; runSync wiring of layers + deliverer registry. Error policy: throw on retryable (BullMQ backoff), ack on non-retryable; final-failure hook increments `consecutive_failures`.
- [x] **P1-8**: `destinations` feature flag registered (off). ~~Local-dev-only seed/CLI path to create a destination~~ — dropped: the settings UI (P2-2) is now the creation surface, so the dev-scaffolding seed path is redundant. Flag lives in `@domain/feature-flags/registry.ts`.
- [x] **P1-9**: Deletion cascade — `ProjectDeleted` consumer deletes the project's destinations and sync runs (org purge emits `ProjectDeleted` per project, so it's covered). Test: deleting a project stops its sweep selection and removes rows.

**Exit gate**:

- With the flag on locally, ingesting spans into a project with a seeded PostHog destination lands `$ai_generation`/`$ai_span`/`$ai_trace` events in PostHog LLM Analytics within ~2 sweep intervals; re-running the same window produces zero duplicates (verified by stable UUIDs).
- A capped run that cuts a same-`ingested_at` batch loses no spans on the next run (compound cursor).
- An invalid API key — and an unreachable host, after retries — quarantines the destination after N runs and stops scheduling it.
- Deleting the project deletes its destinations and stops the sync.
- Hot path untouched: no diffs under `apps/ingest` or the span-ingestion worker.

### Phase 2 — Settings UI + connection validation

Goal: an org member configures, monitors, pauses, and removes destinations from project settings.

- [x] **P2-1**: `testDestinationConnectionUseCase` — PostHog: POST a `$ai_metric`-free no-op/canary event (or validate via a minimal capture) and surface success/failure before saving. Known limits to document in the UI copy: `phc_` keys are write-only, so a *valid key for the wrong project* passes the test and silently sends data to that other project — the test proves reachability + key acceptance, not project identity; the canary event is visible in the customer's PostHog.
- [x] **P2-2**: Destination section in project settings → integrations: list cards (kind icon, name, status, last run summary from `destination_sync_runs`), create/edit modal (host US/EU/custom, API key, name, `excludePayloads` toggle), pause/resume, delete (hard delete; cursor history goes with it), "Test connection". Gated by the `destinations` flag. Forms follow `useForm` + `createFormSubmitHandler` + `fieldErrorsAsStrings`.
- [x] **P2-3**: Web-private server functions (`apps/web`) for CRUD + test-connection, org-scoped authz at the boundary. No public API/MCP creation surface — creation is UI-only by decision (see the feature-flag decision above).
- [~] **P2-4**: Quarantine surfacing — ~~card shows quarantined state + `last_failure_message`; editing credentials resets `consecutive_failures` and re-activates~~ (shipped in P2-2). Remaining (optional, low priority): a `destination_quarantined` notification kind via the notifications system.
- [ ] **P2-5**: Tests — CRUD use cases, test-connection mapping, UI form validation paths, **plus one end-to-end backfill integration test** (the acceptance criterion has no coverage today). Proposed shape: a single `apps/workers`-level test (PGlite + chdb testkit, real repos — no `vi.mock`) that (1) seeds a project with N spans across a known time range and an active PostHog destination, (2) drives the real chain — `requestDestinationBackfillUseCase` → drain `runBackfillWindowUseCase` to exhaustion against a **fake/stubbed `DestinationDeliverer`** that records calls (the PostHog HTTP boundary is already unit-tested in P1-5, so stub it here), and (3) asserts the invariants that matter: every span delivered exactly once (`events = spans + roots`, deterministic UUIDs, no dupes on re-run), `coverage_start_at` advanced to the floor only on full drain, the in-flight marker set then cleared, succeeded run rows written per window, and — drive one window through a delivery failure — a `failed` backfill run row written + marker cleared. Concurrency (lane cap, `acquireBackfill` guard) stays at the unit level; this test owns the read→map→deliver→cursor invariants end-to-end. Keep it one focused test, not a matrix — the branch matrix already lives in the use-case unit tests.

**Exit gate**:

- A user in Acme connects a real PostHog project from settings, sees "last synced … · N events" update, pauses/resumes, and a bad key shows quarantined with a clear re-connect path.

### Phase 3 — Backfill + hardening

Goal: existing data can be exported, and the engine is production-trustworthy under load.

- [x] **P3-1**: Backfill (coverage-bounded): `backfillDestinationUseCase` takes an explicit upper bound `end` (nullable — absent ⇒ declines, never runs unbounded to `now`) and enqueues historical windows `[clampedStart, end)`; `requestDestinationBackfillUseCase` fans out one job per **enabled** source with `end = coverage_start_at`. Per-source `coverage_start_at` watermark (migration adds the column, backfilled to `created_at`) is extended leftward on full chain drain (conservative — `coverage_floor` carried through the window chain, extend on the no-`next` window; no gap on partial failure). Resume enqueues its own gap backfill (`end =` resume instant). Adapters still derive vendor mechanics from the delivery context (PostHog `historical_migration`). UI: "import past traces since …" on create (`importHistory`/`importSince`) and on-demand Backfill (all enabled sources). Progress via sync runs. An **in-flight marker** (`backfill_started_at`, set when a real chain starts / cleared on completion + on terminal failure via the worker's `onFinalFailure`) surfaces as `DestinationRecord.backfillInProgress`; the UI disables the Backfill button ("Backfilling…") while a chain runs. The marker started **advisory** (button-disable only) — P3-2 later made it a hard concurrency lock via the `acquireBackfill` CAS. A no-op backfill (`outcome=empty`) never sets it, so the button correctly stays enabled when there's nothing to backfill. Verified live end-to-end (bound no-op, flip control, conservative auto-advance, marker set/clear).
- [~] **P3-2**: Backfill resource governance + throughput (binding concern: **footprint, not reach**). **Shipped:** budgeted low-priority backfill lane (separate `destinations-backfill` queue, concurrency 3 — backfill can never starve live sync); hard one-chain-per-source guard (`acquireBackfill` CAS, replacing the advisory marker); terminal-failure visibility (`recordBackfillFailureUseCase` writes a `failed` backfill run row, so a dead chain shows in history instead of vanishing); live card polling (`refetchInterval` while in flight, off the freshness query). **Remaining** is mostly a product call (see [Backfill resource governance & throughput](#backfill-resource-governance--throughput) → open questions): re-measure the model constants (Q1, blocking — per-POST latency is the dominant, unmeasured term); self-serve volume cap (Q2); whale full-retention policy (Q3); paid-concurrency knob (Q4). **Whale-tier duration improvements** (future, behind the lane, not needed for correctness): parallelize chunk POSTs (~10×, lifts the TTL-loss threshold) and concurrent sub-range chains (only behind a per-org budget). TTL data-loss stays whale-only (`ingest > throughput`); keep oldest-first.
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
