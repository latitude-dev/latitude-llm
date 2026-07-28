# PII Redaction at Ingestion

> **Documentation** — durable homes after stabilization: `dev-docs/spans.md` (ingest pipeline + the redaction stage), `dev-docs/settings.md` (redaction settings + cascade). The public product page **already exists** at `docs/security/pii-redaction.mdx` and must be **extended**, not duplicated.
>
> **Origin** — a competitive/engine research pass on backend PII redaction (Laminar, Langfuse), corrected by a code-grounded design review that found the original field scope would have shipped a no-op.
>
> **Audience** — this spec is written to be the sole context for an implementing agent. Every claim about current behavior below was verified in code at the cited `file:line`. Re-verify before editing, since line numbers drift.

## Contents

1. [Purpose and the exact promise](#1-purpose-and-the-exact-promise)
2. [Ground truth: how ingestion works today](#2-ground-truth-how-ingestion-works-today)
3. [Competitive context and engine decisions](#3-competitive-context-and-engine-decisions)
4. [Design](#4-design)
5. [Detector specification](#5-detector-specification)
6. [Data, queue, settings, and API changes](#6-data-queue-settings-and-api-changes)
7. [Non-goals](#7-non-goals)
8. [Traps](#8-traps)
9. [Testing plan](#9-testing-plan)
10. [Open questions](#10-open-questions)
11. [Tasks](#11-tasks)

---

## 1. Purpose and the exact promise

Latitude stores LLM conversation content verbatim in ClickHouse. Customers in regulated or enterprise contexts need PII stripped before it lands in our store. Today the only server-side control is nothing; the only client-side control is attribute-key masking in the SDKs (see [§2.4](#24-what-already-exists)).

This project adds **opt-in, per-project, value-level PII redaction applied inside the ingestion worker before any span is written to ClickHouse.**

### The promise we can keep

Write this sentence into the docs and the UI copy before writing code, because it constrains several decisions below:

> When redaction is enabled for a project, Latitude scans span content for the configured PII categories and replaces matches with labelled placeholders before the span is persisted to ClickHouse. Redaction applies only to spans ingested after you enable it. Detection is pattern-based and best effort: it reliably catches structured identifiers, and does not catch names, addresses, or free-form personal detail.

### What that sentence deliberately does not claim

- **Not "PII never touches our infrastructure."** The raw OTLP payload is buffered before the worker runs, in Redis and object storage. See [§2.2](#22-worker-path) and [T-3](#8-traps).
- **Not retroactive.** Already-stored spans are untouched, and there is no delete path today ([§2.5](#25-what-does-not-exist)).
- **Not name/address detection.** That needs an ML tier, deferred to Phase 4.

### Design invariant

**Every degradation path must move toward more redaction, never less.** Missing config, oversized fields, detector errors, timeouts, and unknown vendor attributes all resolve toward removing more content, not passing it through. This single rule decides most of the edge cases in [§4.6](#46-failure-policy) and [§4.7](#47-size-and-time-budget); when a new edge case appears, apply it rather than inventing a new policy.

---

## 2. Ground truth: how ingestion works today

### 2.1 HTTP request path

`POST /v1/traces` exists only in `apps/ingest` (`apps/ingest/src/routes/traces.ts:153-160`). Middleware chain: oversized-header rejection → API key auth → project header → payload read → handler.

`readPayload` (`apps/ingest/src/trace-payload.ts:351-462`) streams the body into a single `Uint8Array` and never decodes it.

`handleTraceRequest` (`traces.ts:48-151`) rate-limits, then calls `ingestSpansWithBillingUseCase` (`packages/domain/spans/src/use-cases/ingest-spans-with-billing.ts:75-89`), which decodes the OTLP payload **once** at line 78 and hands the decoded request down. That decode result is discarded after enqueue; the worker re-decodes.

`ingestSpansUseCase` (`packages/domain/spans/src/use-cases/ingest-spans.ts:117-239`) does the work that matters for this project:

- Walks the payload counting spans and collecting each span's `latitude.project` slug (`inspectPayload`, `:66-84`).
- Resolves every unique slug to a full `Project` row, **settings included**, one query per unique slug, into `projectBySlug` (`:142-149`). The comment at `:139-141` states the intent explicitly: keep the full row so the sampling step does not re-fetch.
- Applies deterministic per-payload sampling from `project.settings.sampling` (`:175-191`).
- Places the payload: base64 inline if `byteLength <= INLINE_PAYLOAD_MAX_BYTES` (50 KB, `:22`, `:203-204`), else `putInDisk({ namespace: "ingest", ... })` producing a `tmp-ingest/{orgId}/{projectId}/{id}.{protobuf|json}` key (`:212-218`).
- Publishes to the `span-ingestion` queue with topic `ingest` (`:226-236`). Payload schema: `packages/domain/queue/src/topic-registry.ts:79-91`.

**The key fact for this project:** every resolved `Project`, with its `settings`, is already in memory at `ingest-spans.ts:149`, for free. That is where the redaction policy gets resolved ([§4.5](#45-policy-resolution-decide-at-ingest-apply-in-the-worker)).

### 2.2 Worker path

`apps/workers/src/workers/span-ingestion.ts:52-120`, `concurrency: 50`. Resolves the org plan via `resolveEffectivePlanCached` (`:71`) for retention and billing, then calls `processIngestedSpansUseCase`.

Postgres layers already provided in this worker (`:43-48`): `BillingOverrideRepositoryLive`, **`SettingsReaderLive`**, `StripeSubscriptionLookupLive`, `OrganizationRepositoryLive`. `SettingsReader` is therefore reachable in the worker but unused by the span pipeline today.

`SpanDecodingError` is swallowed as a warning (`:105-107`): undecodable payloads are dropped. Any other error propagates and fails the job. **The topic configures no `attempts`, and `new Queue` sets no `defaultJobOptions`, so BullMQ's default of a single attempt applies: a failed ingest job is not retried.** Stalled-job recovery can still redeliver a job whose worker died mid-processing, which is a different mechanism from retry.

`processIngestedSpansUseCase` (`packages/domain/spans/src/use-cases/process-ingested-spans.ts:120-187`) stages:

| Stage | Location | Data shape |
| --- | --- | --- |
| A. Resolve payload | `resolvePayload`, `:62-82`, called `:132` | raw OTLP wire bytes (`Uint8Array`) |
| B. Decode | `decodeRequest`, `:51-60`, via `decodeAndTransform` `:89` | `OtlpExportTraceServiceRequest`, content still in raw OTLP attributes |
| C. Transform | `transformOtlpToSpans`, `packages/domain/spans/src/otlp/transform.ts:263-300`, called `:100` | `readonly SpanDetail[]`, content as parsed objects |
| D. Retention stamp | `:134-140` | same, plus `retentionDays` |
| E. Insert | `:147` → `packages/platform/db-clickhouse/src/repositories/span-repository.ts:943-961` | `toInsertRow` (`:350-410`) JSON-stringifies content into columns |
| F. Event fan-out | `:152-186` | `TracesIngested` per project, **IDs only, no content** |

**Redaction inserts between D and E** ([§4.1](#41-where-redaction-runs)).

**Pre-worker buffering (matters for the promise).** Before the worker runs, raw undecoded OTLP bytes are already durable in two places:

- **Redis**, base64 in the BullMQ job body for payloads ≤ 50 KB. BullMQ retains the last 1000 completed and last 1000 failed jobs per queue (`packages/platform/queue-bullmq/src/adapter.ts:272-273`, `:379-380`). Completed jobs churn fast on a busy instance; **failed jobs do not**, so a failing queue accumulates up to 1000 raw payloads.
- **Object storage**, `tmp-ingest/…`. An S3 lifecycle rule expires these after one day (`infra/lib/s3.ts:54-63`). **Nothing in code deletes the blob after processing**, and a self-hosted local-disk backend has no lifecycle rule at all, so there it is permanent.

### 2.3 Every place span content lands

Canonical ClickHouse schema dump: `packages/platform/testkit/src/clickhouse/schema.sql`.

**Tables holding recoverable content:**

| Table | Content columns | Written by |
| --- | --- | --- |
| `spans` (`:322-407`) | `input_messages` `:377`, `output_messages` `:378`, `system_instructions` `:379`, `tool_definitions` `:380`, `tool_input` `:383`, `tool_output` `:384`, **`attr_string` `:370`**, `resource_string` `:374`, `events_json` `:347`, `links_json` `:348`, `metadata` `:346`, `tags` `:345`, `user_id`/`user_email` `:327-328`, `status_message` `:341` | `SpanRepository.insert` |
| `traces` (`:501-547`) | `input_messages`, `last_input_messages`, `output_messages`, `system_instructions`, `metadata`, `tags`, `user_id`, `user_email` | `traces_mv` **FROM `spans`** (`:549-629`) |
| `sessions` (`:184-232`) | same set | `sessions_mv` **FROM `spans`** (`:234-320`) |
| `trace_search_documents` (`:481-499`) | `search_text` `:488` + full-text skip indexes `:492-493` | `trace-search` worker, reads `spans` |
| `memory_blobs` (`:679-692`) | `content` `:683` (no `retention_days`, no partitioning: effectively permanent) | `materialize-trace-memory`, reads `spans` |
| `memory_events` (`:713-740`) | `query_text` `:724` | same |
| `session_moment_labels` (`:136-158`) | `summary` `:148`, `evidence` `:149` (quoted excerpts) | conversation-intelligence, reads `spans` |
| `taxonomy_observations` (`:409-438`) | `projection_metadata` `:419` (full transcript projection) | `analyze-session` |
| `taxonomy_facet_projections` (`:656-677`) | `extracted_text` `:663` | `extract-facet-projections` |
| `dataset_rows` (`:4-23`) | `input`, `output`, `expected_output`, `metadata`, `custom` `:12-16` (no `retention_days`: permanent) | `add-traces-to-dataset`, reads `traces` |

**Hash/vector only, no recoverable text:** `message_embeddings` (`:25-39`), `trace_message_occurrences` (`:440-479`), `memory_current` (`:694-711`), `session_semantic_moments` (`:160-182`), `taxonomy_view_assignments` (`:631-654`).

**Only three materialized views exist:** `traces_mv` and `sessions_mv` (both read `spans`) and `scores_hourly_buckets_mv` (reads `scores`, no content).

**Egress and other sinks:**

- **PostHog data destinations** ship raw messages to a third party: `$ai_input: span.inputMessages`, `$ai_output_choices: span.outputMessages` (`packages/domain/destinations/src/mappers/posthog.ts:84-117`). Reads `spans`.
- **Temporal workflow history** records transcripts at activity boundaries (`apps/workflows/src/activities/analyze-session-activities.ts:152-219`). Reads `spans`.
- **LLM/embedding providers** via `@platform/ai` for trace search, session analysis, facet extraction, signals matching. Read `spans`.
- **Postgres** stores derived text only (`scores.feedback`, `signals.description`), never verbatim messages.

**Why one insertion point suffices:** every table and every egress path above reads from `spans` or from `traces`/`sessions`, which are materialized views on `spans`. Redacting `SpanDetail[]` before `repo.insert` covers all of them transitively. That is the single strongest argument for the chosen design and it should be stated in the PR description, because reviewers will doubt it.

### 2.4 What already exists

**Client-side, key-based redaction ships today.** The problem statement in the original research report ("we have no server-side redaction; the only option is client-side scrubbing the customer must build") is wrong on the second half:

| File | What it does |
| --- | --- |
| `packages/telemetry/typescript/src/sdk/redact.ts:9-66` | `RedactSpanProcessor`: masks matching attribute **keys** on span/event/link attributes. Default mask `"******"` (`:16`). |
| `packages/telemetry/typescript/src/sdk/redact.ts:68-78` | `DEFAULT_REDACT_SPAN_PROCESSOR`, on by default: authorization, cookie, `x-api-key`, `db.statement`. |
| `packages/telemetry/python/src/latitude_telemetry/telemetry/redact_span_processor.py` | Python equivalent. |
| `packages/telemetry/claude-code/src/redaction.ts:1-67` | `redactAttributes(attributes: OtlpKeyValue[], config)` + `parseRedactEnv` (`LATITUDE_REDACT_ATTRIBUTES`, `LATITUDE_REDACT_MASK`). `toMatcher` (`:41-63`) supports `/regex/flags`, bare regex, and exact match. |
| `packages/telemetry/openclaw/src/redaction.ts`, `packages/telemetry/pi/src/redaction.ts` | Same helper, per-exporter config. |
| `docs/security/pii-redaction.mdx` | Live public page. Line 8: "Redaction starts in the SDKs before spans are exported." |

Two consequences: the docs task **updates** that page, and the two systems need coherent naming, because their semantics differ. Use these terms consistently everywhere:

- **SDK attribute redaction** — client-side, matches attribute **keys**, existing.
- **Ingest PII redaction** — server-side, matches **values** inside content, this project.

### 2.5 What does not exist

- **No delete or purge method on `SpanRepository`** (`packages/domain/spans/src/ports/span-repository.ts:89-268` is entirely `insert` + reads).
- **Project deletion is a Postgres soft-delete** that never touches ClickHouse (`packages/domain/projects/src/use-cases/purge-organization-projects.ts:12-17`); ClickHouse data ages out via the retention TTL only.

Therefore **ingested content cannot be removed before its retention TTL expires.** This is why redaction fails closed ([§4.6](#46-failure-policy)) and why a deletion path is Phase 5 rather than "someday": redaction with no delete path means a redaction bug is permanent.

---

## 3. Competitive context and engine decisions

**Laminar (lmnr):** server-side, before-persist, in a standalone Rust + ONNX gRPC sidecar (`pii-redactor`) running `openai/privacy-filter` (Apache-2.0, ~5.4 GB on CPU) or Piiranha. JSON-structure-aware leaf walk with skip-keys, `[REDACTED_<LABEL>]` placeholders, fail-open, batched per span batch, two-stage opt-in (deployment `PII_REDACTOR_URL` plus per-project `settings.removePii`).

**Langfuse:** no built-in detector. Primary path is a client-side SDK `mask` function. Self-hosted Enterprise adds a server-side HTTP callback (`LANGFUSE_INGESTION_MASKING_CALLBACK_URL`, 500 ms timeout, retries, fail-open/closed) that POSTs the OTEL object to a customer-run service.

**Takeaway:** neither bundles a model; both make contextual detection an optional separately-deployed component. Neither ships deterministic detectors out of the box, which is where we can beat both cheaply.

**Two constraints we must not inherit.** Both designs sit on a synchronous export path, which is why both chose fail-open and sub-second timeouts. Our redaction point is in an async BullMQ worker at concurrency 50; the OTLP client already has its `200`. We can fail the batch instead of degrading it, and we can afford seconds. Copying fail-open and a 500 ms timeout would import their constraints without their reason. See [§4.6](#46-failure-policy) and [§4.7](#47-size-and-time-budget).

**Engine research (permissive licenses only):**

| Approach | Coverage | Cost | License | Verdict |
| --- | --- | --- | --- | --- |
| Regex/deterministic, in-process TS | Structured identifiers + prefixed secrets | sub-ms per KB, deterministic | MIT | **Phase 1 tier** |
| GLiNER `urchade/gliner_multi_pii-v1` | Names, addresses; tops the open-model SPY benchmark | ~350 MB int8, in-proc via transformers.js/onnxruntime-node or sidecar | Apache-2.0 | **Phase 4 ML tier** |
| `openai/privacy-filter` | SOTA-claimed | ~5.4 GB CPU (15× heavier) | Apache-2.0 | Overkill |
| Piiranha / most ai4privacy fine-tunes | High | Small | **CC-BY-NC** | **Excluded**: non-commercial, violates the OSS/self-host rule in `CLAUDE.md` |
| LLM-based | Best contextual | 35-180 ms+/span, per-token cost, non-deterministic | varies | Offline only, never inline |

---

## 4. Design

### 4.1 Where redaction runs

Inside `processIngestedSpansUseCase`, **after `decodeAndTransform` and before the retention map and `repo.insert`** (`packages/domain/spans/src/use-cases/process-ingested-spans.ts`, between `:133` and `:147`).

Rationale:

1. `SpanDetail[]` at that point is typed and parsed, so the walk is structure-aware rather than string-bashing serialized JSON.
2. It is upstream of every content sink in [§2.3](#23-every-place-span-content-lands), including `traces_mv`, `sessions_mv`, the PostHog export, and Temporal history.
3. It runs before `TracesIngested` is published, so no downstream consumer ever sees unredacted content.

Rejected alternatives:

- **Before `parseContent` on the raw `OtlpKeyValue[]`** (`transform.ts:167`). Attractive because `redactAttributes` already operates on that shape, but the value-level walk wants parsed message structure, and the attribute array is the shape we intend to *drop keys from*, not value-scan exclusively.
- **In `toInsertRow`** (`span-repository.ts:350`). Pushes a domain policy into the platform layer and covers only `spans`.
- **At the HTTP boundary before enqueue.** The only way to keep raw content out of the Redis/S3 buffer, but it forces decode + redact + re-encode onto the hot response path, which `ingest-spans.ts:44-48` deliberately avoids. Handled instead by shortening buffer lifetime ([T-3](#8-traps)).

### 4.2 The complete field surface

This section is the correction that makes the feature real. **`attr_string` contains a verbatim second copy of everything in the parsed content columns.** `transformSpan` copies every string span attribute into `attrString` with no filtering (`transform.ts:181-198`), and that map is inserted at `span-repository.ts:393`. The content parsers in `packages/domain/spans/src/otlp/content/` read exactly those attributes: `gen_ai.input.messages`, `gen_ai.prompt.N.content`, `gen_ai.completion_json`, `llm.input_messages.N.message.content`, `ai.prompt.messages`, `lk.chat_ctx`, `input.value`, `user_prompt`, and more.

Redacting only `input_messages`/`output_messages` while leaving `attr_string` alone leaves a full plaintext copy in the same ClickHouse row. Any scope list that omits `attr_string` ships a no-op.

Similarly, `events_json = JSON.stringify(span.events)` (`transform.ts:223`) is stored verbatim and **no content parser reads events** (only `otlp/resolvers/performance.ts:33` touches them, for time-to-first-token). Instrumentations on the older OTel gen_ai convention put message content in span *event* attributes (`gen_ai.user.message`, `gen_ai.assistant.message`). For those customers all content lives in `events_json` and nowhere else: invisible in the UI and, under a naive scope, unredacted.

#### Content scope — always applied when `mode != "off"`

| Field on `SpanDetail` | Treatment |
| --- | --- |
| `inputMessages`, `outputMessages` | Walk `parts[]`, redact text-bearing leaves ([§4.2.1](#421-genai-part-walk)) |
| `systemInstructions` | Same walk (it is a parts array) |
| `toolDefinitions` | Walk `description` and the string leaves of `parameters` |
| `toolInput`, `toolOutput` | If the string parses as JSON, walk and re-serialize; otherwise treat as plain text |
| `statusMessage` | Plain text |
| `eventsJson` | Parse JSON, walk all string leaves, re-serialize; on parse failure treat as plain text |
| `attrString` | **Drop known content keys entirely**, then value-redact the remaining values ([§4.2.2](#422-attribute-map-handling)) |
| `resourceString` | Value-redact all values (small map, keys preserved) |

#### Metadata scope — opt-in, `scopes.metadata`, default off

| Field | Treatment |
| --- | --- |
| `metadata` | Value-redact values, preserve keys |
| `tags` | Value-redact each tag |

Default off because both are explicitly customer-supplied filtering dimensions; redacting them silently breaks saved searches and analytics. Note for the UI copy: redacting tags *reduces* ClickHouse cardinality (`Array(LowCardinality(String))`), so there is no storage downside, only a filtering one.

#### Identity fields — `identities`, default `keep`

`userId`, `userEmail`. Two modes, `keep` or `pseudonymize` ([§4.9](#49-identity-pseudonymization)). Deliberately **not** a plain redact option: a feature called PII redaction that leaves `user_email` in plaintext across `spans`, `traces`, and `sessions` fails the first compliance review, but blanking it breaks every user-analytics query. Pseudonymization keeps equality filters and group-bys working and removes the plaintext, which is strictly better than either.

#### Never touched, with reasons

`linksJson` (trace/span ids only), `name`, `serviceName`, `model`, `responseModel`, `provider`, `operation`, `agentName`, `toolName`, `toolNames`, `toolCallId`, `responseId`, `finishReasons`, `scopeName`, `scopeVersion`, `attrInt`/`attrFloat`/`attrBool`, and every numeric or timestamp column. These are identifiers, enums, and metrics. If a customer smuggles PII into a span name, that is out of scope and must be said out loud in the docs.

#### 4.2.1 GenAI part walk

`GenAIMessage` is `{ role, parts: GenAIPart[], name? }` (`rosetta-ai` `GenAIMessageSchema`). `GenAISystem` is a bare parts array. Part shapes, verified against `rosetta-ai@2.2.0`:

| `type` | Text-bearing field | Treatment |
| --- | --- | --- |
| `text` | `content: string` | Redact |
| `reasoning` | `content: string` | Redact |
| `uri` | `uri: string` | Redact (query strings carry PII) |
| `tool_call` | `arguments: unknown` | Walk as JSON. `name` and `id` untouched |
| `tool_call_response` | `response: unknown` | Walk as JSON. `id` untouched |
| `blob` | `content: string` | **Skip.** Base64-encoded binary, not text |
| `file` | file reference fields | **Skip.** No inline payload |
| generic/unknown | any string leaf | Walk as JSON |

Every part type also carries a loose (`z.core.$loose`, i.e. passthrough) `_provider_metadata` object, so unknown keys can appear anywhere. The generic JSON walk must therefore be the default behavior for unrecognized structure, not an error.

Also redact `message.name` (the participant name field). It is text a customer controls, and no high-precision detector will match a tool name.

**There is no key-based skip list.** Phase 1 shipped one (`id`, `tool_call_id`, `mimeType`, and similar) on the reasoning that those values are structural and not worth scanning. That reasoning does not survive contact with `toolInput`/`toolOutput`/`eventsJson`, which are arbitrary customer JSON at every depth: `{"id": "john@example.com"}` is an ordinary payload, and skipping it silently exempts exactly the content the feature exists to remove. Because every detector is high-precision ([§5](#5-detector-specification)), scanning a genuinely structural value costs CPU but cannot corrupt it, so the list bought nothing and leaked. Every string leaf is scanned regardless of its key.

The risk this trades into is redacting a tool-call id and breaking the tool-call↔response pairing the conversation view depends on. No id format any vendor in `otlp/content/` emits matches a detector, and that is asserted rather than assumed. If one ever does, the detector is the bug.

**Structural invariants the walk must preserve:** array lengths and ordering (message pairing and `messageIndex` references depend on it), object keys, non-string leaves unchanged, and `JSON.stringify` round-trip stability for stringified-JSON fields.

#### 4.2.2 Attribute map handling

`attr_string` gets two passes, in order:

1. **Drop content keys.** When `mode == "enforce"`, delete every key for which `isContentAttributeKey(key)` is true. Zero false positives (exact/prefix key matching, no value scanning), zero CPU, and nothing is lost from the product surface because the UI reads the parsed columns.
2. **Value-redact the remainder.** Backstop for vendors we have not enumerated: run the detectors over the remaining values. Attribute values are small, so this is cheap.

`isContentAttributeKey` must **not** be a hand-maintained list in the redaction module. Each parser in `packages/domain/spans/src/otlp/content/` already knows its own keys; have each module export a key matcher and compose them in `content/index.ts` next to the existing vendor dispatch table (`content/index.ts:41-87`). A new vendor parser then gets redaction coverage automatically. Known families to cover: `genai`, `genai_deprecated`, `openinference`, `vercel`, `livekit`, `flue`, `claude-code`, `json-value`.

### 4.3 Policy model

```ts
export const REDACTION_MODES = ["off", "enforce"] as const

export const REDACTION_ENTITIES = [
  "email",
  "phone",
  "credit_card",
  "iban",
  "us_ssn",
  "ip_address",
  "secret",
  "crypto_wallet",
] as const

export const DEFAULT_REDACTION_ENTITIES = [
  "email",
  "phone",
  "credit_card",
  "iban",
  "us_ssn",
  "secret",
] as const
```

**Modes:**

- `off` (default) — no scanning, zero cost. Projects in this mode never appear in the queue policy map.
- `enforce` — replace matches with `[REDACTED_<LABEL>]`.

**There is deliberately no dry-run mode.** An earlier draft had one, on the reasoning that a destructive, non-retroactive, unrecoverable transform needs a way to validate a policy before it destroys data. That reasoning is sound; a dry-run *mode* was the wrong answer to it. It redacted nothing and surfaced nothing a customer could read — its only output was the [§4.8](#48-observability) span annotations, which land in Latitude's own telemetry — so from the outside it was indistinguishable from `off` while still costing a full scan and still able to fail closed on a deadline overrun. A mode that stores what `off` stores and can lose spans that `off` would keep is worse than not having it.

Two consequences worth stating, because removing it removed a safety net:

- **A false negative is now invisible to everyone.** Nothing reports what redaction did *not* catch. That raises the stakes on detector precision being right by construction ([§5](#5-detector-specification)) and makes per-entity toggles and the visible placeholder the only feedback a customer gets.
- **Detector tuning needs a script, not a product mode.** Measuring how a detector behaves against real traffic is an offline question: read spans from ClickHouse and run the detectors over them. That answers [open question 5](#10-open-questions) without shipping a customer-visible surface that does nothing.

Giving customers a real answer to "will this eat my tool outputs" needs a preview that runs the detectors on demand over spans already in ClickHouse and returns counts plus before/after samples. That is a genuine feature, out of scope here, and it is the thing a dry-run mode was pretending to be.

Because `off` projects are omitted from the queue map entirely, a policy's *presence* is the decision. The engine-facing `RedactionPolicy` therefore carries no mode at all, and the wire format has no `mode` field: only the settings-facing `ResolvedRedactionPolicy` has one, for the UI toggle.

**Placeholder format:** `[REDACTED_EMAIL]`, `[REDACTED_CREDIT_CARD]`, and so on. Uppercased entity label, no counters or ordinals (keeps `content_hash` deterministic for identical inputs). The placeholder is visible in the UI, which is intentional: users must be able to see *why* content is missing.

**Overlap resolution:** collect all matches as `{ start, end, label }` across all enabled detectors, sort by `start` ascending then by length descending, then greedily accept non-overlapping matches. Longest-match-wins at the same offset. Replacement happens in one right-to-left pass so offsets stay valid.

### 4.4 Settings, cascade, authorization

Both schemas go in `packages/domain/shared/src/settings.ts` alongside `samplingSettingSchema` (`:58-63`). Both parent objects are optional-field-only, so adding a key is additive with no migration (`projects.settings` and `organizations.settings` are JSONB).

```ts
export const redactionSettingSchema = z.object({
  mode: z.enum(REDACTION_MODES).optional(),
  entities: z.array(z.enum(REDACTION_ENTITIES)).optional(),
  scopes: z.object({ metadata: z.boolean().optional() }).optional(),
  identities: z.enum(["keep", "pseudonymize"]).optional(),
})

export const organizationRedactionSettingSchema = redactionSettingSchema.extend({
  locked: z.boolean().optional(),
})
```

`projectSettingsSchema` gains `redaction: redactionSettingSchema.optional()`; `organizationSettingsSchema` gains `redaction: organizationRedactionSettingSchema.optional()`.

**Resolution** — a new pure function in the same file, next to `resolveSettingsCascade` (`:104-114`):

```ts
export interface ResolvedRedactionPolicy {
  readonly mode: "off" | "enforce"
  readonly entities: ReadonlySet<RedactionEntity>
  readonly redactMetadata: boolean
  readonly identities: "keep" | "pseudonymize"
  readonly source: "organization" | "project" | "default"
}

export function resolveRedactionPolicy(input: {
  organization: OrganizationSettings | null
  project: ProjectSettings | null
}): ResolvedRedactionPolicy
```

Rules:

1. If `organization.redaction.locked === true`, the org policy is used **outright** and the project policy is ignored entirely (not merged). `source: "organization"`.
2. Otherwise resolve field by field: project value, else org value, else system default. `source` is `"project"` if any project field was present, else `"organization"` if any org field was, else `"default"`.
3. System defaults: `mode: "off"`, `entities: DEFAULT_REDACTION_ENTITIES`, `redactMetadata: false`, `identities: "keep"`.

`locked` is all-or-nothing rather than per-field on purpose: partial locking produces a policy no one can explain in a UI, and the enterprise requirement is "projects cannot weaken this," which all-or-nothing satisfies.

Do **not** extend `resolveSettingsCascade`/`ResolvedSettings`. That path resolves a single boolean and is consumed elsewhere; a parallel function keeps the blast radius at zero.

**Authorization.** `MemberRole = "owner" | "admin" | "member"` (`packages/platform/db-postgres/src/schema/better-auth.ts:28`).

- Project-level `redaction`: `admin` or `owner`.
- Organization-level `redaction`, including `locked`: `owner` only.
- Every change to either must be logged with actor, before-value, and after-value. Turning a compliance control off silently is the failure mode enterprises actually ask about. Use the existing structured logger; a durable audit table is out of scope here.

### 4.5 Policy resolution: decide at ingest, apply in the worker

Resolve the effective policy at the **HTTP boundary** in `ingestSpansUseCase`, and stamp the result onto the queue job. Apply it in the worker.

Why not resolve in the worker: it would add an uncached `SettingsReader` Postgres round trip per project per batch at concurrency 50 (`packages/platform/db-postgres/src/repositories/settings-reader-repository.ts:8-47` has no caching), while the boundary already holds every resolved `Project` **with settings** in `projectBySlug` (`ingest-spans.ts:149`). Project-level policy is therefore free. Stamping also makes the decision auditable and immune to a toggle flipping between enqueue and processing.

**Org settings do need a read at the boundary.** `SettingsReaderLive` is already in `traceIngestionBillingLayers` (`apps/ingest/src/routes/traces.ts:32-39`), so `getOrganizationSettings()` is reachable, but an uncached query on the hottest path in the product is not acceptable. Add a Redis-cached resolver modeled exactly on `packages/platform/db-postgres/src/resolve-effective-plan-cached.ts`:

- Key `org:${organizationId}:settings:redaction` (org prefix first, per the repo-wide rule in `CLAUDE.md`).
- 60 s TTL, Zod-validated cached payload, `cache.hit` span annotation, and an `invalidateOrganizationRedactionCache(organizationId)` export mirroring `invalidateEffectivePlanCache` (`:95-101`).
- **A cache failure degrades to a database read. A database failure propagates.** An earlier draft of this spec had the row read degrade to "no org policy" on the theory that the org layer can only raise strictness. That was wrong: degrading lets a `locked` org policy fall back to a weaker project policy and write plaintext, which is the exact failure the design invariant exists to prevent. It also buys no availability, because project resolution on this path already hard-depends on Postgres (`ingest-spans.ts:146-149`; `RepositoryError` is already in the use case's error union) and the request fails regardless.
- Cache the *absence* of a policy explicitly rather than as a bare `null`. Almost every organization has no policy, and if a cached absence were indistinguishable from a miss the cache would never serve the common case.

**60 s of staleness is a documented behavior, not a defect.** Enabling redaction takes effect within a minute. Say it in the UI copy.

**Queue payload.** Extend `span-ingestion:ingest` in `packages/domain/queue/src/topic-registry.ts:79-91`:

```ts
readonly redaction?: Readonly<Record<string, SerializedRedactionPolicy>> // projectId → policy
```

```ts
interface SerializedRedactionPolicy {
  readonly entities: readonly RedactionEntity[]
  readonly redactMetadata: boolean
  readonly identities: "keep" | "pseudonymize"
}
```

Projects resolving to `mode: "off"` are **absent from the map**, and the whole field is omitted when no project in the batch has a policy. So an absent field means "redact nothing."

**Rollout is order-independent and needs no legacy fallback.** At deploy time no customer has redaction enabled, so an in-flight job with no `redaction` field genuinely means "no redaction." Old-worker-plus-new-ingest ignores the field; new-worker-plus-old-ingest sees no field. Both are correct. This is why the worker must **not** grow a `SettingsReader` fallback: a fallback would be a second, differently-cached policy path that silently diverges from the stamped one, and there is no scenario that needs it. Contrast with the legacy-payload workaround at `apps/workers/src/workers/span-ingestion.ts:62-67`, which exists because that field change was *not* fail-safe.

### 4.6 Failure policy

**The deterministic tier fails closed.** If the redaction pass throws or overruns its deadline, the effect fails and nothing is inserted. The batch is then dropped, because `span-ingestion` runs with BullMQ's default single attempt ([§2.2](#22-worker-path)) — it is not retried first.

Justification, and this is a deliberate divergence from both competitors:

1. We are async. lmnr and langfuse chose fail-open because a synchronous export path made "drop the customer's telemetry" the only alternative, and dropping it would have surfaced to the caller as a failed export. Ours is already acknowledged, so failing the batch costs the customer that batch rather than an error at their exporter.
2. For the in-process deterministic tier, "failure" means a code bug, so fail-open reduces to *silently writing plaintext PII for a customer who explicitly asked us not to*.
3. There is no delete path ([§2.5](#25-what-does-not-exist)) and redaction is non-retroactive, so a fail-open write is permanent and unremediable.

**The cost is explicit and accepted:** a persistent redaction bug loses spans for opted-in projects rather than leaking their PII. That is the correct trade for a compliance control, it is loud (failed jobs, error logs), and the customer has a self-service escape as long as the effective policy is project-controlled: set `mode` back to `off`. Under a `locked` organization policy the project setting is ignored ([§4.4](#44-settings-cascade-authorization)), so recovery there means changing the organization policy, which only an owner can do. Whether ingest should retry before dropping is a real open question ([§10](#10-open-questions)); it is deliberately not changed here, because adding `attempts` alters failure handling for all ingest, not just redaction.

Additional rules:

- A single span's failure fails the whole batch. Do not partially insert; partial inserts produce a batch where some spans are redacted and some are not, with no way to tell which.
- Detector-level errors must not be caught and ignored per-field. Catching them per-field converts a bug into a silent leak.
- **Remote tier (Phase 4)** runs *after* the deterministic pass, so its failure still leaves structured PII removed. Default `LAT_PII_REDACTOR_FAIL_OPEN=false`; fail-open requires explicitly opting in. Phase 4 must also design a circuit breaker, because a dead sidecar under fail-closed halts ingestion for every project using it.

### 4.7 Size and time budget

Ingestion is the hot path of the entire product, so this is a capacity question, not a footnote. "Sub-ms and deterministic" is meaningless without a size.

- `REDACTION_MAX_FIELD_CHARS = 1_000_000` (1 M UTF-16 code units). A field above the cap is **not scanned**: it is replaced wholesale with `[REDACTED_OVERSIZED_FIELD]` and counted. Passing it through unscanned would break the promise, and partial scanning would leak the tail. Per the design invariant, degrade toward more redaction. 1 MB is generous: the realistic trigger is multi-MB file content in coding-agent tool outputs.
- `REDACTION_MAX_DEPTH = 256`. The walk is recursive and `JSON.parse` accepts nesting tens of thousands deep, so a crafted `tool_input` overflows the stack; fail-closed then turns one hostile span into a dropped batch for every project in it. A subtree at the cap is treated exactly like an oversized leaf, which keeps the failure local. Payloads too deep for `JSON.parse` itself fall back to a plain-text scan, so they are still scanned rather than skipped.
- `REDACTION_BATCH_TIMEOUT_MS = 30_000`, enforced as a **deadline checked before each span**, not as an `Effect.timeout` around the whole pass. The walk is synchronous, so a fiber-level timeout cannot fire until the work it was meant to bound has already finished; wrapping the pass in one would advertise a limit that never applies. Overrun is therefore bounded by a single span's walk, which the field cap bounds in turn. The async pseudonym phase does yield, so that one keeps a real `Effect.timeoutOrElse`. Either way the pass fails and the batch is dropped ([§4.6](#46-failure-policy)).
- **Benchmark acceptance criterion:** measure and record added wall-clock per span at p50 and p99 for a representative batch, and the total CPU delta at concurrency 50. Target ≤ 5 ms per span at 32 KB of scanned content. If the measured number misses the target, the finding goes in the PR description and the cap gets revisited; do not silently ship a regression on the ingest path.

### 4.8 Observability

Without these, nobody can answer "is it working" or "why did my content disappear." Annotate the existing `spans.processIngestedSpans` span (`process-ingested-spans.ts:187`), matching the codebase's `Effect.annotateCurrentSpan` convention:

| Annotation | Meaning |
| --- | --- |
| `redaction.spans` | spans redacted |
| `redaction.fields` | fields scanned |
| `redaction.bytes` | bytes scanned |
| `redaction.matches` | total accepted matches |
| `redaction.matches.<entity>` | per-entity counts, one annotation per enabled entity with a nonzero count |
| `redaction.droppedAttributeKeys` | content attribute keys removed from `attr_string` |
| `redaction.oversizedFields` | leaves dropped for exceeding `REDACTION_MAX_FIELD_CHARS` or `REDACTION_MAX_DEPTH` |
| `redaction.pseudonymizedIdentities` | identity values replaced |
| `redaction.durationMs` | pass duration |

Plus `logger.warn` when `oversizedFields > 0` or when pseudonymization degraded to redaction, and `logger.error` on a failed pass. Datadog aggregates span attributes, so per-project rates are queryable without new metrics infrastructure.

### 4.9 Identity pseudonymization

When `identities === "pseudonymize"`, replace `userId` and `userEmail` with:

```text
anon_${hmacSha256Hex(secret, `${organizationId}:${value}`).slice(0, 16)}
```

- `hmacSha256Hex` from `@repo/utils` (`packages/utils/src/crypto.ts:44-51`). It is Web Crypto based and browser-safe, satisfying the "web-standard APIs in domain" rule; it returns an `Effect`, which is fine since the pass is already effectful.
- Secret from `LAT_REDACTION_PSEUDONYM_SECRET` via `parseEnvOptional`, parsed at the worker use site per repo convention (there is no central per-app `env.ts`).
- Org-scoped input so the same email in two organizations produces different pseudonyms, preventing cross-tenant correlation.
- Deterministic, so equality filters, `GROUP BY`, and every user-analytics query keep working. This is the entire point.
- **Memoize per batch**: build a `Map<string, string>` of distinct identity values so a 500-span batch performs a handful of HMACs, not 1000.
- **Empty values stay empty.** `userId`/`userEmail` default to `""`; pseudonymizing `""` would fabricate a user.
- **Missing secret degrades to full redaction** (`[REDACTED_USER]`), counted and logged at error level, rather than failing the job or passing plaintext through. Degrade toward more privacy, never less, and never block a self-hoster's ingestion on a config gap.

### 4.10 Ports

**Phase 1 introduces no port.** The deterministic redactor is a pure function set in `packages/domain/spans/src/redaction/`. An Effect service for one pure implementation is ceremony; introduce the port in Phase 4 when a second implementation exists.

When Phase 4 does add it, use this shape rather than the flat `redactBatch(texts: string[]) => string[]` from the original research report, which had two defects: it drops the role/kind context an NER model needs to perform well, and positional remapping of a flat array across a network boundary breaks silently if the remote returns a different length or order. It also contradicted its own HTTP contract by sending `skipKeys` to a service that had already received flattened leaves.

```ts
interface RedactionField {
  readonly path: string           // stable address for remapping, e.g. "inputMessages.2.parts.0.content"
  readonly kind: "text" | "json"
  readonly value: string
  readonly role?: string          // message role, when the field came from a message part
}

interface PiiRedactorShape {
  redact(input: {
    readonly fields: readonly RedactionField[]
    readonly policy: ResolvedRedactionPolicy
  }): Effect.Effect<
    { readonly fields: readonly RedactionField[]; readonly matchesByEntity: Readonly<Record<string, number>> },
    RedactionError
  >
}
```

Remap by `path`, never by index. Chunk requests by byte count with a cap; do not send one request per OTLP batch, since a 32 MiB batch can hold thousands of leaves.

---

## 5. Detector specification

`packages/domain/spans/src/redaction/detectors.ts`. Every detector returns `{ start, end, label }` matches. Precision is the design goal, not recall: a false negative leaves content visible, which the customer can see and report, while a false positive is permanent silent data corruption with no delete path.

**The traffic that decides these defaults is coding-agent telemetry** (`packages/telemetry/claude-code`, `openclaw`, `pi`). Any detector must survive git SHAs, semver strings, ports, timestamps, UUIDs, base64 in diffs, long numeric JSON ids, and file paths appearing in `tool_output`.

| Entity | Default | Rule | Precision notes |
| --- | --- | --- | --- |
| `email` | **on** | Standard local-part + dotted domain + 2+ char TLD | Very high. `@types/node` and `foo@bar` correctly do not match |
| `phone` | **on** | E.164 (`+` then 8-15 digits, word-boundaried) **and** NANP separated forms (`(NNN) NNN-NNNN`, `NNN-NNN-NNNN`, `NNN.NNN.NNNN`) | The likeliest FP source, hence individually disable-able. `2024-01-15` (4-2-2) and `192.168.1.100` do not match the 3-3-4 shape |
| `credit_card` | **on** | 13-19 digits with optional space/dash separators, **and** Luhn valid, **and** a known IIN prefix (`4`, `51`-`55`, `2221`-`2720`, `34`, `37`, `6011`, `65`, `35`, `30`, `36`, `38`) | Luhn alone gives ~1-in-10 FP on random digit runs. The IIN requirement is what makes this safe |
| `iban` | **on** | 2 letters + 2 digits + 11-30 alphanumerics, **and** mod-97 checksum == 1 | Checksum makes it very high precision |
| `us_ssn` | **on** | `NNN-NN-NNNN` with `-` or space separators only, excluding area `000`/`666`/`900`-`999`, group `00`, serial `0000` | Bare 9-digit matching is explicitly **excluded**: it would eat ids everywhere |
| `secret` | **on** | **Prefixed vendor forms only**: `sk-…`, `sk-ant-…`, `ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_`/`github_pat_`, `AKIA[0-9A-Z]{16}`, `xox[abposr]-…`, `AIza[0-9A-Za-z_-]{35}`, Stripe `(sk\|rk)_(live\|test)_…`, JWT `eyJ….….…`, and PEM `-----BEGIN … PRIVATE KEY-----` blocks | See the exclusion below |
| `ip_address` | **off** | IPv4 dotted-quad with octet range validation; IPv6 standard forms | Default off: `1.2.3.4` is a valid semver and version strings are everywhere in coding-agent traces |
| `crypto_wallet` | **off** | BTC (`bc1…`, base58 `[13]…`), ETH `0x[a-fA-F0-9]{40}` | Default off: collides with hex hashes, git SHAs, and content hashes |

**Explicitly excluded: any generic entropy or generic base64 "possible secret" heuristic.** On coding-agent traffic it fires on diffs, minified bundles, inline images, and hashes. It is the single most likely cause of catastrophic silent corruption, and no amount of tuning makes it safe on this traffic mix. If a customer needs it, that is what the Phase 4 remote tier is for.

---

## 6. Data, queue, settings, and API changes

### 6.1 New module

`packages/domain/spans/src/redaction/`:

| File | Contents |
| --- | --- |
| `labels.ts` | entity → label mapping, `[REDACTED_<LABEL>]` formatter, `REDACTION_MAX_FIELD_CHARS`, `REDACTION_MAX_DEPTH`, `REDACTION_BATCH_TIMEOUT_MS` |
| `detectors.ts` | One detector per entity per [§5](#5-detector-specification), plus Luhn and IBAN mod-97 helpers |
| `redact-text.ts` | `redactText(text, policy) => { text, matchesByEntity }`, including overlap resolution |
| `redact-json.ts` | Structure-aware walk over unknown JSON, string-leaf redaction, number-literal preservation |
| `redact-span.ts` | `redactSpanDetail(span, policy, pseudonyms) => { span, stats }` implementing [§4.2](#42-the-complete-field-surface) |
| `redact-spans.ts` | Batch entry point: per-project policy dispatch, pseudonym memoization, stat aggregation, timeout |
| `errors.ts` addition | `RedactionError extends Data.TaggedError("RedactionError")` in the existing `packages/domain/spans/src/errors.ts` (which currently holds only `SpanDecodingError`) |

### 6.2 Changed files

| File | Change |
| --- | --- |
| `packages/domain/shared/src/settings.ts` | `redactionSettingSchema`, `organizationRedactionSettingSchema`, both parent schemas, `resolveRedactionPolicy`, `ResolvedRedactionPolicy` |
| `packages/domain/spans/src/otlp/content/*.ts` + `index.ts` | Per-parser content-key matchers, composed into `isContentAttributeKey` |
| `packages/domain/spans/src/use-cases/ingest-spans.ts` | Resolve policy from `projectBySlug` + cached org settings, build the `redaction` map, pass it to `publisher.publish` |
| `packages/domain/spans/src/use-cases/process-ingested-spans.ts` | Accept `redaction` in the input, apply between `:133` and `:147`, annotate stats |
| `packages/domain/queue/src/topic-registry.ts` | `redaction?` on `span-ingestion:ingest` |
| `packages/platform/db-postgres/src/resolve-redaction-policy-cached.ts` | New, modeled on `resolve-effective-plan-cached.ts` |
| `apps/workers/src/workers/span-ingestion.ts` | Pass `wire.redaction` through; parse `LAT_REDACTION_PSEUDONYM_SECRET` |
| `apps/ingest/src/routes/traces.ts` | Provide the Redis cache layer needed by the cached org-settings resolver |
| `packages/operations/src/operations/projects.ts` | `RedactionSettingSchema` with `.describe()` per field, added to `ProjectSettingsSchema` (`:101-118`); settings updates pass `settingsPatch` ([T-12](#8-traps), [T-13](#8-traps)) and `redaction` routes to `updateProjectRedactionUseCase` for the audit event ([T-14](#8-traps)); regenerate `openapi.json` / `mcp.json` per the api-endpoints skill |
| `apps/web/.../settings/privacy.tsx` | New Privacy page: the project policy card plus the owner-only organization policy card ([§6.3](#63-ui)) |
| `apps/web/src/domains/projects/project-sections.ts` | Register `privacy` in the **Project** group of `PROJECT_SETTINGS_GROUPS` (`:148-170`) |
| `apps/web/src/domains/projects/projects.functions.ts` | Add `redaction` to `toRecord` (`:63-70`) — **see [T-11](#8-traps)** — and an admin/owner `updateProjectRedaction` server fn that merges rather than replaces |
| `apps/web/src/domains/organizations/organizations.functions.ts` | Widen the local `organizationSettingsSchema` (`:150-152`) and add an owner-only `updateOrganizationRedaction` server fn that merges and invalidates the redaction cache. **See [T-5](#8-traps): this is a data-loss trap** |
| `packages/ui/src/components/genai-conversation/parts/` | Placeholder → chip rendering in the markdown pipeline ([§6.4](#64-rendering-redacted-content)) |
| `.env.example` | `LAT_REDACTION_PSEUDONYM_SECRET` in the workers block near `:134`, with a development value rather than commented out, matching `LAT_MASTER_ENCRYPTION_KEY` and `LAT_BETTER_AUTH_SECRET`. A commented-out secret reads as "required but unconfigured" and made a reviewer ask whether local PII work needed it. |
| `docs/security/pii-redaction.mdx` | New "Ingest PII redaction" section; keep and rename the existing SDK section per [§2.4](#24-what-already-exists) |

### 6.3 UI

**A dedicated Privacy page**, `apps/web/src/routes/_authenticated/projects/$projectSlug/settings/privacy.tsx`, registered in the **Project** group of `PROJECT_SETTINGS_GROUPS`. An earlier draft put the project section on the General page next to `TraceSamplingSection`; the control surface is a switch plus eight entity checkboxes plus a scope toggle, an identity selector, and three sentences of compliance copy, which is a page rather than a card. The cascade is also unreadable when split across two pages: diagnosing "why is my project control greyed out" requires seeing the org policy next to it. So **both cards live on this one page**, the organization card rendered only for owners. That is consistent with how the settings area already works — every page under `settings/` is project-scoped by URL, including the org-level and personal ones.

Project policy card, using the `rounded-lg bg-muted/30` card shape of `TraceSamplingSection` (`general.tsx:196-257`) and the `Draft`/`pending`/`dirtyFields` pattern (`general.tsx:34-141`) reproduced on the new page:

- A `Switch`: redaction is on or off ([§4.3](#43-policy-model)).
- Entity checkboxes (`CheckboxInput`), revealed when redaction is on, in a `border-t` sub-row, pre-ticked from `DEFAULT_REDACTION_ENTITIES`. `phone` carries an inline note that it is the most false-positive-prone detector ([§5](#5-detector-specification)).
- Metadata-and-tags toggle and identity-handling `Select` in the same sub-row.
- `DotIndicator` on dirty, participating in a `dirtyCount` / Apply / Discard / cmd-S / `useBlocker` set.
- Copy must state: applies only to spans ingested from now on, takes effect within a minute, and redacted content cannot be recovered.
- `identities: "pseudonymize"` needs `LAT_REDACTION_PSEUDONYM_SECRET`; without it the value degrades to `[REDACTED_USER]` ([§4.9](#49-identity-pseudonymization)). Say so on the option rather than promising stable pseudonyms the deployment may not produce.
- When the org policy is `locked`, render the card read-only with an explanation naming the org policy, resolved through `resolveRedactionPolicy` so the reason and the `source` come from the same function the engine uses.

Organization policy card: the same controls plus `locked`, owner-only, with copy explaining that locking prevents projects from weakening it.

**Propagation is asymmetric and the copy should not flatten it.** Project settings are read per batch from an uncached `repo.findBySlug` (`ingest-spans.ts:136-139`), so a project toggle takes effect immediately. Only the organization half is the 60 s Redis TTL (`traces.ts:91`), and wiring `invalidateOrganizationRedactionCache` into the org write makes that immediate too, leaving the TTL as a backstop rather than the expected latency.

### 6.4 Rendering redacted content

Removing dry-run mode ([§4.3](#43-policy-model)) left the visible placeholder and the entity toggles as the *only* feedback a customer ever gets that redaction is working. An unstyled `[REDACTED_EMAIL]` in a wall of prose reads as model output or as corruption, so the placeholder has to render as something the platform obviously did on purpose.

A `rehype` plugin in the `MarkdownContent` pipeline (`packages/ui/src/components/genai-conversation/parts/markdown-content.tsx:137-144`) rewrites placeholders into an inline chip: a solid dark slab carrying the category in inverted monospace (`EMAIL`, `PHONE`, `US SSN`), with a `Tooltip` explaining what was removed and that it cannot be recovered.

- **The chip shows the label rather than hiding it.** A bar that *covers* text implies text underneath and invites a click-to-reveal that can never be honored, since redaction is destructive and there is no delete path ([T-4](#8-traps)). The censor-bar look is right; occlusion is not.
- **Match the placeholder shape**, `\[REDACTED_([A-Z][A-Z0-9_]*)\]`, not an allowlist of our own labels. An earlier draft required the allowlist so arbitrary customer text was never chipped, but that needs either a `@repo/ui` → `@domain/spans` dependency — which pulls the OTLP parsers and the redaction engine into the browser bundle — or a hand-maintained copy that drifts from the engine. The false-positive worry it addressed is already handled by keeping the copy provenance-neutral, which is required regardless because no per-span flag records who redacted a value. Shape matching also covers the SDKs' client-side masking, which emits the same grammar. Bare `[REDACTED]` carries no label and stays plain text.
- **Copy stays provenance-neutral.** A customer can configure client-side SDK masking that emits the same string ([§2.4](#24-what-already-exists)), and no per-span flag records who redacted what — so the tooltip says PII redaction replaced a value here, never that *this project's policy* did it. Closing that gap is [Phase 6](#phase-6---redaction-visibility).
- **`OVERSIZED_FIELD` gets its own sentence.** Nothing was detected there; the field exceeded `REDACTION_MAX_FIELD_CHARS` and was dropped wholesale ([§4.7](#47-size-and-time-budget)).
- **Prose only; code fences keep the literal placeholder.** `sourceMappedTextPlugin` tracks position inside `<code>` with a running character counter (`source-mapped-text-plugin.ts:71-92`), so a chip whose rendered text is shorter than the placeholder it replaces would shift every search highlight after it in that block. Skipping fences avoids that, and inside a JSON tool payload the literal string is the more useful thing to show, because it is what is stored and what gets copied.
- **Ordering matters.** The chip plugin runs *before* `sourceMappedTextPlugin` and assigns `position` offsets to the text nodes it splits out, so search-highlight and annotation offsets stay exact across a chip. The chip's own inner text gets no position, which correctly makes a placeholder unhighlightable and unannotatable.

---

## 7. Non-goals

- No retroactive redaction of already-stored spans. (Deletion is Phase 5.)
- No inline LLM-based redaction, ever. Latency, cost, non-determinism, and hallucination all disqualify it on the ingest path.
- No name, address, or free-form personal-detail detection in Phases 1-3. That is Phase 4.
- No generic entropy or base64 secret heuristic ([§5](#5-detector-specification)).
- No OCR or redaction inside `blob`/`file` part payloads.
- No redaction of span `name`, `serviceName`, `model`, or other identifier/enum columns.
- No client-SDK changes. The existing SDK attribute redaction stays as-is and keeps its own name.
- No change to `resolveSettingsCascade`/`ResolvedSettings`.
- Exposing `sampling` through the public API is a pre-existing gap (`packages/operations/src/operations/projects.ts:101-118` omits it) and stays out of scope. The shallow-merge change in [T-12](#8-traps) stops an API settings update from *wiping* it, which is a different thing from exposing it.

---

## 8. Traps

Numbered so PR review can reference them.

**T-1. `attr_string` duplicates all content.** Verified at `transform.ts:181-198` and `span-repository.ts:393`. Any scope that omits it ships a no-op. See [§4.2.2](#422-attribute-map-handling). **This is the single highest-risk item in the project.**

**T-2. `events_json` is an unscoped content channel.** Verified at `transform.ts:223`; no content parser reads events. Customers on the older OTel gen_ai convention have all content there.

**T-3. Raw payloads are buffered before redaction runs.** Redis job bodies (≤50 KB, 1000 completed + 1000 failed retained) and `tmp-ingest/` objects. Nothing deletes the blob after processing; only an S3 lifecycle rule at one day, and self-hosted local disk has none. Phase 2 must add an explicit `deleteFromDisk` after a successful insert (`packages/domain/shared/src/storage.ts:185` already provides it, and `StorageDiskPort.delete` exists at `:13`), and the docs must state the buffer's lifetime rather than claim raw content never lands anywhere.

**T-4. No delete path exists.** No `SpanRepository` delete method; project deletion is a PG soft-delete that never touches ClickHouse. This is why fail-closed is mandatory and why Phase 5 exists.

**T-5. The web org-settings update silently drops fields.** `apps/web/src/domains/organizations/organizations.functions.ts:150-152` defines a **local** `organizationSettingsSchema` containing only `keepMonitoring`, and `updateOrganizationUseCase` (`packages/domain/organizations/src/use-cases/update-organization.ts:20-30`) does a **full replace** of `settings`. Zod strips unknown keys, so writing org redaction settings through the current path would wipe `billing.spendingLimitCents` and `wantsShowcase`. The local schema must be widened to every field it needs to preserve, and a test must assert round-trip preservation.

**This is not latent — it fires in production today.** The collection's `onUpdate` always sends `settings` (`organizations.collection.ts:19-24`, `mutation.modified?.settings ?? {}`), so `input.settings` is never `undefined` and the replace always runs. Renaming an organization through `OrganizationNameForm` (`settings/organization.tsx:32-89`) therefore already wipes `billing.spendingLimitCents` and `wantsShowcase`. Fixing it is a prerequisite for storing anything else in org settings, not just a hazard this project introduces. The same defect exists on the project side ([T-11](#8-traps)) and in the public API ([T-12](#8-traps)).

**T-6. Do not add a worker-side `SettingsReader` fallback.** See [§4.5](#45-policy-resolution-decide-at-ingest-apply-in-the-worker). Absent policy means no redaction and that is correct at every rollout ordering; a fallback creates a second policy path with different caching that will silently diverge.

**T-7. Do not copy the 500 ms timeout or fail-open default from langfuse.** They are artifacts of a synchronous export path we do not have. See [§3](#3-competitive-context-and-engine-decisions), [§4.6](#46-failure-policy), [§4.7](#47-size-and-time-budget).

**T-8. Precision beats recall.** No delete path plus non-retroactive plus destructive means a false positive is permanent silent corruption. Every detector needs negative test vectors drawn from coding-agent traffic, not just positive vectors.

**T-9. `content_hash` stability.** `message_embeddings` and `trace_message_occurrences` key on content hashes computed downstream from `spans`. Redacted and unredacted copies of the same message hash differently, so dedup does not span a policy change. Acceptable and non-retroactive by design; note it in `dev-docs/spans.md` so it is not later mistaken for a bug.

**T-10. Search recall changes.** `trace_search_documents.search_text` and its tokenbf/ngrambf indexes are built from redacted content once redaction is on. Expected, but state it in the docs so support does not chase it.

**T-11. The project-settings write has the same defect as [T-5](#8-traps), and it silently disables redaction.** `toRecord` (`apps/web/src/domains/projects/projects.functions.ts:63-70`) picks settings fields one by one and omits `redaction` (and `settings.isShowcase`). `projects.collection.ts:55-68` sends `mutation.modified.settings` wholesale and `updateProjectUseCase` (`packages/domain/projects/src/use-cases/update-project.ts:105`) full-replaces. So once a project has a redaction policy, **the existing Signals toggle (`settings/signals.tsx:34-35`) and the existing sampling slider each turn it off**, with no error and nothing in the UI to indicate it. `toRecord` must carry every settings field the client round-trips. Prefer a dedicated merge-based server fn for the redaction write so a future settings writer cannot reintroduce this by omission.

**T-12. The public API can silently disable redaction.** `ProjectSettingsSchema` (`packages/operations/src/operations/projects.ts:101-118`) is shared by the response *and* `UpdateRequestSchema`, and the update execute replaces `settings` outright (`:293`). Adding `redaction` there without changing the semantics means `PATCH /projects/{slug}` with `{"settings":{"keepMonitoring":true}}` turns a compliance control off — exactly the failure mode [§4.4](#44-settings-cascade-authorization) says enterprises ask about. Settings updates therefore pass `settingsPatch` instead of `settings` ([T-13](#8-traps)). That is consistent with the field's existing description ("To clear overrides entirely, edit via the web UI") and it also fixes the pre-existing silent wipe of `sampling` and the onboarding flags.

**T-13. Merge at the boundary, never inside the update use cases.** The tempting one-line fix for [T-5](#8-traps), [T-11](#8-traps) and [T-12](#8-traps) is to make `updateProjectUseCase` / `updateOrganizationUseCase` merge instead of replace, fixing every caller at once. It would break billing. `updateSpendingLimitUseCase` (`packages/domain/billing/src/use-cases/update-spending-limit.ts:47-60`) **clears** `billing.spendingLimitCents` by rebuilding settings without the key and relying on the replace; under a top-level merge the stale `billing` object survives and removing a spending limit silently stops working. So `settings` keeps replace semantics and an explicit `settingsPatch` input carries patch intent instead. A caller that means "replace" and a caller that means "patch" are different operations and only the caller knows which it is, so both are named rather than one being inferred.

**The merge belongs inside the use case's transaction, not in the caller.** An earlier draft of this trap said the callers should merge. They cannot do it safely: a merge computed outside the transaction reads a snapshot that another writer can invalidate before the save, so the later write drops the earlier one's field. `settingsPatch` merges against a `findByIdForUpdate` read inside the transaction, which is the only placement that is both correct and impossible for a future caller to get wrong. A transaction alone is not enough — READ COMMITTED lets both transactions read the pre-write row, so the locking read is the load-bearing part.


**T-14. Gating the dedicated write does not gate the field.** Adding role checks and audit events to `updateProjectRedaction` / `updateOrganizationRedaction` leaves `redaction` writable through every *other* settings path: the web `updateProject` server fn (no role check at all), `updateOrganizationUseCase` for any direct caller, and `PATCH /v1/projects/{slug}`. Patch semantics make it worse rather than better, because the field then persists instead of being incidentally dropped. So any member could turn the compliance control off with nothing recorded.

The fix is a pin inside both generic use cases: `redaction` is forced to the stored value whatever the caller sent. That closes it for every current and future caller at one point each, rather than relying on each boundary schema to keep excluding the field. A replace therefore no longer fully replaces, which is the intended asymmetry. The public API keeps working by routing `settings.redaction` to the dedicated use case so it picks up the audit event; API keys are organization-scoped and carry no member role, so there is no role to check on that path.
---

## 9. Testing plan

Follow the layering in the testing skill: pure unit tests in the domain, PGlite/chdb testkit for integration, no `vi.mock` for repositories.

**Unit, `packages/domain/spans/src/redaction/*.test.ts`:**

- Each detector: positive vectors, plus **negative vectors from coding-agent traffic** (40-char git SHAs, `1.2.3`/`1.2.3.4` semver, `localhost:3000`, ISO timestamps, UUIDs, base64 diff hunks, 16-digit numeric JSON ids that fail Luhn or lack a valid IIN, `@types/node`, file paths).
- Luhn: rejects invalid cards; IIN gate rejects Luhn-valid non-card digit runs.
- IBAN mod-97: rejects a checksum-invalid candidate.
- SSN: rejects bare 9-digit runs and invalid area/group/serial values.
- Overlap resolution: longest-match-wins, adjacent non-overlapping matches, a match at offset 0, and a match at end-of-string.
- JSON walk: array length and order preserved, object keys preserved, non-string leaves untouched, `blob`/`file` parts skipped, nested stringified JSON handled, `JSON.stringify` round-trip stable, unknown part types fall through to the generic walk.
- `resolveRedactionPolicy`: every cascade combination, `locked` overriding a project policy entirely, `source` correctness, defaults when both sides are empty.
- Pseudonymization: determinism, cross-org divergence for the same input, empty values stay empty, missing secret degrades to `[REDACTED_USER]`.
- Oversized field: replaced wholesale and counted.

**Integration, `packages/domain/spans/src/use-cases/process-ingested-spans.test.ts` (extend the existing file):**

- `enforce` project: content redacted, **`attr_string` content keys dropped**, `events_json` redacted, `resource_string` values redacted.
- Project absent from the policy map: byte-identical to today's output. Add this as a regression guard against accidental unconditional redaction.
- Mixed batch: one `enforce` project and one absent project in the same OTLP batch, each handled correctly.
- `metadata` scope off by default and applied when on.
- Detector throw: no insert happens and the effect fails ([§4.6](#46-failure-policy)).
- Timeout: fails rather than inserting.

**Integration, `packages/domain/spans/src/use-cases/ingest-spans.test.ts` (extend; the fake `SettingsReader` layer pattern is at `:190` and the sampling suite at `:431`):**

- Policy stamped on the published job for an `enforce` project.
- `redaction` field absent when every project is `off`.
- Org `locked` policy overriding a project's weaker policy.
- Multi-project batch produces one map entry per non-`off` project.
- Cached org resolver: cache hit performs no query; a cached absence is served rather than re-queried; a cache failure falls back to a database read; a database read failure propagates rather than resolving to "no org policy", so a `locked` organization policy can never fall through to a weaker project policy.

**Web:** org settings round-trip preserves `billing.spendingLimitCents` and `wantsShowcase` ([T-5](#8-traps)).

**Benchmark:** per [§4.7](#47-size-and-time-budget). Record the numbers in the Phase 2 PR description.

---

## 10. Open questions

1. **Latitude's own API key format** for the `secret` detector. Derive it from `packages/domain/*/api-keys` rather than guessing, or drop it from the detector.
2. ~~**Should the UI surface a per-span "content was redacted" indicator** beyond the inline placeholder?~~ **Answered: yes, but deferred to [Phase 6](#phase-6---redaction-visibility).** Phase 3 addresses the "reads as data loss" half by styling the placeholder itself ([§6.4](#64-rendering-redacted-content)); a real per-span indicator needs a stored signal that does not exist today, so it is a migration rather than a UI change.
3. **ClickHouse deletion mechanics for Phase 5.** Lightweight `DELETE FROM` versus `ALTER TABLE … DELETE`, cost at our partition sizes, and how `traces`/`sessions` aggregate state is corrected. Needs its own design pass before that phase is scoped.
4. **Should `phone` be pre-ticked** when a project opts in? It is the highest-false-positive detector in `DEFAULT_REDACTION_ENTITIES`. **Decided for Phase 3: keep it pre-ticked and flag it in the UI**, since redaction itself is opt-in and every entity is individually disable-able, so the cost of a wrong default is a visible placeholder the customer can turn off rather than silent loss. Measuring it properly is [P6-3](#phase-6---redaction-visibility): a script that reads a sample of real spans from ClickHouse and runs `findRedactionMatches` over them, reporting matches per entity with surrounding context. That reads customer content, which is why it is a deliberate decision rather than a chore.
5. **Should `span-ingestion` retry before dropping a batch?** It runs on BullMQ's default single attempt today, so any failure — redaction or otherwise — drops the batch immediately. Fail-closed redaction is correct either way, but "retry then drop" loses far less data than "drop", and a transient ClickHouse or object-store blip currently costs the whole batch. Adding `attempts` changes failure handling for all ingest, not just redaction, so it needs its own decision. Duplicate inserts on retry are safe: `spans` is a `ReplacingMergeTree`.
6. **Is a customer-facing redaction preview worth building?** Running the detectors on demand over spans already in ClickHouse, returning counts plus before/after samples, is the only honest way to answer "will this eat my tool outputs" before enabling it. It is out of scope here ([§4.3](#43-policy-model)) but it is the feature a dry-run mode was standing in for, and without it a customer's first enforce is their validation. Carried as [P6-2](#phase-6---redaction-visibility).

---

## 11. Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 - Redaction core (pure, unwired)

- [x] **P1-1**: Add `redactionSettingSchema`, `organizationRedactionSettingSchema`, `REDACTION_MODES`, `REDACTION_ENTITIES`, `DEFAULT_REDACTION_ENTITIES`, `ResolvedRedactionPolicy`, and `resolveRedactionPolicy` to `packages/domain/shared/src/settings.ts`. Wire the new keys into `projectSettingsSchema` and `organizationSettingsSchema`. Do not touch `resolveSettingsCascade`.
- [x] **P1-2**: `redaction/labels.ts` and `redaction/detectors.ts` per [§5](#5-detector-specification), including Luhn and IBAN mod-97 helpers. No generic entropy detector.
- [x] **P1-3**: `redaction/redact-text.ts` with overlap resolution per [§4.3](#43-policy-model).
- [x] **P1-4**: `redaction/redact-json.ts` structure-aware walk with skip-keys, `blob`/`file` skipping, and stringified-JSON handling.
- [x] **P1-5**: Per-parser content-key matchers in `packages/domain/spans/src/otlp/content/*`, composed into `isContentAttributeKey` in `content/index.ts` next to the existing dispatch table. Cover all eight vendor families.
- [x] **P1-6**: `redaction/redact-span.ts` implementing the full field surface in [§4.2](#42-the-complete-field-surface), and `redaction/redact-spans.ts` batch entry point with pseudonym memoization, stat aggregation, and the size cap.
- [x] **P1-7**: `RedactionError` in `packages/domain/spans/src/errors.ts`.
- [x] **P1-8**: Unit tests per [§9](#9-testing-plan), including the coding-agent negative vector corpus.

**Exit gate** — met:

- [x] `pnpm --filter @domain/spans test` (1208 tests) and `pnpm --filter @domain/shared test` (168) pass. `pnpm typecheck` clean across all 90 packages. `pnpm knip` and `pnpm format` clean.
- [x] Every entity in `REDACTION_ENTITIES` has positive vectors and, where immunity is achievable, negative vectors. `ip_address` is the exception and is pinned as such: a test asserts it *does* match version strings, which is the reason it is off by default. Asserting immunity there would have been false.
- [x] `isContentAttributeKey` covered for all eight vendor parsers, with vectors derived from the parsers' own declarations rather than restated in the test.
- [x] Diff is inert: no non-test file outside `src/redaction/` imports the module, verified by grep.
- [x] Validators, overlap resolution, and `attr_string` key-dropping each mutation-tested — disabling them fails 9, 2, and 2 tests respectively, so none are decorative.

**Findings from Phase 1** (fold into the relevant sections when promoting to `dev-docs/`):

- The email local-part class must exclude `/`, `=`, `?` and `&`. They are RFC-legal and effectively never issued, but they precede addresses constantly in URLs, paths, and query strings, and including them ran the match left through the whole path: `https://api.example.com/v1/users/john@example.com` collapsed to `https:[REDACTED_EMAIL]`.
- Dropping content attribute keys is **not** redundant with the `attr_string` value pass, which was the original justification. The value pass only removes what a pattern matches; the duplicate copy also holds names, addresses, and ordinary prose. Dropping is the only thing that removes those.
- `REDACTION_MAX_FIELD_BYTES` became `REDACTION_MAX_FIELD_CHARS`. A byte count would mean encoding every leaf just to size it; UTF-16 code units are exact and allocation-free.
- Effect in this repo is `4.0.0-beta.57`, which has no `Effect.timeoutFail`. Use `Effect.timeoutOrElse`, as `semantic-similarity.ts` and `name-taxonomy.ts` already do.

### Phase 2 - Pipeline wiring

- [x] **P2-1**: `packages/platform/db-postgres/src/resolve-redaction-policy-cached.ts`, modeled on `resolve-effective-plan-cached.ts`: key `org:${organizationId}:settings:redaction`, 60 s TTL, Zod-validated payload, `cache.hit` annotation, `invalidateOrganizationRedactionCache`.
- [x] **P2-2**: Add `redaction?: Record<string, SerializedRedactionPolicy>` to `span-ingestion:ingest` in `packages/domain/queue/src/topic-registry.ts`.
- [x] **P2-3**: In `ingestSpansUseCase`, resolve the per-project policy from the already-loaded `projectBySlug` plus the cached org settings, and stamp the map onto the published job. Omit `off` projects and omit the field entirely when the map is empty.
- [x] **P2-4**: Provide the Redis cache layer the resolver needs in `apps/ingest/src/routes/traces.ts`.
- [x] **P2-5**: In `processIngestedSpansUseCase`, accept `redaction`, apply the pass between `decodeAndTransform` and `repo.insert`, and fail closed. No timeout wrapper is needed here: Phase 1's `redactSpans` already owns the budget with a per-span deadline, because the walk is synchronous and an `Effect` timeout around it could not fire until it had already finished.
- [x] **P2-6**: Pass `wire.redaction` through `apps/workers/src/workers/span-ingestion.ts`; parse `LAT_REDACTION_PSEUDONYM_SECRET` with `parseEnvOptional` at the use site; add it to `.env.example` in the workers block.
- [x] **P2-7**: Emit every annotation in [§4.8](#48-observability), plus the `warn`/`error` logs.
- [x] **P2-8**: Delete the `tmp-ingest` blob after a successful insert via `deleteFromDisk` ([T-3](#8-traps)). Delete only after `repo.insert` succeeds, and treat a delete failure as non-fatal (the lifecycle rule is the backstop).
- [x] **P2-9**: Integration tests per [§9](#9-testing-plan) in both `process-ingested-spans.test.ts` and `ingest-spans.test.ts`.
- [x] **P2-10**: Run the benchmark in [§4.7](#47-size-and-time-budget) and record p50/p99 per-span cost and the concurrency-50 CPU delta in the PR description.

**Exit gate** — met:

- [x] With every project `off`, inserted rows are byte-identical to pre-change output, asserted two ways: no `redaction` field, and an empty `redaction` map.
- [x] An `enforce` project's inserted row has redacted content **and** no content keys left in `attr_string`, while its operational attributes survive.
- [x] A malformed policy produces zero inserts and fails the job. Verified by mutation: skipping malformed policies instead of failing breaks two tests.
- [x] The `tmp-ingest` object is gone after a successful large-payload ingest, and a failed delete does not fail the ingest. Verified by mutation: removing the delete breaks one test.
- [x] Benchmark run and recorded below; the target is met with headroom rather than missed.

**Benchmark results.** Measured over 200 coding-agent-shaped spans (prose, a diff, a tool call carrying that diff, plus real hits), redacting through `redactSpans` after the real `transformOtlpToSpans`. Warm-up discarded, 40 batches sampled.

| Scanned content | per-span p50 | per-span p99 |
| --- | --- | --- |
| ~8 KB/span | 0.153 ms | 0.182 ms |
| ~29 KB/span | 0.685 ms | 1.223 ms |

Added CPU at the 29 KB point is **0.590 ms/span**, i.e. roughly **1,700 spans/sec per core** of redaction capacity. Against the §4.7 target of ≤ 5 ms/span at ~32 KB, that is about 4× headroom at p99.

Two notes on interpreting this, because "concurrency 50" invites a wrong reading:

- The worker event loop is single threaded, so concurrency 50 **interleaves** batches rather than parallelising this cost. The number that matters is the per-core throughput above, not a 50× multiple.
- Projects with redaction `off` cost **0.000 ms**: `redactSpans` returns the identical array before touching a span. So this cost applies only to opted-in projects, not to ingestion generally.

The benchmark was run as a throwaway script and not committed. The repository has no benchmark convention, and adding one would put ~15 s on every `@domain/spans` CI run for a number that only needs re-measuring when the engine changes. Re-derive it from the methodology above if the walk is modified.

**Findings from Phase 2** (fold into the relevant sections when promoting to `dev-docs/`):

- **Deleting the buffered payload has to happen after the events are published, not after the insert.** The first placement made a job that died mid-processing unrecoverable: stalled-job redelivery found no payload, so the batch stayed inserted with `TracesIngested` never fired, silently losing trace-end, billing, and search indexing. Caught by an existing worker test that ingests the same `fileKey` twice.
- **`span-ingestion` has no retries.** No `attempts` on the topic and no `defaultJobOptions` on the queue, so BullMQ's default of one attempt applies. Several earlier notes in this spec claimed a failed pass "retries"; it does not, it drops. Corrected in [§2.2](#22-worker-path) and [§4.6](#46-failure-policy), and raised as [open question 5](#10-open-questions).
- **Fixing the bridging bug narrowed the grouped shapes and lost Diners.** Splitting the credit-card pattern left only 4-4-4-N and 4-6-5, so the 4-6-4 form stopped matching while its compact form still did. Every grouping a real issuer prints is now enumerated and tested in both separators. Generalising to "groups of four to six digits" is the wrong fix: an open-ended repetition swallows a trailing group, overruns 19 digits, and fails the length gate with the card inside the discarded match, which is the bridging bug again.
- **The buffered-payload delete has to run on the empty-batch path too.** The early return for a batch whose spans were all rejected skipped it, leaving an unredacted object behind with no lifecycle rule under it on self-hosted disk. The delete belongs on every success exit and on none of the failure paths, so a finalizer is the wrong tool: a failed job may be redelivered and redelivery needs the payload.
- **A separator-bridging pattern loses the value it was meant to catch.** The credit-card candidate allowed an optional space or dash between *any* two digits, so in `+14155552671 4111111111111111` it consumed both numbers as one over-long run, failed the issuer check, and never reconsidered the real card inside — a silent missed redaction. Fixed the way IBAN already was: separate compact and grouped patterns, with the grouped ones backreferencing their own separator so a match cannot span two numbers. The class is easy to reintroduce and invisible without an adjacency test, so every multi-part detector needs one.
- **Removing dry run removed the only feedback on false negatives.** Nothing now reports what redaction missed, which is why detector precision has to be right by construction and why detector tuning belongs in an offline script rather than a product mode ([§4.3](#43-policy-model)).
- `RedactionPolicy` was split out of `ResolvedRedactionPolicy`. The engine never needed `source`, which exists only so the UI can say "inherited from organization", and keeping it out of the wire format avoids either shipping a display field through the queue or inventing a fake value on deserialize. With one active mode, presence in the policy map *is* the decision, so `RedactionPolicy` carries no mode and the wire format has no `mode` field.
- A malformed wire policy must fail the job. The obvious reading of "degrade toward more redaction" would skip it, but skipping is the *less* redacting choice: it resolves a corrupt policy on a project that opted in to a plaintext write. Absent and malformed are therefore handled differently, which is worth stating because they look interchangeable.
- `@domain/queue` gained a dependency on `@domain/shared` for the wire type. No cycle, since `@domain/shared` has no workspace dependencies beyond `@repo/utils`.
- Effect `4.0.0-beta.57` has no `Effect.catchAll`. Use `Effect.ignore` for "discard any failure"; the available surface is `catchCause`, `catchTag`, `catchIf`, `catchDefect`, `ignore`, `orElseSucceed`.
- The `@platform/db-postgres` suite has pre-existing PGlite `beforeAll` contention flakiness: the same tree produced 47/47 passing and 5 timed-out `setupTestPostgres` hooks on consecutive full runs, while the affected files pass in isolation. Unrelated to redaction; do not chase it when it appears.
- **The single-write-path claim is verified structurally, not just by test.** `spans` has exactly one writer (`SpanRepository.insert`, called only from `processIngestedSpansUseCase`), the table is written from exactly one place in the ClickHouse adapter, and `span-ingestion:ingest` has exactly one publisher and one consumer. Seed tooling POSTs to `/v1/traces` rather than writing directly, so it traverses the same path. Re-check these four facts if redaction ever appears to be bypassed:
  - `grep -rn 'table: "spans"'` → only `span-repository.ts`
  - `grep -rn 'repo.insert'` → only `process-ingested-spans.ts`
  - `grep -rn '"span-ingestion"'` → only `ingest-spans.ts` (publish) and the worker (subscribe)
  - `grep -rn 'v1/traces' tools/live-seeds` → seeds use the HTTP boundary

### Phase 3 - Surfaces: UI, API, docs

- [x] **P3-1**: Fix the settings-wipe defects first, because every later task writes through them. Add an explicit `settingsPatch` input to both update use cases, merged against a locking read inside the transaction, and leave `settings` as replace ([T-13](#8-traps)). Patching is what preserves the keys the web's local Zod schemas strip, so [T-5](#8-traps) needs no schema widening. Add `redaction` to `toRecord` so the Privacy page can read the current policy ([T-11](#8-traps)); `settings.isShowcase` then needs no entry, since the merge preserves it and adding it would collide with the record's top-level `isShowcase`. Round-trip tests: a project write preserves `redaction`, an org write preserves `billing.spendingLimitCents` and `wantsShowcase`, and **clearing a spending limit still clears it** ([T-13](#8-traps)).
- [x] **P3-2**: Dedicated server fns — `updateProjectRedaction` (`admin`/`owner`) and `updateOrganizationRedaction` (`owner`). Both read-modify-write so they merge rather than replace, log actor plus before/after, and the org one calls `invalidateOrganizationRedactionCache`. Roles come from `MembershipRepository.isAdmin` (admin **or** owner) and `findByOrganizationAndUser` for owner-only; neither `updateProject` nor `updateOrganization` has any role check today, so this is new gating rather than a tightening, and it must not gate project renames or the sampling slider.
- [x] **P3-3**: The Privacy page per [§6.3](#63-ui): route, `PROJECT_SETTINGS_GROUPS` entry, project policy card, `locked` read-only state.
- [x] **P3-4**: Organization policy card on the same page, owner-only, including `locked`.
- [x] **P3-5**: `RedactionSettingSchema` in `packages/operations/src/operations/projects.ts` with a `.describe()` on every field, added to `ProjectSettingsSchema`, **plus shallow-merge semantics for settings updates** ([T-12](#8-traps)). Regenerate `openapi.json` and `mcp.json`, then `pnpm generate:all` for the SDKs and CLI, per the api-endpoints skill — `api-manifests.yml` fails on drift.
- [x] **P3-6**: Placeholder → chip rendering per [§6.4](#64-rendering-redacted-content), with tests in the existing `markdown-content.test.tsx` covering a chip mid-sentence, a chip at offset 0, two chips in one text node, an unknown label left as plain text, and search-highlight offsets still exact for text following a chip.
- [x] **P3-7**: Extend `docs/security/pii-redaction.mdx` with the ingest-redaction section: the exact promise from [§1](#1-purpose-and-the-exact-promise), the entity coverage matrix, the propagation window, non-retroactivity, buffer lifetime ([T-3](#8-traps)), and the search/dedup notes ([T-9](#8-traps), [T-10](#8-traps)). Rename the existing section to "SDK attribute redaction."
- [x] **P3-8**: Write `dev-docs/spans.md` and `dev-docs/settings.md` sections for the redaction stage and the settings cascade. `settings.md` already has a `## Field Resolution` section with a `keepMonitoring` subsection; the cascade goes there.

**Exit gate** — met except the manual end-to-end pass, which needs a running stack:

- [ ] A toggle set in the UI round-trips and takes effect on newly ingested spans, verified manually end to end.
- [x] Org `locked` visibly disables the project control.
- [x] Org settings round-trip preserves `billing.spendingLimitCents` and `wantsShowcase`; project settings round-trip preserves `redaction` across a Signals-toggle and a sampling write.
- [x] A member-role user cannot change either policy; a non-owner cannot change the org policy.
- [x] A redacted span renders chips in the conversation view, and search highlighting in the same message still lands on the right characters.
- [x] The public doc contains no claim stronger than the promise in [§1](#1-purpose-and-the-exact-promise).
- [x] `pnpm typecheck`, `pnpm format`, and knip all clean (the pre-commit hook runs `turbo format` plus knip; unused exports block the commit).

**Findings from Phase 3** (fold into the relevant sections when promoting to `dev-docs/`):

- **The settings-wipe defect had a third face, and merging at the boundary was the wrong shape for it.** [T-13](#8-traps) rules out merging inside the use cases, but merging in each *caller* leaves a read-modify-write race and has to be re-done correctly by every future caller. An explicit `settingsPatch` input, merged against the freshly-read row inside the existing transaction, closes the race and keeps `settings` (replace) available for the one caller that needs it. Replace and patch are different operations and only the caller knows which it means; naming both makes that explicit rather than implicit.
- **[T-5](#8-traps) needed no schema widening at all.** Once the write patches, the keys the web's local Zod schema strips are simply absent from the patch and survive untouched. The originally-planned widening would have been a second place to forget a field.
- **The chip should match the placeholder shape, not an allowlist of our own labels.** [§6.4](#64-rendering-redacted-content) called for a strict list. That would have meant either a `@repo/ui` → `@domain/spans` dependency, pulling the OTLP parsers and redaction engine into the browser bundle, or a hand-maintained copy that drifts. A shape match needs neither, and it also covers the SDKs' client-side masking, which emits the same grammar. The false-positive worry the allowlist addressed is already handled by keeping the tooltip copy provenance-neutral — which it has to be regardless, since no per-span flag records who redacted what.
- **Radix tooltip content does not render in `renderToStaticMarkup`.** It mounts on hover, so copy assertions have to live in a unit test of the pure explanation function rather than in the markdown render test. Worth knowing before writing a render test that asserts tooltip text.
- **English articles cannot be derived from spelling.** The chip explanation first inferred "a" vs "an" from the leading letter, which produced "A IP address" — "IP" and "SSN" read with "an" despite starting with consonant letters. Articles are written out per phrase now.
- **Owner-only authorization could not be symmetric with the domain-side precedent.** `updateSpendingLimitUseCase` checks the role inside the use case, but `@domain/projects` cannot import `MembershipRepository` from `@domain/organizations` without a cycle (organizations already depends on projects). Both redaction gates therefore live in the web server functions. A future public-API path has no member role to check anyway, since API keys are organization-scoped.
- **Gating the write is not the same as gating the field, and this one got shipped wrong.** Role checks and audit events went on the dedicated server functions while every other settings path still accepted `redaction`; patch semantics then made the field persist rather than be dropped. Caught in review, now [T-14](#8-traps). The lesson generalises: when a field needs different authorization from its siblings, the enforcement has to sit where the write happens, not where the intended caller happens to be.
- **A transaction is not a lock.** The `settingsPatch` merge was described as closing the read-modify-write race because it ran inside the transaction. Under READ COMMITTED both transactions read the pre-write row, so the race was still open; `findByIdForUpdate` is the part that closes it. `OrganizationRepository` already had the method, which is a hint the pattern was already needed elsewhere.
- **PGlite cannot test row locking.** It runs a single in-process connection, so two "concurrent" transactions serialize and a concurrency test passes with the non-locking read too. Verified by mutation before deleting the test that had been written for it — a green test that proves nothing is worse than an acknowledged gap.
- **Radix tooltip content is absent from `renderToStaticMarkup`.** It mounts on hover, so tooltip copy has to be asserted through the pure function that produces it, not through a render test.
- **A negative assertion is only as good as the string it forbids.** The provenance-neutrality test forbade "this project's policy", so copy saying "this project" passed. Assert on the shortest offending substring, not the phrasing that happened to be wrong first.
- **Intermediate commits can break `knip` even when the final tree is clean.** A server function with no caller yet is an unused export, and the pre-commit hook blocks on it. Sequencing the write path into the same commit as its first caller, rather than a commit earlier, keeps every commit independently green.


### Phase 4 - Optional ML tier

- [ ] **P4-1**: `PiiRedactor` port with the structured shape in [§4.10](#410-ports); refactor the deterministic implementation behind it as `DeterministicPiiRedactorLive`.
- [ ] **P4-2**: `RemotePiiRedactorLive` over web-standard `fetch`. Env: `LAT_PII_REDACTOR_URL`, `LAT_PII_REDACTOR_TIMEOUT_MS` (seconds-scale default, not 500 ms), `LAT_PII_REDACTOR_MAX_RETRIES`, `LAT_PII_REDACTOR_FAIL_OPEN` (default `false`). Chunk by byte count; remap results by `path`, never by index.
- [ ] **P4-3**: Circuit breaker so a dead sidecar under fail-closed does not halt ingestion indefinitely.
- [ ] **P4-4**: Dockerized GLiNER (`urchade/gliner_multi_pii-v1`, Apache-2.0, ~350 MB int8) reference sidecar plus a Compose entry, so the HTTP contract ships with something to point at. Document the image size and RAM budget.
- [ ] **P4-5**: New `person_name` and `address` entities, available only when a remote redactor is configured, default off.
- [ ] **P4-6**: Tests with a stub server covering timeout, retry, fail-closed and fail-open, chunking, and length-mismatch handling.

**Exit gate**:

- Names and addresses are redacted in an integration test against the reference sidecar.
- With no `LAT_PII_REDACTOR_URL`, behavior is byte-identical to Phase 3.
- Sidecar down plus fail-closed does not wedge the queue indefinitely; the breaker is asserted by test.
- Every new dependency is MIT/Apache-2.0/BSD/ISC, audited transitively per `CLAUDE.md`.

### Phase 5 - Content deletion path

> Needs its own design pass before scoping. Open question 3 in [§10](#10-open-questions) must be answered first. Likely splits into its own spec.

- [ ] **P5-1**: Design memo on ClickHouse deletion semantics for `spans` and the correction of `traces`/`sessions` aggregate state, plus the derived tables in [§2.3](#23-every-place-span-content-lands) that hold independent copies (`trace_search_documents`, `memory_blobs`, `dataset_rows`, `taxonomy_*`, `session_moment_labels`).
- [ ] **P5-2**: `SpanRepository` deletion methods and a `deleteTraceContentUseCase` scoped by organization.
- [ ] **P5-3**: Cascade deletion across every derived table.
- [ ] **P5-4**: API and UI entry points; audit logging of every deletion.
- [ ] **P5-5**: Make project deletion actually purge ClickHouse rather than only soft-deleting in Postgres.

**Exit gate**:

- A trace's content is verifiably gone from every table in [§2.3](#23-every-place-span-content-lands), asserted by test.

### Phase 6 - Redaction visibility

> Needs its own design pass. Both items answer the same question — "what did redaction actually do to my data?" — which Phase 3 can only answer through the inline chip ([§6.4](#64-rendering-redacted-content)), and which nothing answers for false negatives at all.

- [ ] **P6-1**: Per-span "content was redacted" indicator. Requires a stored signal: the [§4.8](#48-observability) stats land on Latitude's own telemetry span, not on the row, so nothing in `spans` records that a policy ran. Needs a ClickHouse column (entity counts, or at minimum a boolean plus the policy `source`), which makes it a migration rather than a UI change. It is also what would let the chip tooltip attribute a placeholder to *this project's policy* instead of staying provenance-neutral.
- [ ] **P6-2**: Customer-facing redaction preview — run the detectors on demand over spans already in ClickHouse and return counts plus before/after samples ([open question 6](#10-open-questions)). The only honest way to answer "will this eat my tool outputs" before enabling enforce, and the thing a dry-run mode was standing in for.
- [ ] **P6-3**: Offline detector-tuning script ([open question 4](#10-open-questions)): read a sample of real spans and report matches per entity with surrounding context. Reads customer content, so it needs an explicit decision about which org to sample before it runs.
- Deletion is organization-scoped at the boundary and cannot cross tenants.
