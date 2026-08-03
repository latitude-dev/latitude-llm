# Spans

The reliability system extends, but does not replace, the existing telemetry model.

## Existing Base

Today the repo already has:

- raw `spans` in ClickHouse
- `traces` materialized from spans
- time-first project-scoped query patterns

Reliability builds on top of that telemetry base rather than introducing a second trace store.

## Ingest Admission And Memory Safety

The ingest HTTP boundary protects each process before decoding OTLP payloads:

- `Content-Length` is validated before authentication or body buffering; malformed values receive `400`, and declared payloads above `LAT_INGEST_TRACE_MAX_PAYLOAD_BYTES` receive `413`
- body streaming enforces the same payload cap for chunked requests and clients whose observed body does not match the declared length
- a process-local admission controller limits both active payload count and reserved payload bytes; admission remains held through decoding, object-storage persistence, and queue publication because the raw payload stays live for that full path
- admission exhaustion receives `503` with `Retry-After: 1`; this protects process memory and is independent from the authenticated organization/API-key rate limiter, which continues to return `429`

The defaults are a 32 MiB request cap, a 64 MiB in-flight payload budget, and 16 concurrent payloads per ingest process. The in-flight budget must be at least twice the request cap because assembling a chunked body briefly retains its streamed chunks and exact-sized output buffer together. Operators can tune the limits with `LAT_INGEST_TRACE_MAX_PAYLOAD_BYTES`, `LAT_INGEST_TRACE_MAX_IN_FLIGHT_BYTES`, and `LAT_INGEST_TRACE_MAX_CONCURRENT_PAYLOADS`. The request span records observed and declared payload size, normalized content type, body-read duration, admission outcome, RSS, and ArrayBuffer memory before and after processing.

## PII Redaction Stage

Opt-in per project. Between `decodeAndTransform` and `repo.insert` in `processIngestedSpansUseCase`, span content is scanned and matches are replaced with `[REDACTED_<LABEL>]`. The engine is a pure function set in `packages/domain/spans/src/redaction/`; there is no port until a second implementation exists.

**The policy is decided at the HTTP boundary and applied in the worker.** `ingestSpansUseCase` resolves the effective policy per project and stamps a `projectId → policy` map onto the queue job. Resolving in the worker instead would add an uncached settings read per project per batch at concurrency 50, and stamping also makes the decision immune to a toggle flipping between enqueue and processing. The worker must **not** grow a `SettingsReader` fallback: an absent field genuinely means "redact nothing" at every rollout ordering, and a fallback would be a second, differently-cached policy path that silently diverges.

Projects resolving to `off` are absent from the map, and the field is omitted entirely when no project in the batch redacts. `redactSpans` returns the identical array before touching a span in that case, so redaction costs opted-out projects nothing.

**Redaction never deletes an attribute.** Every key the exporter sent is stored; only matched values change. An earlier design dropped the keys a content parser reads, because `attr_string` holds a verbatim second copy of the parsed columns (`transform.ts`) — but that made the Attributes panel show a span nobody sent, deleted keys belonging to the seven parsers that *didn't* run (`parseContent` stops at the first match), and left content from unenumerated vendors in place anyway. It also made a redacting project store less than a non-redacting one, which is a storage decision taken inside a privacy control. The duplication is a real cost, but it is every project's cost and belongs to its own setting if it is worth removing.

`attr_string` and `resource_string` go through `redactJsonString`, not a flat scan, so a JSON-valued attribute gets the same structural walk as the column it duplicates — one payload redacted two ways would be two behaviours to defend. `attr_int` and `attr_float` are scanned as text and a match **moves** the key into `attr_string` as a whole-value placeholder, because `Map(String, Int64)` cannot hold one; only `credit_card` is reachable on a bare number, gated by issuer prefix and Luhn. `attr_bool` is skipped — no detector matches `"true"`.

**It fails closed.** A throw or a deadline overrun fails the effect and nothing is inserted. `span-ingestion` runs on BullMQ's default single attempt, so the batch is then dropped rather than retried. This is a deliberate divergence from lmnr and langfuse, which fail open because their synchronous export path made dropping telemetry the only alternative. Ours is already acknowledged, and for the deterministic tier "failure" means a code bug, so failing open would reduce to silently writing plaintext PII for a customer who explicitly asked us not to — permanently, since redaction is not retroactive and there is no delete path. Whether ingest should retry before dropping is an open question, tracked in the spec.

Budget: fields above `REDACTION_MAX_FIELD_CHARS` (1 M UTF-16 code units) are replaced wholesale rather than scanned or passed through; subtrees past `REDACTION_MAX_DEPTH` (256) are treated the same way, because `JSON.parse` accepts nesting deep enough to overflow a recursive walk. The 30 s batch budget is a deadline checked before each span, not an `Effect.timeout` — the walk is synchronous, so a fiber-level timeout could not fire until the work it was meant to bound had already finished.

