# Imports

**Imports** bring a customer's *historical* telemetry from another observability platform into Latitude. A user connects Langfuse, LangSmith or Braintrust from project settings, picks a range and a ceiling, and Latitude backfills that history as spans.

The capability exists because forward ingestion is not enough to switch platforms: evaluations, monitors, signals and search are only useful over the history a team already has. Imported traces therefore go through **the same pipeline as live ingestion** and are **billed the same way** — an imported trace is not a cheaper second-class trace.

Origin: LAT-721, from Braintrust-workshop feedback.

## How it works at a glance

1. A wizard collects a source, a **region**, credentials, a source project, a range and a trace ceiling, and runs a **dry-run preview** before anything is persisted.
2. Confirming writes one `import_jobs` row, commits it, and only then hands it to a queue.
3. A worker processes **one bounded page at a time**, writes normalized spans to ClickHouse, advances a cursor, and re-enqueues itself until the range or a ceiling is exhausted.
4. Each page publishes `TracesIngested`, so conversation intelligence, embeddings, search indexing, flaggers and billing all run on imported history without a second code path.

There is no Temporal workflow: a self-advancing BullMQ page chain matches the data-destinations backfill model (see [`data-destinations.md`](data-destinations.md)) and keeps every job short.

## Core pieces

| Piece | Role |
| --- | --- |
| **`@domain/imports`** | The engine: entities, the region table, use-cases, and the `ImportSourceAdapter` port. Owns scheduling, cursor persistence, limits, retries, idempotency, stats and terminal states. |
| **`@platform/import-sources`** | The three adapters. Own vendor API calls and normalization, nothing else. |
| **`import_jobs`** | One Postgres row per user-confirmed import — the single source of truth for config, cursor, stats, run history, status and sanitized errors. |
| **`imports` queue topic** | `start` (queued → running, publishes the first page) and `fetchPage` (one page, then re-enqueues itself). |
| **Imports worker** | `apps/workers/src/workers/imports.ts`, concurrency 8 — a low-priority lane that cannot starve ingestion. |

### Engine vs. adapter — the key boundary

An adapter answers four questions about one vendor: can these credentials connect, what projects can they see, what does a sample look like, and give me one page of rows for this window. Everything else — ordering, cursors, caps, billing, redaction, ClickHouse writes, run history — is the engine's. Adding a fourth source is a new adapter, not a new pipeline.

## Cloud regions, and why there is no host field

Every supported platform runs in **more than one cloud region**, and those regions are fully separate deployments: accounts, data and API keys do not cross between them. So the wizard has to ask which one the user is in.

It asks for a **region**, never a URL. `packages/domain/imports/src/entities/import-region.ts` is the only place a region becomes an origin:

| Source | Regions |
| --- | --- |
| Langfuse | EU `cloud.langfuse.com` · US `us.cloud.langfuse.com` · Japan `jp.cloud.langfuse.com` · HIPAA US `hipaa.cloud.langfuse.com` |
| LangSmith | GCP US `api.smith.langchain.com` · GCP EU `eu.api.smith.langchain.com` · GCP APAC `apac.api.smith.langchain.com` · AWS US `aws.api.smith.langchain.com` |
| Braintrust | US `api.braintrust.dev` · EU `api-eu.braintrust.dev` |

This is the whole security story. A user-supplied host would be a server-side request forgery surface — the worker would fetch whatever URL it was handed, including cloud metadata endpoints and internal services — and defending that needs host validation, DNS resolution checks and connection pinning against rebinding. Taking the origin from an internal table removes the surface instead of guarding it. Two invariants keep it removed:

- The client only ever receives region **ids and labels** (`IMPORT_SOURCE_REGION_OPTIONS`); the base URLs never reach the browser.
- `config.sourceBaseUrl` is validated against that table by the config schema, so a hand-edited row cannot redirect the worker.

The region travels on the **credentials**, because connection tests, project listing and preview all run before a job exists. At confirmation it is resolved once into `config.sourceRegion` and `config.sourceBaseUrl`, and `fetchPage` reads the snapshot — a job settled on one region keeps talking to it for its whole page chain, which is what makes a resumed cursor meaningful. Retrying with credentials from a different region is refused (`ImportRegionMismatchError`) rather than silently repointed.

Self-hosted deployments are out of scope. Supporting them means reintroducing a caller-supplied host and the SSRF defences that go with it.

## Job lifecycle

