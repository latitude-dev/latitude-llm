# Observability platform migration tool

> **Spec only — no implementation.** Investigation + design for importing historical telemetry from Langfuse, LangSmith, or Braintrust into Latitude.
>
> **Origin:** LAT-721. Customer feedback from the Braintrust workshop (Manu): evaluators need a credible path to bring **historical** traces/sessions into Latitude, not just forward OTLP ingestion (Latitude already resolves `langfuse.*`, `langsmith.*`, and `braintrust.*` attributes on live spans).
>
> **Related:** OTLP attribute resolvers in `packages/domain/spans/src/otlp/resolvers/`; outbound sync design in `dev-docs/data-destinations.md` (inverse problem); session model in `packages/domain/spans/src/entities/session.ts` and CH MV `sessions_mv`.

## Contents

1. [Problem](#problem)
2. [Recommendation summary](#recommendation-summary)
3. [Source platform capabilities](#source-platform-capabilities)
4. [Latitude target model](#latitude-target-model)
5. [Entity mapping tables](#entity-mapping-tables)
6. [Product surface and UX](#product-surface-and-ux)
7. [Technical approach options](#technical-approach-options)
8. [Prioritization and phasing](#prioritization-and-phasing)
9. [MVP non-goals](#mvp-non-goals)
10. [Open questions](#open-questions)
11. [Implementation tasks](#implementation-tasks)

---

## Problem

Customers evaluating or leaving Langfuse, LangSmith, or Braintrust need to migrate **historical** observability data into Latitude. Forward ingestion already works: Latitude's OTLP pipeline resolves vendor session/user/tag/metadata attributes from live spans. What is missing is a **backfill path** for data already stored in another platform.

Without a migration tool, customers face a cold start: no session history, no cost baselines, no annotation/eval context, and weaker evaluation of Latitude against incumbents. A migration tool is a sales and retention enabler, not just an ops convenience.

Constraints:

- Historical imports must respect org/project tenancy, retention, and billing.
- Imports must be **idempotent** and **resumable** — migrations fail mid-run; customers re-run.
- Some vendor fields have no Latitude equivalent; the spec must define **degraded import** behavior explicitly.
- Latitude has **no prompt registry** entity; prompt migration is out of scope for parity unless we add one later.

---

## Recommendation summary

| Decision | Recommendation |
| --- | --- |
| First source platform | **Langfuse** — OSS/self-host path, richest export surface (blob + API), existing OTLP resolver coverage, and direct competitive overlap |
| MVP entity set | **Traces, spans, sessions, identity** (session id, user id/email, tags, metadata), **LLM usage/cost** where source provides it |
| Primary architecture | **Hybrid:** API pull for small/on-demand imports; **vendor blob/Parquet export → transform → internal bulk write** for production-scale backfills |
| Write path | **Internal span write path** (reuse `SpanRepository.insert` + domain validation), not OTLP HTTP roundtrip — avoids double-encoding and ingest rate limits |
| Product surface | **CLI** (`latitude migrate import …`) for engineers + **staff backoffice job** for assisted migrations; self-serve UI wizard deferred to Phase 2 |
| Session boundaries | **Import as-is** by default — preserve source `session_id`; optional re-segmentation by idle gap is post-MVP |
| Dedupe key | `(organization_id, project_id, source_platform, source_trace_id, source_span_id)` mapped to stable Latitude `trace_id` / `span_id` |

---

## Source platform capabilities

### Langfuse

#### Exportable entities

| Entity | Exportable? | Mechanism | Notes |
| --- | --- | --- | --- |
| Traces | Yes | Observations API v2 (group by `traceId`), legacy trace API, blob export (`traces/` legacy mode), UI batch export | v2 returns observation rows, not trace objects — reconstruct traces client-side |
| Spans / observations | Yes | Observations API v2, blob export (`observations_v2/` enriched mode recommended), legacy `observations/` | Types: `GENERATION`, `SPAN`, `EVENT` |
| Sessions | Yes (as field) | `sessionId` on observations / enriched export rows | No separate session table — session is a trace attribute |
| Scores / evals | Yes | Scores API, blob export (`scores/`), UI batch export (CSV/JSON) | Numeric/categorical scores; linked to trace/observation |
| Datasets | Yes | Datasets API (100–1000 req/min by plan) | Items + runs for experiments |
| Prompts / versions | Yes | Prompts GET API (no rate limit on cloud), Postgres on self-host | Versioned prompts with labels; stored in PG, not CH |
| Users | Partial | `userId`, `userId` on trace context in enriched exports | External user ids, not Langfuse auth users |
| Tags | Yes | `tags` in `trace_context` field group / trace rows | String array |
| Metadata | Yes | `metadata` field group; trace + observation level | JSON object |

#### Export mechanisms

| Mechanism | Scope | Format | Best for |
| --- | --- | --- | --- |
| **Observations API v2** | Row-level observations | JSON, cursor pagination | Programmatic pull, incremental sync |
| **Blob storage integration** | Scheduled bulk export | JSON/JSONL/CSV (optional gzip) to S3/GCS/Azure | Large backfills, warehouse-style pipelines |
| **Legacy read APIs** | Traces, observations, sessions | JSON, offset pagination | Deprecated; slow at scale |
| **UI batch export** | Scores, ad-hoc traces | CSV/JSON | Small one-offs |
| **Self-host DB access** | PG (config) + ClickHouse (telemetry) | SQL | Fastest for self-hosters with DB access; schema is Prisma-managed |

Blob export modes ([Langfuse docs](https://langfuse.com/docs/api-and-data-platform/features/blob-storage-export-fields)):

- **Enriched observations (recommended):** `observations_v2/` + `scores/` — trace-level fields (`user_id`, `session_id`, `tags`, etc.) denormalized onto each observation row. No warehouse join required.
- **Legacy:** separate `traces/`, `observations/`, `scores/` files — join on `trace_id`.

Schedule: every 20 minutes, hourly, daily, or weekly per integration.

#### Rate limits, pagination, retention

| Resource | Cloud limit (typical) | Pagination | Retention |
| --- | --- | --- | --- |
| Observations API v2 | "All other APIs" bucket: 30–1000 req/min by plan | Cursor-based; default limit 50, max 1000 | Plan-defined; Hobby/Core/Pro tiers differ |
| Legacy read APIs | 15–100 req/min | Offset (slow) | Same |
| Metrics API v2 | 100–2000 req/day | N/A (aggregates) | Same |
| Blob export | No per-request limit; bounded by export window size | Time-window files | Exports only cover data retained at export time |
| Self-host | No hard API limits | Same APIs | Customer-controlled |

v2 Observations API is **cloud-only** today; self-hosted deployments use legacy endpoints or direct DB/CH access until v2 lands.

Data from older SDKs without `x-langfuse-ingestion-version: 4` can be delayed up to **10 minutes** on v2 endpoints.

#### Lossiness and fidelity gaps

- v2 API returns I/O as **strings by default** (`parseIoAsJson: true` optional) — migration must handle both.
- `EVENT`-type observations may lack parent linkage or duration semantics Latitude expects.
- Prompt references (`promptId`, `promptName`, `promptVersion`) are metadata only — Latitude has no prompt entity to link.
- Media attachments (Langfuse media upload) are not in standard observation fields — may require separate media API or blob paths.
- Cost fields may use string decimals in v2 for precision.

#### Licensing / ToS

Langfuse is **MIT-licensed** OSS. Bulk export of a customer's own project data via API or self-host DB is standard data portability. Re-hosting Langfuse's **service** or redistributing their **software** is a separate concern from importing a customer's telemetry into Latitude. Cloud ToS should be reviewed before offering a managed "we pull your Langfuse cloud data" service; self-host and customer-initiated export paths are lower risk.

---

### LangSmith

#### Exportable entities

| Entity | Exportable? | Mechanism | Notes |
| --- | --- | --- | --- |
| Traces | Yes (as run trees) | `list_runs` / `POST /runs/query`, bulk export | Root run + child runs form a trace |
| Spans / runs | Yes | Same | `run_type`: chain, llm, tool, retriever, etc. |
| Sessions | Partial | `session_id` on runs is the **LangSmith project id**, not a conversation session | Conversation grouping uses `extra.metadata` or thread ids — see mapping table |
| Scores / feedback | Yes | Feedback API; `feedback_stats` in bulk export | Annotations and eval scores |
| Datasets | Yes | Dataset API | Examples + splits |
| Prompts | Yes | Hub / prompt API (separate from traces) | LangChain Hub prompts — not embedded in run export by default |
| Users | Partial | `extra.metadata.user_id`, session metadata | Inconsistent across SDKs |
| Tags | Yes | `tags` list on runs | |
| Metadata | Yes | `extra` JSON blob | Includes `ls_*` keys from LangChain |

#### Export mechanisms

| Mechanism | Scope | Format | Tier |
| --- | --- | --- | --- |
| **`list_runs` / runs query API** | Per-project runs | JSON, cursor pagination | All tiers (rate-limited) |
| **Bulk export to S3** | Project or all experiments, date range | Parquet (Run data format) | **Plus / Enterprise only** |
| **Scheduled bulk export** | Recurring windows | Parquet to customer bucket | Plus / Enterprise; Helm ≥ 0.10.42 self-host |
| **SDK export helpers** | Programmatic | JSON | All tiers |

Bulk export path pattern:

```
<bucket>/<prefix>/export_id=<id>/tenant_id=<id>/session_id=<project_id>/runs/year=…/month=…/day=…
```

#### Rate limits, pagination, retention

**Runs query API** ([LangSmith docs](https://docs.langchain.com/langsmith/export-traces)):

| Query type | Limit |
| --- | --- |
| Short window (≤ 7 days), no search | 10 req / 10 sec |
| Large window (> 7 days) | 3 req / 10 sec |
| Full-text search | 1–3 req / 10 sec |
| Select `child_run_ids` | Stricter tier |

Always set `start_time`; use `select` to limit fields; prefer structured filters over `search()`.

**Bulk export:**

- 72-hour runtime timeout per job; automatic retries.
- Cloud: 250 bulk export **creations** per hour per workspace; 200 active **scheduled** exports max.
- `all_experiments` exports capped at 250 experiments on cloud.
- Self-host: limits configurable / absent by default.

**Retention:** `trace_tier` on runs indicates retention level; expired traces are not exportable.

#### Lossiness and fidelity gaps

- LangSmith `session_id` in run export = **project UUID**, not conversation id — session migration requires extracting conversation keys from `extra` or metadata.
- `dotted_order` encodes hierarchy but parent links also via `parent_run_id`.
- Bulk export `feedback_stats` omits non-string feedback value breakdowns — numeric/boolean feedback needs separate feedback export.
- Experiments vs production traces use the same run format but different project/session scoping.

#### Licensing / ToS

LangSmith is a commercial LangChain product. Bulk export requires **Plus/Enterprise** for the S3 path; API read access is broader but rate-limited. A Latitude migration tool that asks customers to provide their own API keys and export to **their** bucket (or reads via API with consent) stays within normal data-portability expectations. Storing or re-selling LangSmith data is out of scope. Confirm current ToS before marketing "official LangSmith migration."

---

### Braintrust

#### Exportable entities

| Entity | Exportable? | Mechanism | Notes |
| --- | --- | --- | --- |
| Traces | Yes | BTQL `project_logs(…)` with `shape => 'traces'` | Trace = root span + children |
| Spans | Yes | BTQL `project_logs(…)` default / `log_spans` export | Nested via `span_id` / `root_span_id` |
| Sessions | Partial | Session-root span pattern in logs; metadata grouping | No first-class "session" entity — convention-based |
| Scores / evals | Yes | Scores API; BTQL on logs/experiments | Human annotations, automated scorers |
| Datasets | Yes | BTQL `project_dataset(project_id, dataset_id)` | input, expected, metadata |
| Prompts | Yes | Prompts API (`/v1/prompt`) | Version-controlled prompt registry |
| Users | Partial | `metadata.user_id` and related fields | |
| Tags | Yes | `tags` array on logs | |
| Metadata | Yes | `metadata` JSON | Also `braintrust.metadata` OTLP on live ingest |

#### Export mechanisms

| Mechanism | Scope | Format |
| --- | --- | --- |
| **BTQL API** (`POST /btql`) |任意 query | JSON or Parquet |
| **UI export** | Filtered logs view | JSON or CSV |
| **Cloud storage automation** | Scheduled `log_traces` or `log_spans` | JSON Lines or Parquet to S3/GCS |
| **Custom BTQL automation** | User-defined query | Parquet default |

Automations require `POST /brainstore/automation/reset-cursors` after creation to start exporting.

#### Rate limits, pagination, retention

- BTQL: practical limits depend on query scope and plan; large exports should use Parquet format and narrow time filters.
- Export automations: interval as low as **1 second** (typically hourly+ for bulk).
- Traces do **not** auto-close — "in progress" traces remain until explicitly ended; historical exports may include incomplete traces.
- Data retention automations can delete old logs — export before retention runs.

#### Lossiness and fidelity gaps

- **Session idle timeout** in Braintrust UI (Topics automation, default 600s) controls when **Topics processing** runs, not when traces/sessions close. It does **not** split conversations into sessions — session boundaries come from customer instrumentation (session-root span pattern).
- Multi-turn stitching depends on `parent` / `root_span_id` — migrations must preserve these.
- `expected` field on logs (human corrections) maps to annotation-like data, not a first-class Latitude field on spans.
- Prompt registry is separate from span payloads.

#### Licensing / ToS

Braintrust is commercial. BTQL export and cloud storage automations are standard product features. Customer-initiated export with their API key is the expected migration path. Review ToS for any managed migration service positioning.

---

## Latitude target model

### Storage split

| Layer | Stores | Migration writes |
| --- | --- | --- |
| **ClickHouse `spans`** | Canonical telemetry rows | **Primary import target** — insert spans; `traces` and `sessions` materialized views rebuild automatically |
| **ClickHouse `traces` / `sessions`** | AggregatingMergeTree rollups | Do **not** write directly |
| **Postgres control plane** | Projects, scores, datasets, evaluations, signals | Scores/datasets in Phase 2+; not MVP |
| **Object storage** | Ingest staging (>50 KB OTLP batches), dataset CSV, exports | Optional staging for bulk import batches; span **content** lives inline in CH |

### Identity and hierarchy

| Latitude field | Source | Notes |
| --- | --- | --- |
| `trace_id` | Vendor trace id | **32 lowercase hex, no dashes** — normalize on import |
| `span_id` | Vendor span/observation/run id | **16 lowercase hex** — may need deterministic hash if vendor ids are UUIDs |
| `parent_span_id` | Vendor parent link | Empty or `0000000000000000` = root |
| `session_id` | Resolved from vendor session keys | See resolvers below; empty → CH MV uses `trace_id` as session key (1-trace session) |
| `user_id`, `user_email` | Vendor user fields | External ids, not PG users |
| `tags` | Vendor tags | String array |
| `metadata` | Vendor metadata maps | `Map(String, String)` — stringified values |

**Existing OTLP resolvers** (for live ingest; migration mappers should produce the same normalized fields):

```108:139:packages/domain/spans/src/otlp/resolvers/identity.ts
export const sessionIdCandidates = [
  fromString("session.id"),
  fromString("gen_ai.session.id"),
  fromString("langfuse.session.id"),
  // ...
  fromString("langsmith.trace.session_id"),
  // ...
]

export const userIdCandidates = [
  // ...
  fromString("langsmith.metadata.user_id"),
  fromString("langfuse.user.id"),
]
```

```24:36:packages/domain/spans/src/otlp/resolvers/enrichment.ts
export const tagsCandidates: Candidate<string[]>[] = [
  fromJsonStringArray("latitude.tags"),
  fromStringArray("langfuse.trace.tags"),
  fromStringArray("braintrust.tags"),
  fromStringArray("tag.tags"),
  fromString<string[]>("langsmith.span.tags", (v) => /* comma-split */),
]
```

### Messages, usage, cost

| Latitude column | Source mapping |
| --- | --- |
| `input_messages`, `output_messages`, `system_instructions` | Parse vendor I/O into GenAI message JSON (same shape as OTLP transform) |
| `tool_definitions`, `tool_*` | Tool calls from vendor tool/run-type fields |
| `tokens_*`, `cost_*_microcents` | Vendor usage/cost; USD → microcents (1 USD = 100,000,000) |
| `operation`, `provider`, `model` | Map vendor run types / model names |
| `attr_*`, `resource_string` | Unmapped vendor fields preserved for fidelity |

### Scores and annotations

Postgres `scores` is canonical; ClickHouse `scores` is analytics projection.

| Latitude | Source |
| --- | --- |
| `scores.source_type = 'annotation'` | Human labels / Braintrust `expected` corrections |
| `scores.source_type = 'evaluation'` | Automated eval scores (Phase 2 — requires signal/eval linkage) |
| `scores.source_type = 'custom'` | Vendor numeric scores without eval config |
| Anchors: `trace_id`, `span_id`, `session_id` | From migrated span ids |

Draft scores (`drafted_at` set) stay PG-only until published.

### Prompts

**No Latitude prompt registry exists.** Options:

1. **MVP:** Store prompt name/version in span `metadata` (e.g. `import.prompt_name`, `import.prompt_version`).
2. **Phase 3:** Introduce a prompt entity or map to Latitude prompt templates if product adds one.

### What cannot be migrated faithfully

| Gap | Degraded import behavior |
| --- | --- |
| LangSmith conversation sessions | Import with `session_id = trace_id` unless customer provides a metadata key mapping; document how to configure `extra.metadata.thread_id` or similar |
| Langfuse media attachments | Skip or store URL in metadata; no binary pull in MVP |
| Vendor eval configs (judges, scorers) | Import resulting scores only; do not recreate Evaluation + Signal graph |
| Braintrust in-progress traces | Import with best-effort `end_time` = last event or `start_time`; mark metadata `import.incomplete = true` |
| Prompt registry (all vendors) | Metadata-only reference on spans |
| LangSmith Hub prompts | Out of scope MVP |
| Real-time eval triggers / automations | Not migrated |
| User accounts (vendor auth users) | Only external `user_id` on spans |

---

## Entity mapping tables

### Langfuse → Latitude

| Langfuse entity / field | Latitude target | Transform notes |
| --- | --- | --- |
| `traceId` | `spans.trace_id` | Strip dashes if UUID format |
| `id` (observation) | `spans.span_id` | Hash to 16 hex if not OTEL-shaped |
| `parentObservationId` | `spans.parent_span_id` | |
| `type` GENERATION/SPAN/EVENT | `spans.operation`, `spans.kind` | GENERATION → LLM operation |
| `sessionId` | `spans.session_id` | Direct |
| `userId` | `spans.user_id` | |
| `tags` | `spans.tags` | From trace_context |
| `metadata` | `spans.metadata` | Stringify values |
| `input`, `output` | `input_messages`, `output_messages` | Parse JSON; map to GenAI message arrays |
| `usageDetails`, `costDetails` | `tokens_*`, `cost_*_microcents` | |
| `providedModelName` | `spans.model` | |
| `promptName`, `promptVersion` | `metadata.import.prompt_*` | No prompt entity |
| Score rows | PG `scores` (Phase 2) | Link by migrated trace/span id |
| Dataset items | PG `datasets` + CH `dataset_rows` (Phase 3) | |

### LangSmith → Latitude

| LangSmith entity / field | Latitude target | Transform notes |
| --- | --- | --- |
| `trace_id` | `spans.trace_id` | UUID → 32 hex |
| `id` (run) | `spans.span_id` | UUID → 16 hex (deterministic truncate/hash) |
| `parent_run_id` | `spans.parent_span_id` | |
| `run_type` | `spans.operation` | llm→chat, tool→tool, chain→agent, etc. |
| `session_id` | **Not conversation session** | Do **not** map to `spans.session_id`; use `extra.metadata.session_id` or thread id if present |
| `tags` | `spans.tags` | |
| `extra` | `spans.metadata` | Flatten `ls_*` keys; preserve full JSON in `attr_string` if needed |
| `inputs`, `outputs` | message columns | LangChain message format → GenAI |
| `total_tokens`, `total_cost` | usage/cost columns | |
| `feedback_stats` / feedback API | PG `scores` (Phase 2) | |
| `reference_example_id` | `metadata.import.dataset_example_id` | |
| Dataset examples | PG+CH datasets (Phase 3) | |

**LangSmith session id disambiguation:** LangSmith uses `session_id` for **project id** in bulk export. Conversation grouping keys vary by SDK (`metadata.thread_id`, custom metadata). Migration config should accept `--session-metadata-key extra.thread_id` (example) for LangSmith imports.

### Braintrust → Latitude

| Braintrust entity / field | Latitude target | Transform notes |
| --- | --- | --- |
| `root_span_id` / trace root | `spans.trace_id` | Derive trace id from root |
| `span_id` | `spans.span_id` | |
| `parent_span_id` | `spans.parent_span_id` | |
| Session-root span | `spans.session_id` | Use root span id or explicit `metadata.session_id` if set |
| `tags` | `spans.tags` | |
| `metadata` | `spans.metadata` | |
| `input`, `output` | message columns | |
| `metrics` (tokens, duration) | usage/performance columns | |
| `expected` | PG `scores` annotation (Phase 2) | Human correction |
| `scores` | PG `scores` | |
| Dataset rows | PG+CH datasets (Phase 3) | |
| Prompts (`/v1/prompt`) | metadata only (MVP) | |

---

## Product surface and UX

### Surfaces (by phase)

| Surface | Phase | Audience | Rationale |
| --- | --- | --- | --- |
| **CLI** (`latitude migrate …`) | MVP | Customer engineers | Scriptable, CI-friendly, matches `latitude` CLI pattern; credentials stay local |
| **Backoffice admin job** | MVP | Latitude staff | Assisted migrations for enterprise evals; mirrors other staff-only ops |
| **Self-serve UI wizard** | Phase 2 | Customer admins | Connect source → preview → import; higher build cost |
| **API endpoint** | Phase 2+ | Automation | `POST /v1/projects/{slug}/imports` for headless ops |

### Core UX requirements (all surfaces)

| Requirement | Behavior |
| --- | --- |
| **Org/project scoping** | Import targets one Latitude project slug; source credentials scoped to one vendor project |
| **Dry-run** | `--dry-run` counts records, validates mapping, shows sample normalized span; no writes |
| **Progress reporting** | Structured logs + periodic stats: fetched / transformed / written / skipped / failed |
| **Idempotency** | Re-run with same source ids produces ReplacingMergeTree dedupe (same logical ids → same CH keys) or explicit skip |
| **Resume on failure** | Persist cursor (last exported timestamp + last source id) in PG import job table |
| **Time range filter** | `--from` / `--to` aligned to source semantics (LangSmith: `start_time` inclusive; bulk export: window bounds) |
| **Rate limit handling** | Exponential backoff on 429; respect `Retry-After` |

### Session boundary policy

| Option | Behavior | Recommendation |
| --- | --- | --- |
| **Import as-is** | Preserve vendor `session_id` on every span | **Default** — respects customer instrumentation |
| **Re-segment by idle gap** | Split spans into new session ids when gap > N minutes | Post-MVP optional flag (`--resegment-idle-minutes`); Braintrust Topics idle timeout is **not** a session splitter |
| **One trace = one session** | Force empty session id (MV fallback) | Fallback when source has no session concept |

Latitude UI "live vs idle" ([`sessions.collection.ts`](apps/web/src/domains/sessions/sessions.collection.ts)) is client-side (5-minute threshold on `max_end_time`) — imports do not need to compute it.

---

## Technical approach options

### Option A: Pull via vendor APIs → normalize → ingest pipeline

```
Vendor API ──► Migrator worker ──► normalize to internal span batch ──► processIngestedSpansUseCase / SpanRepository.insert
                     │                              │
                     └── cursor in PG               └── skip OTLP HTTP; optional BullMQ for chunking
```

| Aspect | Assessment |
| --- | --- |
| **Throughput** | Langfuse v2: 50–1000 rows/req, 30–1000 req/min → ~30k–1M obs/hour cloud. LangSmith: 10 req/10s (7-day window) → ~100s of runs/min with small pages. Braintrust BTQL: varies; Parquet for large pulls. |
| **Dedupe** | Stable id mapping from vendor ids; `ingested_at` = import timestamp; ReplacingMergeTree handles retries |
| **Backfill vs cutover** | API pull suits incremental sync and smaller histories; large backfills hit rate limits (LangSmith especially) |
| **Operational risk** | Low infra — no customer bucket setup; high **time** risk on large datasets; vendor API changes |
| **Pros** | No S3 setup; works for cloud trials; good for MVP validation |
| **Cons** | Rate limits; LangSmith bulk export tier gap; Langfuse v2 cloud-only |

### Option B: Direct DB / blob import → transform → bulk load

```
S3/GCS export files ──► Migrator (stream Parquet/JSONL) ──► transform ──► CH batch insert (+ PG scores)
        or
Self-host PG/CH ──► SQL dump / direct read ──► transform ──► bulk insert
```

| Aspect | Assessment |
| --- | --- |
| **Throughput** | Limited by Latitude CH insert rate and worker CPU; blob paths avoid vendor API throttles — **10×–100× faster** for millions of spans |
| **Dedupe** | Same stable id mapping; file boundaries are not idempotency boundaries — cursor per record |
| **Backfill vs cutover** | Primary path for production migrations; API for delta after cutover |
| **Operational risk** | Customer must configure export bucket or grant DB read; credential handling; schema drift on vendor upgrades |
| **Pros** | Scales to full history; matches how vendors expect warehouse export |
| **Cons** | Higher setup friction; self-host DB path is Langfuse-specific; Parquet schema versioning (LangSmith `format_version`) |

### Comparison and recommendation

| Criterion | Option A (API) | Option B (blob/DB) |
| --- | --- | --- |
| Setup friction | Low | Medium–high |
| Max volume | Medium | High |
| LangSmith cloud | Poor (rate limits; bulk export needs Plus) | Good (Parquet bulk export) |
| Langfuse self-host | Medium (legacy API) | Excellent (CH + PG) |
| Braintrust | Good (BTQL) | Excellent (automations) |
| Idempotency | Same | Same |

**Recommendation:** Implement **both**, with shared normalize + write core. Default CLI flow tries API for `--dry-run` and small `--limit`; `--source-uri s3://…` or `--langfuse-blob-prefix` activates blob path. LangSmith migrations should **document** Plus bulk export as the supported path for >100k runs.

### Internal write path vs OTLP

| Path | Use |
| --- | --- |
| **Internal** (`SpanRepository.insert` via migrator use-case) | Bulk import — no double encoding, no ingest rate limits, direct control of `retention_days` |
| **OTLP HTTP** (`POST /v1/traces`) | Only for testing parity with live ingest; optional `--via-otlp` flag for QA |

Post-import, publish `TracesIngested` domain events (or a dedicated `ImportBatchCompleted` event) so trace-search indexing, first-trace detection, and billing run — **billing policy for imported spans** is an open question (likely exclude from ingest metering or tag `metadata.import.source`).

### Throughput estimates (order of magnitude)

Assumptions: 500-byte avg span row, 10k spans/sec CH insert burst (conservative), single worker.

| Volume | API-only (Langfuse cloud) | Blob/DB path |
| --- | --- | --- |
| 100k spans | ~2–6 hours | ~1–5 minutes |
| 1M spans | ~1–3 days | ~10–30 minutes |
| 10M spans | Impractical API-only | ~2–4 hours (parallel workers) |

Parallelization: shard by time window or trace id prefix; **one import job per (org, project, source)** at a time (hard guard like data-destinations backfill).

---

## Prioritization and phasing

### Platform order

| Priority | Platform | Why |
| --- | --- | --- |
| **1** | Langfuse | OSS/self-host (DB + blob paths), competitive eval overlap, existing resolver coverage, enriched blob export is migration-friendly |
| **2** | Braintrust | Workshop ask; BTQL + Parquet export; strong eval/dataset overlap; session-root patterns documented |
| **3** | LangSmith | Large market but bulk export gated to Plus/Enterprise; `session_id` naming collision; heavy LangChain-specific `extra` parsing |

### MVP vs full parity

| Phase | Entities | Exit gate |
| --- | --- | --- |
| **Phase 0 — Spec** | This document | PR merged; tasks filed |
| **Phase 1 — MVP** | Traces, spans, sessions (as id), user/tags/metadata, usage/cost, messages | Import 100k Langfuse observations in staging; idempotent re-run; traces/sessions visible in UI |
| **Phase 2 — Scores + LangSmith** | Scores/annotations; LangSmith API + Parquet path; CLI polish | LangSmith project import with feedback; scores on traces |
| **Phase 3 — Datasets + prompts metadata** | Dataset rows; prompt metadata; Braintrust automations path | Dataset slug import; eval set parity for fine-tuning workflows |
| **Phase 4 — Self-serve UI + incremental sync** | Wizard; scheduled delta sync | Customer completes import without staff help |

---

## MVP non-goals

- Self-serve UI wizard
- LangSmith migration without Plus bulk export or accepting API rate-limit duration
- Prompt registry creation in Latitude
- Eval config / signal / evaluation recreation
- Vendor user account migration
- Binary media / attachment migration (Langfuse media)
- Real-time dual-write or continuous sync (batch only in MVP)
- Session re-segmentation by idle timeout
- Import into sandbox organizations (mirror data-destinations sandbox exclusion)
- Cross-org import (single org credentials per job)
- Mutable source upsert (imports are append-only historical backfill)
- Legal/compliance review automation (customer responsible for export authorization)

---

## Open questions

1. **Billing:** Do imported spans count toward ingest quotas and billing meters, or are they tagged exempt?
2. **Retention:** Set `retention_days` from org plan at import time, or preserve vendor retention metadata?
3. **Search indexing:** Trigger full trace-search reindex for imported windows, or rely on existing `TracesIngested` consumers?
4. **Span id mapping:** Deterministic UUID→hex truncation vs hash — document collision risk and pick one algorithm globally.
5. **LangSmith session key:** Standardize default metadata keys per LangChain SDK version, or require explicit CLI config?
6. **Staff-only vs customer CLI credentials:** Store encrypted vendor credentials in PG for UI wizard (Phase 2), or ephemeral env vars only for MVP?
7. **CH direct insert vs queue:** Synchronous batch insert in migrator vs BullMQ `span-ingestion` topic for backpressure — likely dedicated `migration-import` queue.
8. **Provenance:** Expose `metadata.import.source_platform`, `import.job_id`, `import.original_id` on every span for support/debug?
9. **Partial trace handling:** Reject entire traces with unmapped parent ids, or import orphan spans with warning?
10. **Langfuse v2 self-host timeline:** Block Langfuse cloud-parity self-host migrations until v2 ships, or invest in legacy API adapter?

---

## Implementation tasks

### Phase 0 — Spec (this PR)

- [x] `specs/observability-migration.md`
- [x] Entity mapping tables per source platform
- [x] MVP non-goals
- [x] Architecture comparison and recommendation
- [ ] Linear LAT-721 → link PR

### Phase 1 — Langfuse MVP (estimated 3–5 PRs)

- [ ] **P1-a** Domain: `ImportJob` entity + port (PG table: org, project, source, cursor, status, stats, error)
- [ ] **P1-b** Normalizer: Langfuse observation row → Latitude `SpanInsertRow` (enriched export + v2 API shapes)
- [ ] **P1-c** Id mapping: trace/span id normalization utilities + unit tests (UUID, OTEL hex)
- [ ] **P1-d** Use-case: `importSpansBatch` — validate, insert CH, emit events; idempotent dedupe
- [ ] **P1-e** Worker: `migration-import` queue + job runner with backoff and cursor persistence
- [ ] **P1-f** CLI: `latitude migrate import langfuse --project <slug> --from --to --dry-run [--limit]`
- [ ] **P1-g** Langfuse blob reader: S3/GCS JSONL/JSON.gz stream parser for `observations_v2/`
- [ ] **P1-h** Backoffice: staff trigger + job status view (minimal)
- [ ] **P1-i** Integration test: fixture Langfuse export → CH spans → UI trace/session smoke
- [ ] **P1-j** Docs: Mintlify "Migrating from Langfuse" guide

**Phase 1 exit gate:** 100k observation import in staging completes with <0.1% error rate; re-run duplicates skipped; sessions group correctly when `sessionId` present.

### Phase 2 — Scores + LangSmith

- [ ] **P2-a** Score normalizers (Langfuse scores, LangSmith feedback, Braintrust scores)
- [ ] **P2-b** `saveScore` + CH analytics sync for imported scores
- [ ] **P2-c** LangSmith run → span normalizer + `--session-metadata-key`
- [ ] **P2-d** LangSmith Parquet bulk export reader
- [ ] **P2-e** CLI: `latitude migrate import langsmith …`
- [ ] **P2-f** Braintrust BTQL pull adapter

**Phase 2 exit gate:** LangSmith project with feedback imports; scores visible on trace detail.

### Phase 3 — Datasets + Braintrust parity

- [ ] **P3-a** Dataset + dataset_rows import path
- [ ] **P3-b** Braintrust blob automation / Parquet reader
- [ ] **P3-c** Prompt metadata enrichment on spans
- [ ] **P3-d** CLI: `latitude migrate import braintrust …`

### Phase 4 — Productization

- [ ] **P4-a** Self-serve import wizard in project settings
- [ ] **P4-b** Incremental scheduled sync (optional continuous migration pre-cutover)
- [ ] **P4-c** Import provenance UI (filter by `import.source_platform`)
- [ ] **P4-d** `--resegment-idle-minutes` optional session splitter

---

## References

- Langfuse: [Public API](https://langfuse.com/docs/api-and-data-platform/features/public-api), [Observations API v2](https://langfuse.com/docs/api-and-data-platform/features/observations-api), [Blob storage export](https://langfuse.com/docs/api-and-data-platform/features/export-to-blob-storage), [API limits](https://langfuse.com/faq/all/api-limits)
- LangSmith: [Export traces](https://docs.langchain.com/langsmith/export-traces), [Bulk export](https://docs.langchain.com/langsmith/data-export)
- Braintrust: [API reference](https://www.braintrust.dev/docs/api-reference), [Export annotated data](https://www.braintrust.dev/docs/annotate/export), [Cloud storage automations](https://www.braintrust.dev/docs/admin/automations/export-to-cloud-storage), [Topics idle timeout (automation only)](https://www.braintrust.dev/docs/kb/topics-automation-idle-timeout-and-trace-update-behavior)
- Latitude: `packages/domain/spans/src/otlp/resolvers/`, `packages/platform/db-clickhouse/clickhouse/migrations/unclustered/00016_session_parity.sql`, `dev-docs/data-destinations.md`