Measured cost was ~0.69 ms per span at p50 and ~1.22 ms at p99 over ~29 KB of scanned content, against a 5 ms target. Keeping the content attributes doubles the bytes a content-carrying span presents: on a synthetic claude-code span the same pass measured 2.08 ms p50 / 2.62 ms p99 over 106 KB against 0.97 / 1.19 over 52 KB with the copy removed, a ~2.1× multiplier. That projects the production figures to roughly 1.5 ms p50 and 2.6 ms p99 — still inside the target, and worth confirming against `redaction.charsScanned` once this has run in production. The worker event loop is single threaded, so concurrency 50 interleaves rather than parallelises this; the number that matters is roughly 800 spans/sec per core of redaction capacity.

Two consequences worth not mistaking for bugs later: `content_hash` differs between redacted and unredacted copies of the same message, so `message_embeddings` and `trace_message_occurrences` deduplication does not span a policy change; and `trace_search_documents.search_text` is built from redacted content, so search stops matching redacted values.

## Reliability Additions

Reliability adds:

- `simulation_id` on spans as an optional simulation link stored as a non-null `FixedString(24)` with the empty-string sentinel when absent
- propagation of `simulation_id` into trace/session-level reporting where needed
- a `TracesIngested` domain event emitted directly through `createEventsPublisher(queuePublisher)` after the span-ingestion process durably writes one ingest batch and dedupes its `traceIds`
- one debounced downstream runtime task, `trace-end:run`, published once per deduped trace id from the `TracesIngested` handler with a debounce window defined by a named constant whose initial default is `90 seconds`

These telemetry additions should land through new ClickHouse migrations rather than by rewriting existing migration history. Because they are additive extensions to existing unreleased tables, ordinary additive statements and sensible defaults are preferred over bespoke compatibility choreography unless a later change truly requires a rebuild.

## Trace Completion Signal

Reliability should not treat each span arrival as the moment a trace is complete.

Instead:

- the span-ingestion process publishes `TracesIngested` directly through `createEventsPublisher(queuePublisher)` after spans are durable, carrying a deduped `traceIds` array plus the billing snapshot for that ingest batch when available
- the `domain-events` dispatcher reacts to `TracesIngested` by publishing one `trace-end:run` per deduped trace id, each debounced and deduped by `(organizationId, projectId, traceId)`
- if another span for that trace arrives before the debounce window elapses, the pending tasks are replaced/rescheduled so the window starts over
- when the debounce window elapses, `trace-end:run` loads the trace once, samples candidate live evaluations, live queues, and system queues, batches shared live filters into one trace query, and then applies the selected downstream work
- downstream side effects stay split by responsibility: `live-evaluations:execute` remains the execution rail for evaluation runs, live queue membership is inserted directly, and sampled system queues start `systemQueueFlaggerWorkflow`
- the `domain-events` dispatcher never executes downstream reliability side effects inline; it only dispatches tasks

This keeps the trace-completion boundary explicit while still using the existing BullMQ transport, direct high-volume domain-event publication into `domain-events`, dispatcher-only domain-event handling, and a single debounced trace-end runtime rather than several parallel selection tasks. The same trace-end boundary also publishes trace-search refresh, debounced live-taxonomy observation work, and conversation-intelligence session analysis; see [`./taxonomy.md`](./taxonomy.md) and [`./conversation-intelligence.md`](./conversation-intelligence.md).

### Trace-end code map

- **Worker composition root**: `apps/workers/src/workers/trace-end.ts` exports `runTraceEndJob` (and `createTraceEndWorker` / `createRunHandler`). That module owns transport and infrastructure wiring only; it is not named as a domain use case.
- `**@domain/spans`**: `loadTraceForTraceEndUseCase`, `selectTraceEndItemsUseCase`, and `summarizeTraceEndItemDecisions` in `packages/domain/spans/src/use-cases/` implement trace load, sample-first + batched filter selection, and per-candidate decision counts for logging.
- `**@domain/evaluations**` and `**@domain/annotation-queues**`: see `./evaluations.md` and `./annotation-queues.md` for the live-evaluation and queue halves of the same debounced pass.

## Why Sessions Matter

Sessions are needed so that:

- evaluations can target session-level conversations cleanly
- score rollups can aggregate at session level
- issue and simulation drilldowns can show the right granularity

## Score Analytics Over Telemetry

Reliability should not depend on hot joins from spans to raw scores for every query.