`created → queued → running → { succeeded | capped | cancelled | failed }`

`created` is pre-flight: the row exists but no worker knows of it. `enqueueImportUseCase` is the **only** writer of `queued` and the **only** accepter of `created`, which makes enqueueing exactly-once by construction — a second attempt fails instead of publishing a duplicate message.

**Never publish a queue message inside a transaction.** A BullMQ publish does not roll back with one, and BullMQ delivers immediately: a worker reading on its own connection would find the job absent or still `created` and — because `startImport` treats an unexpected status as nothing to do, on a topic published with no retry configured — complete the message without starting anything, stranding the job in `queued` with the org's only import slot held. So the status commits first and the publish follows, with a failed publish settling the job as `failed` (`Import queue publish failed`). The **outbox** write is the opposite case and belongs inside the transaction: it is a Postgres row, so it commits or rolls back with the status it describes.

**One unfinished import per org**, enforced by a partial unique index on `organization_id where status in ('created','queued','running')` plus a `findActive()` check in the use-cases. `created` sits inside the predicate deliberately: the slot is claimed by the insert, so a concurrent create fails on `save` — where the unique violation maps to a typed `ConflictError` — rather than later on the flip to `queued`.

Terminal transitions all funnel through one `finishImport` helper, which writes the status, stamps `finished_at`, **scrubs credentials**, and emits `ImportFinished` in the same transaction. Pairing them is what stops one of the many terminal branches in the page loop from silently skipping the event.

Cancellation is **cooperative**: `cancelImportUseCase` stamps `cancelled_at` and the worker flips the status between pages, so latency is one page. A `created` job is the exception — nothing would ever observe the stamp, so it is settled terminally on the spot, which also frees the org's slot.

Analytics events: `ImportStarted` (a new import), `ImportRetried` (a resumed one, carrying `from*` lineage), `ImportFinished` (any terminal state). "Imports begun" is the first two summed. All three go through the outbox and are whitelisted for PostHog.

## Newest-first ordering

Billing makes ordering load-bearing: if an import can only afford part of a range, the part it keeps must be the **most recent**. That has to hold for all three sources, and **Langfuse's observations endpoint has no sort parameter at all**.

So ordering is the engine's job. The engine reads the range as **windows walking backwards from `rangeTo`**:

- A window is `[max(rangeFrom, windowEnd - windowMs), windowEnd)`; the adapter pages inside it with its own native cursor.
- When a window is exhausted, `windowEnd` drops to that window's start.
- The base width is one day, which is therefore the granularity at which a capped import truncates.
- A window whose first page comes back empty widens 4× (bounded at 32 days), so a sparse year costs a handful of requests rather than 365.

Windows alone are not enough, because widening makes them wide: four empty days in a row and the next window covers sixteen, so "newest first" would mean "some traces out of a fortnight". The widening is triggered by sparse history, which is exactly when it matters most.

So the cap is applied to a **sorted, whole-trace** view of each page (`admitNewestTraces`): spans are grouped by trace, traces ordered by their root's start time descending, and admitted whole until the budget runs out. Truncation is therefore exact whatever order the source returned, and a trace is never half-imported. Spans whose root is not in the page cost no budget — their root was counted in an earlier page, and dropping them would strand a trace already paid for.

Adapters still sort where they can, so pages arrive roughly right and the sort is cheap: LangSmith asks for `order: "desc"` and Braintrust's BTQL carries `order by created desc`. Langfuse has no sort parameter in either API version, which is the whole reason ordering lives here.

## Idempotency

`trace_id`, `span_id` and `parent_span_id` are **deterministic** hashes of the vendor's own ids (32 and 16 lowercase hex). The same source row always maps to the same Latitude ids, so re-running or resuming an import writes the same rows rather than needing a written-rows ledger, and `spans` collapses them through `ReplacingMergeTree(ingested_at)`. Billing dedupes separately on `trace:{org}:{project}:{trace}`, so a trace whose spans arrive across two pages is charged once, and re-importing a range costs nothing.

