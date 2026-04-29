# Spans

The reliability system extends, but does not replace, the existing telemetry model.

## Existing Base

Today the repo already has:

- raw `spans` in ClickHouse
- `traces` materialized from spans
- time-first project-scoped query patterns

Reliability builds on top of that telemetry base rather than introducing a second trace store.

## Reliability Additions

Reliability adds:

- `simulation_id` on spans as an optional simulation link stored as a non-null `FixedString(24)` with the empty-string sentinel when absent
- propagation of `simulation_id` into trace/session-level reporting where needed
- a `SpanIngested` domain event emitted directly through `createEventsPublisher(queuePublisher)` after the span-ingestion process durably writes spans for a trace
- one debounced downstream runtime task, `trace-end:run`, published directly from the `SpanIngested` handler with a debounce window defined by a named constant whose initial default is `90 seconds`

These telemetry additions should land through new ClickHouse migrations rather than by rewriting existing migration history. Because they are additive extensions to existing unreleased tables, ordinary additive statements and sensible defaults are preferred over bespoke compatibility choreography unless a later change truly requires a rebuild.

## Trace Completion Signal

Reliability should not treat each span arrival as the moment a trace is complete.

Instead:

- the span-ingestion process publishes `SpanIngested` directly through `createEventsPublisher(queuePublisher)` after the span write succeeds
- the `domain-events` dispatcher reacts to `SpanIngested` by publishing `trace-end:run`, debounced and deduped by `(organizationId, projectId, traceId)`
- if another span for that trace arrives before the debounce window elapses, the pending tasks are replaced/rescheduled so the window starts over
- when the debounce window elapses, `trace-end:run` loads the trace once, samples candidate live evaluations, live queues, and system queues, batches shared live filters into one trace query, and then applies the selected downstream work
- downstream side effects stay split by responsibility: `live-evaluations:execute` remains the execution rail for evaluation runs, live queue membership is inserted directly, and sampled system queues start `systemQueueFlaggerWorkflow`
- the `domain-events` dispatcher never executes downstream reliability side effects inline; it only dispatches tasks

This keeps the trace-completion boundary explicit while still using the existing BullMQ transport, direct high-volume domain-event publication into `domain-events`, dispatcher-only domain-event handling, and a single debounced trace-end runtime rather than several parallel selection tasks.

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
- skip unsearchable/noisy parts such as tool-call responses

The trace-search document is normalized before storage and embedding. The local cap is expressed as an estimated token cap using `TRACE_SEARCH_CHARS_PER_TOKEN_ESTIMATE = 4`; the default cap is `TRACE_SEARCH_DOCUMENT_MAX_ESTIMATED_TOKENS = 16_000`, producing `TRACE_SEARCH_DOCUMENT_MAX_LENGTH = 64_000` characters.

When the normalized conversation exceeds that cap, truncation keeps both ends of the conversation: the initial half of the cap, an omission marker, and the final half of the cap. The middle is omitted. This preserves the setup and final outcome of long conversations while keeping budget accounting predictable.

Semantic indexing is gated by Redis-backed per-organization token budgets before calling Voyage. The default budget profile is proportional across windows: `233.8M` tokens daily, `1.61B` weekly, and `7B` monthly. At `voyage-4-large` pricing, the monthly budget is intended as an approximately `$840/org/month` worst-case ceiling before plan-specific budgets replace the defaults.