Exact ClickHouse materialized score analytics tables are still pending precise definition until the reporting/query shapes stabilize.

The later score-aware analytics layer will likely need to cover responsibilities such as:

- span
- trace
- session

Those later materializations feed:

- score-aware filters
- issue drilldown
- evaluation dashboards
- simulation reporting

## Sort-Key Rule

Sparse reliability dimensions such as `simulation_id` should not move ahead of the existing time-first access pattern.

They should be supported with indexes and later score-aware materializations rather than by rewriting the base observability sort order.

When stored in ClickHouse, `simulation_id` should keep the fixed-width CUID contract while remaining non-null, using the empty-string sentinel when the span is not part of a simulation.

## Trace Search Indexing

Trace search keeps lexical and semantic indexing over the canonical trace conversation, not over raw per-span message payloads.

The trace-search worker loads `TraceRepository.findByTraceId` and uses `TraceDetail.allMessages` as the canonical message sequence. It must not rebuild the searchable conversation by concatenating every span's `input_messages` and `output_messages`, because span inputs often repeat previous context and would duplicate conversation snippets.

Search-document construction rules:

- index only conversation message content from `user` and `assistant` messages
- skip `system` messages and system instructions entirely
- preserve the order of `TraceDetail.allMessages`
- do not prepend the root span name to the indexed text; store `root_span_name` only as separate trace-search metadata
- format searchable non-text parts as lightweight placeholders where useful, such as `[IMAGE]`, `[FILE:<id>]`, and `[TOOL CALL: <name>]`
- skip unsearchable/noisy parts such as tool-call responses, and reasoning parts (large, low search value, not worth the embedding cost)

The trace-search document is normalized before lexical storage. The local cap is expressed as an estimated token cap using `TRACE_SEARCH_CHARS_PER_TOKEN_ESTIMATE = 4`; the default cap is `TRACE_SEARCH_DOCUMENT_MAX_ESTIMATED_TOKENS = 5_000`, producing `TRACE_SEARCH_DOCUMENT_MAX_LENGTH = 20_000` characters.

When the normalized lexical conversation exceeds that cap, truncation keeps both ends of the conversation: the initial half of the cap, an omission marker, and the final half of the cap. The middle is omitted. This preserves the setup and final outcome of long conversations while keeping text-index storage predictable.

Semantic indexing uses the shared message embedding store. For every non-tool message in `TraceDetail.allMessages`, the worker canonicalizes `"{role}: {text}"` with `canonicalizeMessageForEmbedding`, hashes it with `hashMessageContent`, ensures a `message_embeddings` vector exists for the hash, and writes a `trace_message_occurrences` row for that trace/message position. Occurrence rows are written even when the org embedding budget is exhausted, so a later writer can fill the missing vector and make the occurrence searchable.

Semantic indexing is gated by Redis-backed per-organization token budgets before calling Voyage. The same budget applies to trace search and conversation intelligence because both write through `message_embeddings`. The default budget profile is proportional across windows: `167M` tokens daily, `1.15B` weekly, and `5B` monthly. At `voyage-4-large` pricing, the monthly budget is intended as an approximately `$600/org/month` worst-case ceiling — sized at 50% of the `$100` Pro base — before plan-specific budgets replace the defaults.

### Shared Message Embeddings

`message_embeddings` is a content-addressed vector store keyed by `(organization_id, project_id, content_hash)`. It stores the `voyage-4-large` 2048-dimensional document embedding. Vectors are immutable: `upsertMany` checks-then-inserts so a repeat of the same hash/model is normally a no-op, and the table is a `ReplacingMergeTree` so the duplicate rows two indexers can race in (no unique constraint in ClickHouse) collapse on merge — duplicates are byte-identical, so no version column is needed. Rows TTL on `inserted_at + retention_days + 30` (default 90 days), the same retention the source spans get. A vector that expires while still referenced is re-embedded on the next miss and recreated by write-through, so an early TTL only costs one re-embedding, never a wrong result. The table intentionally carries no trace identity.

`trace_message_occurrences` is the trace-link table keyed for vector-to-trace fan-out. It stores `(trace_id, message_index, content_hash, session_id, start_time, role, is_output, retention_days)` and TTLs with trace-search retention. Full per-trace duplication is cheap here; only vectors are deduped. The trace-end search worker is the only writer because it is the boundary that knows the message positions within a finished trace.

Conversation intelligence also resolves turn vectors through `message_embeddings`, but it never writes occurrences. Its session conversation comes from `SessionRepository.findConversationSpineBySessionId`, which reads distinct occurrence hashes in first-seen order and recovers message text from the corresponding trace payloads. This handles mid-session compaction: prior replayed turns keep their original positions, a new summary appears once at the compaction point, and subsequent turns append after it. When no occurrence rows exist, the repository falls back to the legacy `SessionDetail` reconstruction so older sessions can still be analyzed.