**The `traces` rollup is not covered by that for imports, and this is a platform-level gap on the import write path.** `traces` is an `AggregatingMergeTree` fed by `traces_mv`, a materialized view over the `spans` *insert stream*. A materialized view sees inserts, not deduplicated rows, so writing the same `span_id` twice increments `span_count` and the token sums a second time. `OPTIMIZE TABLE traces FINAL` does not help — the aggregate states are already wrong — so the inflation is permanent. Measured on a re-imported trace: `spanCount` 5 → 10, `tokensTotal` 270 → 540, while `listSpans` and the conversation view (which read `spans` directly with `LIMIT 1 BY trace_id, span_id`) stayed correct. Live `span-ingestion` now skips identities already in ClickHouse before insert, which closes this for job retries and stalled redelivery; imports still write through a separate page insert and can inflate rollups if a page is retried after the spans landed.

Two consequences worth knowing before relying on re-insert idempotency:

- A page that inserts its spans and then fails before its cursor is persisted re-inserts them on retry, inflating the affected traces' rollups.
- The same is true of any duplicate OTLP delivery on the live path, which is why this is not import-specific — but imports are the feature that *documents* the guarantee, so it is called out here.

Every imported span carries provenance in metadata: `import.job_id`, `import.source`, `import.source_project_id`, `import.source_trace_id`, `import.source_span_id`.

## Redaction

An import is a **second content sink** into `spans`, so it runs the same redaction pass ingestion runs, on the same resolved policy, immediately before the insert. Nothing else would do: `traces` and `sessions` are materialized views over `spans`, every derived table re-reads `spans`, and `TracesIngested` has not fired yet.

The pass **fails closed** — a `RedactionError` propagates, the page retries, and content a project asked us to strip never reaches ClickHouse. The policy is resolved per page at the worker boundary (org half from the cached platform reader, project half from project settings), so enabling redaction mid-import takes effect on the next page.

## Billing and the two ceilings

One credit per imported trace, the same rate as ingestion. `stats.tracesImported` counts **root spans**, which is exact, order-independent, and agrees with what billing charges for.

Two ceilings bound the spend, and **they end differently, because only one of them is the user's**:

- **`config.maxTraces`** — the ceiling the user accepted, snapshotted at confirmation, defaulted to everything their plan currently affords. Meeting it ends the job **`succeeded`**: importing every trace that was asked for is exactly what success means, and the preview already said the oldest traces in the range would be left behind. Nothing is written to `error`, and there is nothing to resume — a resume would re-read the range and admit nothing.
- **The org's live remaining plan usage**, re-read before every page. This catches usage consumed *during* a long import by live ingestion or another project. Sandbox orgs skip it — they are never billed. Hitting it ends the job **`capped`**, which is the only thing that status means.

So `capped` says "the plan stopped you, not your own settings", which is what makes it worth resuming: the period reset fixes it without the user changing anything, and the cursor points exactly where to carry on. Treating the user's own ceiling as a cap instead offered a "Continue import" button that could never import anything, because the engine caps before reading a page whenever the carried trace count has already reached `maxTraces`.

The plan cap's reason goes in `error`, the field that already answers "why did this not finish cleanly". `status` is what distinguishes a cap from a failure, so no extra column is needed: the UI renders `error` muted unless the status is `failed`, and `ImportFinished` forwards the same string.

An org with no usage left is refused up front (`ImportUsageExhaustedError`) rather than being handed a job that caps on its first page — on **resume as well as creation**, so continuing a capped import while the period is still spent is refused instead of producing another capped job that imported nothing. A range past the plan's span retention is a typed `ImportRangeInvalidError` naming the retention, because ClickHouse drops spans past `retention_days` measured from the span's own `start_time` — importing older history would bill for rows that are then deleted.

## Run history lives on the job

The last 25 processed pages sit in `import_jobs.runs`, a newest-first jsonb ring buffer: per-page status, the cursor span it covered, its counters, a sanitized error, and timing. No id and no job id — the job holds both, and the cursor already names the window.

This deliberately does **not** mirror `destination_sync_runs`. There the runs table *is* the source of truth, because a destination has no cumulative progress row. Here the job row is the source of truth, so a second table would be a projection needing garbage collection to hold data the job already has. A bounded array needs no pruning cron and no join, and is safe precisely because pages are sequential: one active import per org, and each page publishes exactly one successor, so there is never more than one writer.

## Adapter contract

```ts
interface ImportSourceAdapter<TRow, TCursor> {
  readonly source: ImportSource
  testConnection(input: { credentials }): Effect<void, ImportSourceError>
  listProjects(input: { credentials; cursor?; limit }): Effect<{ projects; nextCursor }, ImportSourceError>
  preview(input: { credentials; sourceProjectId; config; range; maxRecords }): Effect<ImportPreview, ImportSourceError>
  fetchPage(input: FetchPageInput<TCursor>): Effect<SourcePage<TRow, TCursor>, ImportSourceError>
  normalize(row: TRow, context: NormalizeContext, config: ImportConfig): NormalizeResult
}
```