## Trace Search Query Semantics

Trace search parses the search bar into three independent text-search components:

- unquoted text is the semantic prompt. It is embedded with Voyage using `inputType: "query"` and supplies relevance ordering for semantic-only and hybrid searches.
- double-quoted text (`"..."`) is a literal phrase. It is normalized like stored `search_text`, escaped as a parameterized `LIKE` pattern, and matched case-sensitively as a substring.
- backtick text (`` `...` ``) is an ordered token phrase. It is lower-cased and tokenized with the same `splitByNonAlpha` shape as the ClickHouse text index. ClickHouse 26.2 does not expose `hasPhrase`, so the repository composes `hasAllTokens(search_text, tokens)` as the indexed prefilter with `hasSubstr(tokens(lower(search_text), 'splitByNonAlpha'), tokens)` as the adjacency/order check.

When a query contains both lexical components and semantic text, lexical components are mandatory filters and the semantic prompt ranks the remaining traces. Hybrid search uses a `LEFT JOIN` from lexical matches to semantic scores so traces that satisfy the literal/token filters still appear when embeddings are missing or expired; those rows receive a zero relevance score. The semantic relevance floor only applies to semantic-only searches.

Semantic search scans distinct rows in `message_embeddings`, joins matching hashes through `trace_message_occurrences`, and max-pools per trace. The winning occurrence's `message_index` drives semantic highlighting. A matched historical message fans out to every trace that replayed it, preserving the old trace-search behavior while avoiding repeated embedding work.

The UI editor mirrors these semantics: regular text remains semantic, `"..."` renders as a literal pill, and `` `...` `` renders as an ordered token-phrase pill. Pasted mixed syntax is parsed into the same segments before serialization back to `searchQuery`.

## Billing And Retention Stamping

Span ingestion is the canonical trace-billing boundary.

- after spans are durably inserted, the worker meters one `trace` usage event per distinct trace id in the payload
- the idempotency key is `trace:{organizationId}:{projectId}:{traceId}` so repeated ingest requests for the same trace do not double-charge

Span persistence also stamps `retention_days` onto each stored span using the effective organization billing plan at write time.

The `traces` materialized view carries forward `max(retention_days)` from its source spans, and ClickHouse TTL applies a storage grace buffer of `30` additional days beyond the stamped retention value before physically deleting `spans` and `traces`. See `./billing.md` for the billing-period and downgrade semantics behind that rule.

## OTLP Attribute Resolution

Incoming OTLP spans are normalized into the canonical span model by the resolvers under `packages/domain/spans/src/otlp/`. Metadata (operation, provider, model, token usage, cost, identity) resolves from a prioritized list of attribute candidates spanning the conventions each supported source emits (OTEL GenAI semconv, OpenInference, OpenLLMetry/Traceloop, Vercel AI SDK, Claude Code, and others). Message content is parsed by a first-match chain of content parsers keyed on the attributes a source uses.

### Cloudflare AI Gateway

Cloudflare AI Gateway is ingested as a plain OTLP GenAI source; there is no SDK. Its spans carry standard `gen_ai.*` metadata (`gen_ai.provider.name` or `gen_ai.model.provider`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`/`output_tokens`, `gen_ai.usage.cost`, `gen_ai.operation.name`), so provider, model, tokens, and cost resolve through the normal candidate lists. Two source-specific behaviors are deliberate:

- **Content lives in non-standard envelopes under the standard keys.** The gateway puts the raw request body in `gen_ai.input.messages` (`{messages:[…]}`, or `{text}` for embeddings) and the upstream provider's native response in `gen_ai.output.messages` (the OpenAI-compatible `{choices:[{message}]}`, the Anthropic `{state,result:{role,content[]}}` wrapper, or an embeddings `{data,shape}` body); its documented OTEL export names these `gen_ai.prompt_json` / `gen_ai.completion_json`, which resolve the same way. The standard array parser yields nothing for these, so `parseGenAICurrent` recovers them by **structural detection of the response shape** — not by trusting the provider name, whose value (for example `internal-workers-ai`) does not reliably identify the response schema. Unrecognized shapes resolve metadata only and leave messages empty rather than rendering non-conversational data such as embedding vectors.
- **The gateway hardcodes `gen_ai.operation.name=chat` for every request, including embeddings.** Spans whose response is an embedding body (`{data,shape}` with no chat envelope) are reclassified from `chat` to `embeddings` so they are categorized and rolled up correctly.

The `internal-workers-ai` provider name is aliased to `cloudflare-workers-ai`.