Constraints:

- `normalize` is deterministic and side-effect free.
- `fetchPage` obeys the given range and limit, and returns a JSON-serializable cursor that survives a retry.
- **A full page with no continuation cursor is a failure, not a completion.** Silently abandoning the rest of a window reads as a clean import that quietly lost data.
- **Clamp the page size to the provider's own ceiling and compare against the clamped value.** LangSmith's `/runs/query` declares `limit` as `maximum: 100`; Langfuse v2 caps a page at 1000. Comparing a server-capped page against the requested size would read a truncated page as a complete window.
- **Every endpoint has its own ceiling, and clamp where the query is built.** Langfuse's observation page allows 1000 but its trace list allows **100** and answers 101 with a 400 rather than clamping. Sharing one constant across both endpoints made every Langfuse preview and import fail outright. Ceilings belong in the function that builds the query string, not at each call site.
- **A secondary lookup needs its own pagination, driven by what the page actually needs.** Langfuse's session, user and tags come from the trace list rather than the observation row, and one observation page can span more traces than one trace-list page holds. Reading a fixed first slice loses the join for the excess and looks like a successful import.
- Map 429/throttle responses to `rate_limited` with `retryAfterMs` when the vendor supplies it; the engine then defers that same page by exactly that long instead of using blind exponential backoff.
- Never return secrets in errors, previews, project metadata or run rows.
- Emit the source ids the deterministic id mapping needs.
- **Map the vendor's span type onto Latitude's `Operation` vocabulary — never pass it through.** `operationSchema` ends in `z.string()`, so a vendor's own word validates, inserts and then reads back as a trace with **no conversation and no tokens**: the rollup gates its token sums on `operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')` and the conversation view selects message spans the same way. LangSmith's `llm` and Braintrust's `llm` both shipped unmapped and made every trace from those sources unreadable. Wrapper spans that repeat their children's usage (LangSmith `chain`, Braintrust `task`) must land *outside* that gate or a trace's tokens double.
- **Parse timestamps as UTC.** LangSmith returns them with no timezone designator, and `new Date` reads a bare date-time as local time — invisible on a UTC host, hours wrong anywhere else, and different either side of a DST change.
- **Report the range's trace count.** All three sources can, in one request: Langfuse `meta.totalItems` on the trace list, LangSmith `/runs/stats` with `is_root`, Braintrust a BTQL `count(distinct root_span_id)`. It is already in the unit `maxTraces` budgets and billing charges, and it is the only thing the preview step is really being asked.
- **Check the row interface against a real response.** Every vendor interface here is hand-written, and three separate bugs were a field name that does not exist: Langfuse `providedModelName` (it is `model`), Braintrust `parent_span_id` (it is `span_parents`, an array), and LangSmith's naive timestamps. Nothing in the type system or the tests catches a field that is merely absent.

**Probe a live account before trusting an adapter change.** The unit tests stub the transport, so they assert what we believe the vendor accepts and returns — which is exactly the belief that has been wrong every time. They cannot catch a rejected parameter, an absent field or a lower-than-assumed ceiling. Run the real adapter against a real project once per change to the request shape.

## Operational constants

All enforced server-side in domain use-cases and snapshotted onto the job at confirmation. `resolveImportLimits` is pure, so the wizard and job creation cannot disagree about the ceiling.

| Limit | Default | Hard cap |
| --- | ---: | ---: |
| Lookback | 90 days, never past the plan's span retention | 365 days |
| Minimum lookback | 1 day | — |
| Traces per import | The org's remaining plan usage | 1,000,000 |
| Unfinished imports per org | 1 | 1 |
| Concurrent import pages | 8 | 8 |
| Source page size | 1,000 records | 5,000, and never above the provider's own cap |
| ClickHouse insert chunk | 5,000 spans | 10,000 |
| Dry-run scan / timeout | 5,000 records / 30s | 10,000 / 60s |
| Page timeout | 120s | 120s |
| Per-request HTTP timeout | 60s | 60s (below the page budget, so a hung source is a retryable transport error) |
| BullMQ attempts / backoff | 5 / exponential from 10s | — |
| Rate limit per org+source | Langfuse 60/min · LangSmith 12/min · Braintrust 60/min | — |
| `Retry-After` waits per page | Honoured exactly | 5 waits, 10 min each |
| Source project listing | 100 per page | 500 in the wizard |
| Run history per job | 25 pages | 25 pages |
| Window width | 1 day | 32 days when widening over empty stretches |
| Plan usage re-check | Every page | — |
| Credential retention | Scrubbed on every terminal transition | — |

Content is always imported: history without messages cannot be searched, evaluated or clustered, so a content-free import is not worth billing for. Compliance is the redaction policy's job.

## What normalization shares with live ingestion

An imported span and an ingested span are the same `SpanDetail` written through the same `SpanRepository`, and everything downstream of that entity is literally the same code: redaction, the insert, `TracesIngested`, and therefore the `traces` / `sessions` rollups, conversation intelligence, search indexing and billing. Only the step that *produces* the entity differs, and the parts of it that are not vendor-specific are shared rather than reimplemented.

| Concern | Shared helper | Used by |
| --- | --- | --- |
| Conversation content | `parseMessagePayload` / `extractMessages` / `translateMessages` (`@domain/spans` `helpers/message-payload`) | the import adapters and OTEL's `input.value` / `output.value` parser |
| Canonical part vocabulary | `normalizeGenAIMessages` (`helpers/normalize-genai-messages`) | the payload translator and OTEL's `gen_ai.{input,output}.messages` parser |
| Tool definitions | `toolDefinitionsFrom` / `toToolDefinition` (`helpers/resolve-tool-definitions`) | the import adapters and six OTEL content parsers |
| Cost from tokens | `estimateSpanCost` (`helpers/estimate-span-cost`) | the import adapters and `resolveUsage` |

Everything a span *is* rather than says — the provider, the tool it ran, the call it answered, the response id, the exception class, the declared tool set — resolves through `otlp/resolvers/`, off the same candidate lists live ingestion uses. A vendor row holds a flat metadata map where a live span holds an attribute list, so `attrsFromMetadata` adapts the record and the `*FromMetadata` function next to each candidate list runs it:

| Concern | Resolver | Candidate list shared with |
| --- | --- | --- |
| Provider | `resolveProviderFromMetadata` (`identity`) | `resolveProvider` |
| Tool name | `resolveToolNameFromMetadata` (`tool-execution`) | `resolveToolExecution` |
| Tool call id | `resolveToolCallIdFromMetadata` (`tool-execution`) | `resolveToolExecution` |
| Response id | `resolveResponseIdFromMetadata` (`response`) | `resolveAttributes` |
| Error type | `resolveErrorTypeFromMetadata` (`error`) | `resolveErrorType`, which `resolveAttributes` now calls |
| Tool definitions | `resolveToolDefinitionsFromMetadata` (`tool-definitions`) | `resolveToolDefinitionsPayload`, which the `gen_ai` content parser now calls |

Each `*FromMetadata` resolves the OTEL candidates first, then any non-attribute name a caller writes by hand (`response_id`, `tool_call_id`, `ls_provider`). Those stay out of the candidate lists themselves because they are not attribute names, so a live span should not resolve by them.

The one reader that stays import-side is the user email: the keys a caller puts in a metadata map (`user_email`, `userEmail`, `email`) and the keys `userEmailCandidates` resolves (`user.email`, `enduser.email`, `langfuse.user.email`) have nothing in common, so a shared function would be a union of two disjoint lists rather than one list with two callers.

Content in particular goes through **`rosetta-ai`'s `safeTranslate`**, the same translator ingest uses, which infers the source convention (OpenAI completions or responses, Anthropic, Google, Vercel AI, GenAI, Promptl) instead of hand-matching message shapes. That is what makes a vendor's `{role, content}` array, a lone message object, a multimodal content-part array, a tool call and its result, and a system message lifted into `systemInstructions` all land the same way they would have arriving over OTLP.

### Why the vendor row is not converted to OTLP first

The obvious alternative — synthesize an OTLP span from each vendor row and push it through `transformOtlpToSpans` — was rejected. That transform exists to *discover* what a span is by sniffing attribute keys (`gen_ai.operation.name`, `openinference.span.kind`, `llm.request.type`, `ai.operationId`, and eight content parsers dispatching on `canHandle(attrs)`). A vendor read API has already done that discovery: `run_type: "llm"` **is** the operation, `usageDetails.input` **is** the input token count. Encoding those back into OTEL attribute keys so the transform can decode them again is the same mapping table written twice, with a lossy intermediate in the middle. What is genuinely shared is everything *after* discovery — translation, pricing, tool normalization — which is what the table above lists.

## Source mapping

Common targets: `trace_id` / `span_id` / `parent_span_id` from deterministic vendor-id hashes; `session_id` from the vendor session or a configured metadata key; tags, metadata (stringified, plus `import.*`), GenAI messages and tool definitions via the shared translator, vendor usage and cost, and `operation` / `model` from the vendor run type.

| Source | Notable mappings |
| --- | --- |
| **Langfuse** | `/api/public/v2/observations`. `type: GENERATION` → LLM operation; `sessionId` and `userId` map directly; `usageDetails` → tokens, `inputCost`/`outputCost`/`totalCost` → microcents; `completionStartTime` → TTFT; `modelParameters` → metadata (and `stream` → `isStreaming`); `promptId`/`promptName`/`promptVersion`, `environment`, `version` → `metadata.import.*`. |
| **LangSmith** | `/runs/query`. `run_type` → operation; `inputs`/`outputs` are LangChain message shapes; `first_token_time` → TTFT; `events` → `events_json`; `extra.runtime.library`/`library_version` → instrumentation scope; `extra.invocation_params` supplies the model when `ls_model_name` is absent and is where `tools` are declared; `outputs.generations[][].generation_info.finish_reason` → `finish_reasons`. `session_id` is the **project id**, not a conversation — see below. |
| **Braintrust** | BTQL over `project_logs(..., shape => 'spans')`. `root_span_id` → trace; `metrics.start`/`metrics.end` are fractional Unix seconds and are the span's real boundaries (`created` is the log write time, so using it for both ends renders every span as 0ms); `metrics.estimated_cost` → cost; `metrics.time_to_first_token` → TTFT; the `prompt_*`/`completion_*` token metrics → the additive token breakdown; a structured `error` object's `type` → `error_type`. |

**Ask for every field group; a missing one is silent.** Langfuse v2 returns only the groups named in `fields`, and its groups are `core`, `basic`, `time`, `io`, `metadata`, `model`, `usage`, `prompt`, `metrics`, `trace_context`. Two consequences bit us: `model` returns `providedModelName` rather than a bare `model` key (the adapter reads both, since `model` is what a live response actually carried), and TTFT lives in `time`, which the adapter did not originally request — so every imported span reported no streaming. A test asserts the group list.

BTQL has no parameter binding, so the Braintrust adapter allow-lists the project id and cursor charset rather than escaping them — anything outside it cannot terminate the quoted literal and smuggle in clauses.

`shape` is pinned rather than left to Braintrust's default, which its docs do not state: `traces` returns every span of any trace the filter matched and `summary` returns rollups carrying no `span_id`, so an unpinned shape could change what a page holds — and whether `normalize` can map it — without anything here changing. `offset '<token>'` is a server-issued cursor (BTQL's `cursor:`), not a numeric offset. The query also carries `order by created desc`: BTQL applies no ordering of its own, and without it a preview once showed the *oldest* trace in a range on a screen promising newest-first.

### Fidelity gaps

| Gap | Behavior |
| --- | --- |
| LangSmith `session_id` means project id | A configured metadata key (`thread_id`, `session_id`, `conversation_id` probed by default) supplies the session; otherwise one trace becomes one session. `user_id` is deliberately *not* probed: it collapsed every trace of one user into a single session. |
| Prompt registries | Latitude has no prompt entity; name/version land in metadata only. |
| Scores, datasets, annotations, binary media | Not imported. |
| Braintrust in-progress traces | Imported best-effort, marked `metadata.import.incomplete` when detectable. |
| Invalid hierarchy | An orphan span is imported with a warning if core ids and timestamps are valid; skipped only when required fields are missing. |
| Langfuse session, user and tags | Read from the trace list and joined onto each observation, because v2's `trace_context` field group populates them only sporadically — measured at one trace in twelve, unchanged after ten minutes. One extra request per window. |
| Langfuse trace-root duration | v2 synthesizes a root observation per trace (`t-<traceId>`) with `endTime: null`, so each imported trace's root span has zero duration. Its children carry the real timings, and the trace's own duration is derived across the span set. |
| Langfuse v2 read lag | Data ingested without `x-langfuse-ingestion-version: 4` — older SDKs and raw OTel exporters — can take ten minutes to appear on v2, which the adapter reads exclusively. A range that comes back entirely empty is reported as such rather than as a clean success. |
| Trace counting relies on root spans | A source missing a trace's root span undercounts that trace, so the job reports slightly fewer traces than were billed. |
| Langfuse v2 omits unrequested field groups | Fields outside the `fields` parameter are **absent**, not null, so an incomplete list would import spans with no content, metadata, model, usage or tags and still look successful. The adapter names every group it maps and a test asserts the list. |
| Cache and reasoning tokens | Mapped for **Braintrust only**, because it is the only source that documents its convention: `prompt_tokens` *includes* `prompt_cached_tokens` and `prompt_cache_creation_tokens`, so the adapter subtracts them to get the additive counts `SpanDetail` stores. Langfuse's `usageDetails` and LangSmith's `prompt_tokens` state no convention, and splitting a count on a guess would move tokens out of the total the trace rollup bills on — so those two keep the source's counts verbatim with the cache columns at zero. Cost then prices them at the input rate, which is what a source reporting no breakdown implies. |
| `provider` only when the source names it | Langfuse has no provider field (it prices calls itself, so its own cost covers the gap); LangSmith carries LangChain's `ls_provider`; Braintrust may carry `metadata.provider`. Where none is present, `provider` stays empty and cost stays zero rather than guessing: a model id alone is ambiguous across providers (`claude-sonnet-4-5` prices differently on Anthropic, Bedrock and Vertex), so an inferred price would be wrong rather than missing. |
| Vendor-reported cost wins over an estimate | All three price calls themselves — Langfuse `inputCost`/`outputCost`/`totalCost` (with `costDetails` as fallback), LangSmith `prompt_cost`/`completion_cost`/`total_cost`, Braintrust `metrics.estimated_cost`. That figure is what the provider actually charged, including a negotiated or custom-model rate no public table knows, so models.dev pricing is only the fallback. Braintrust reports a total with no split, so its two side columns stay zero rather than being invented. |
| Time to first token | Derived for all three, and `isStreaming` follows from it. Langfuse `completionStartTime` and LangSmith `first_token_time` are timestamps, so TTFT is the gap from the span start; Braintrust's `metrics.time_to_first_token` is a duration in seconds, matching the `start`/`end` metrics beside it. A TTFT longer than the span is discarded rather than stored — it cannot be real, and that is the shape a seconds-versus-milliseconds mix-up takes. Langfuse's `metrics` field group also publishes `timeToFirstToken`, but with no documented unit, so the timestamp difference is used instead. |
| Span kind, service, resource and links | `kind: "internal"`, empty `serviceName`, empty `resourceString`, `linksJson: "[]"`, `traceFlags: 0`, `traceState: ""`. These are OTEL wire concepts with no counterpart in a vendor's stored row, and defaulting them to something plausible would misattribute the trace. `scopeName` / `scopeVersion` are the exception: LangSmith records the tracing library in `extra.runtime`, which is exactly what an instrumentation scope names. |
| `responseModel` | Set to the requested model. No source distinguishes the model asked for from the one that answered. |
| `user_email`, `tool_call_id`, `response_id` | None of the three models these as a field, so they are read from metadata under the conventional key names (`user_email`/`userEmail`/`email`, `tool_call_id`/`toolCallId`, `response_id`/`responseId`) and are only populated when the caller logged them. A tool call id is also looked for inside the arguments payload. |
| `finish_reasons` | LangSmith only, from the nested `LLMResult`. Langfuse and Braintrust expose no equivalent field, and both the key name and the shape would be a guess. |
| Raw vendor fields | Land in `metadata` (stringified), not in the typed `attr_*` maps. `attr_string` mirrors OTEL span attributes and an imported span has none, so filling it would mean inventing keys no convention defines — and redaction treats those two differently: a *recognized* content key is dropped wholesale (`isContentAttributeKey`), while an invented one only gets pattern-level redaction. Raw payloads therefore belong in the typed content columns, which is where the shared translator puts them. |

## Out of scope

No CLI import command, no backoffice migration UI, no per-source pipelines, no vendor blob/Parquet/self-hosted-DB import, no scores/datasets/prompt-registry import, no binary media, no continuous sync or dual-write, no Temporal workflow, no "all history" option, and no dependence on vendor-side ordering guarantees.
