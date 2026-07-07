# Agent Data Access

How an LLM agent reads Latitude back: the structured analytics query surface that lets an agent
**investigate** an entity (signal, session, trace, span, behavior, moment) and **build arbitrary
dashboards** from a single composable primitive — without a SQL dialect.

This is the **inbound** counterpart to [`agent-dispatch.md`](./agent-dispatch.md) (the outbound half:
Latitude wakes a hosted agent when a signal fires). It reuses the [Filter DSL](./filters.md) verbatim
and is exposed through the [MCP surface](./mcp.md) / [public API](./api.md).

## The model

Two shapes of read serve two goals:

- **Investigation (Goal A)** — pull an entity and drill into it. Served by the curated domain tools
  (`getSignal`, `getSignalTrend`, `listSignalTraces`, `getTrace` → `listTraceSpans` → `getTraceSpan`,
  `getToolErrors`, `getUser` …). These encode semantics an agent should not re-derive (seasonal
  baselines, escalation, co-occurrence, hybrid search).
- **Dashboards (Goal B)** — *any* metric × breakdown × time-bucket over a filtered stream, returned as
  a small aggregate. Served by **one** tool, `queryAnalytics`, plus its row-level companion
  `querySpans`.

The dividing rule: the moment a question is a breakdown/metric that isn't a named endpoint, it goes
through `queryAnalytics` — never a new bespoke endpoint, never raw SQL. See
[Consolidation](#consolidation) for the rationale (why not HogQL).

## `queryAnalytics`

Compute a metric over a filtered stream, optionally broken down by a dimension and/or bucketed over
time. Returns a tidy series suitable for charts.

- **HTTP**: `POST /v1/projects/{projectSlug}/analytics/query` — rate tier `high`.
- **MCP tool**: `queryAnalytics`. **SDK**: `client.analytics.query`.
- **Contract**: `analyticsQuerySchema` in `packages/domain/shared/src/analytics-query.ts`.
- **Use-case**: `queryAnalyticsUseCase` (`@domain/spans`). **Route**: `packages/operations/src/operations/analytics.ts`.
- **Engine**: the `metric-sql/` module in `@platform/db-clickhouse` (see [Engine](#engine)).

### Query object

```ts
interface AnalyticsQuery {
  stream: "traces" | "sessions" | "spans" | "scores" | "behaviors" | "moments"
  metric: StreamMetric            // per-stream vocabulary — see the table below
  breakdown?: BreakdownField      // a dimension for this stream; omit for a single total
  filters?: FilterSet             // the Filter DSL, compiled by the stream's field registry
  query?: string                  // semantic search — traces/sessions only
  timeBucket?: { unit: "hour" | "day" | "week"; size?: number }  // omit for a single aggregate
  range: { fromIso: string; toIso: string }                      // toIso must be strictly after fromIso
  orderBy?: { by: "value" | "key"; direction: "asc" | "desc" }   // default { by: "value", direction: "desc" }
  limit?: number                  // default 50, max 500 (ANALYTICS_DEFAULT_LIMIT / ANALYTICS_MAX_LIMIT)
}
```

`metric` and `breakdown` are validated per `stream` via a discriminated union — an off-stream metric
or breakdown is a `400`, not a query. `timeBucket.size` defaults to `1` (max `365`); e.g.
`{ unit: "week", size: 2 }` is bi-weekly.

### Streams

Each stream declares its own backing table, metric vocabulary, and breakdown fields. Metrics are
**not** universal across streams.

| Stream | Backing table / grain | Metrics | Breakdown fields |
| --- | --- | --- | --- |
| `traces` | `traces_mv` (one root per trace) | `count`, `errorRate`, `cacheHitRate`, `{sum\|min\|max\|avg\|median}(duration\|cost\|tokens)`, `percentile(field, p 1–99)` | `model`, `provider`, `service`, `tool`, `tag`, `name`, `userId`, `status` |
| `sessions` | `sessions_mv` (one per session) | same as `traces` | same as `traces` minus `name` |
| `spans` | `spans` (one per span) | same as `traces` | `model`, `provider`, `service`, `tool`, `tag`, `operation`, `status` |
| `scores` (**= signals**) | `scores` (occurrences carry `signal_id`) | `count`, `passRate`, `errorRate`, `{avg\|min\|max\|median}(value)` | `signalId`, `source`, `model`, `provider`, `service`, `tool`, `tag` |
| `behaviors` | `taxonomy_observations` (read `FINAL`) | `count`, `{avg\|min\|max\|median}(confidence)` | `cluster`, `session`, `method` |
| `moments` | `session_moment_labels` ⋈ `session_semantic_moments` (both `FINAL`) | `count`, `{avg\|min\|max\|median}(confidence\|coherence)` | `kind`, `actor`, `session` |

Notes:

- **Signals are the `scores` stream, deliberately** — a signal's occurrences *are* scores carrying
  its `signal_id`. Analyze one signal by filtering `score.signalId` (or breaking down by `signalId`);
  the trace-derived breakdowns (`model`, `provider`, …) come from the score↔trace join. No separate
  signal-analytics engine.
- **`scores` breakdown values are bare** (`signalId`, `source`) — the `score.`-prefixed forms
  (`score.signalId`) are *filter* keys (see [`filters.md`](./filters.md#score-scoped-filter-keys)).
- **`moments`** has no timestamp of its own; the label table is `INNER JOIN`ed to
  `session_semantic_moments` to borrow `start_time` (windowing) and `coherence_score`. Both tables are
  `ReplacingMergeTree`, so both sides are read with `FINAL`.
- **Semantic `query`** (free-text, AND-combined with `filters`) is only valid on `traces` and
  `sessions`.

### Response

```ts
{ series: Array<{ key?: string; bucketStart?: string; value: number }> }
```

One point per breakdown value and/or time bucket. `key` is present when `breakdown` was set;
`bucketStart` (ISO-8601) when `timeBucket` was set; both when combined (one series per key over time).

### Units (wire-scaling)

Values are returned in **display units**, inherited from the field registries — the agent never sees
raw storage units. Defined in `analytics-query-repository.ts` (`toDisplayValue`):

| Metric | Unit |
| --- | --- |
| `duration` aggregates | **seconds** (stored ns) |
| `cost` aggregates | **dollars** (stored microcents) |
| `errorRate`, `cacheHitRate`, `passRate` | **0–1 ratio** (not a percent) |
| score `value`, `confidence`, `coherence` | raw 0–1 |
| `count`, `tokens` | raw integer |

Rates are a fraction, not a percent, deliberately: a data API composes better downstream than a
pre-formatted percentage.

## `querySpans`

The **row-level** companion to `queryAnalytics(stream: "spans")`: list individual spans across all
traces in a project. Where the `spans` analytics stream returns *aggregates* ("how many / what rate,
by dimension"), `querySpans` returns the *rows behind them* — the drill-down target for an aggregate
signal (e.g. "show me the failing `search` tool spans"). `listTraceSpans` stays scoped to a single
trace; this is cross-trace.

- **HTTP**: `POST /v1/projects/{projectSlug}/spans/query` — rate tier `high`.
- **MCP tool**: `querySpans`. **SDK**: `client.spans.query`.
- **Route**: `packages/operations/src/operations/spans.ts`; backed by `SpanRepository.listByProjectId`.

```ts
interface QuerySpansBody {
  filters?: FilterSet   // span-field DSL — see below
  range?: { fromIso: string; toIso: string }   // optional window on the span's start_time
  cursor?: string       // opaque; from a previous response's nextCursor
  limit?: number        // default 50, max 200
}
// → { items: Span[]; nextCursor: string | null; hasMore: boolean }
```

Span filter fields (`SPAN_FIELD_REGISTRY`, `packages/platform/db-clickhouse/src/registries/span-fields.ts`):
`operation`, `toolName`, `name`, `model`, `provider`, `userId`, `sessionId`, `traceId`, `tags`,
`duration`, `cost`, `tokensInput`, `tokensOutput`. (`gtePercentile` is intentionally unsupported here —
there is no per-span distribution to resolve against.)

## Engine

Everything stream-specific lives behind one descriptor so the engine stays generic — adding a stream
is adding a file under `metric-sql/streams/`, with no cross-stream `if` in the query builders.

- `packages/platform/db-clickhouse/src/metric-sql/types.ts` — `StreamDescriptor<S>` (its `buildInner`
  query, `aggregate(metric)`, `breakdowns`, `timeColumn`) and `MetricForStream<S>` (the conditional
  type that ties each stream to its metric vocabulary, so invalid stream+metric pairings don't
  compile).
- `metric-sql/streams/{traces,sessions,spans,scores,behaviors,moments}.ts` — one descriptor each.
  The trace family shares `traceFamilyAggregate` (they expose the same duration/cost/tokens columns);
  streams with a different shape (`scores`, `behaviors`, `moments`) bring their own aggregate builder.
- `metric-sql/index.ts` — the `STREAMS` registry and `streamFor(stream)` dispatch.
- `analytics-query-repository.ts` — the adapter: assembles `<aggregate> … GROUP BY <breakdown>`,
  applies the time bucket, and maps rows through `toDisplayValue`.

Filters compile through `buildClickHouseWhere(filters, registry)` (see [`filters.md`](./filters.md)),
so tenancy scoping, parameterization, and wire-scaling are inherited, not re-implemented.

## Consolidation

There is exactly **one** aggregation primitive. The generic metric engine (`metric-series-reader`,
which backs monitors) and `queryAnalytics` dispatch through the same `streamFor()` descriptors.

The curated per-entity analytics endpoints (`getTraceAnalytics`, `getSignalTrend` /
`getSignalAnalytics`, `getToolContext`, `getUserUsage`) remain as **presets** — good defaults,
well-named, cheap for investigation — and are progressively reimplemented as thin callers of the
primitive so their logic is not forked.

**Rule going forward: no new bespoke per-entity breakdown endpoint.** Any new "metric × breakdown"
need goes through `queryAnalytics`. This is the single lever that keeps the analytics layer from
fragmenting.

## Security, tenancy, limits

- **Tenancy inherited.** Every query compiles through the field registries, which inject
  `organization_id` / `project_id` and parameterize all values. There is no query-language escape
  hatch — `stream`, `metric`, and `breakdown` are enums/registry-validated; unknown values are `400`.
- **Rate limiting.** Both tools are `high` tier (org-scoped).
- **Result caps.** `limit` caps breakdown cardinality / page size (`queryAnalytics` ≤ 500,
  `querySpans` ≤ 200); `timeBucket.size` ≤ 365; the range must be well-formed (`toIso > fromIso`).
- **No raw payloads.** `queryAnalytics` returns aggregates only. `querySpans` rows exclude per-message
  LLM content (use a span point-lookup for the conversation payload).

## Dashboards (HTML output)

**B1 — data-only (the model).** The dispatched agent is itself a coding agent. Latitude makes the
data arbitrarily sliceable via `queryAnalytics` / `querySpans`; the agent embeds the returned series
inline and renders a **self-contained HTML artifact** it commits to the customer repo or hosts
itself. Latitude adds no rendering surface — matching the dispatch spec's "provider, not runtime"
stance, and keeping the OSS/self-host story clean.

**B2 — hosted dashboards (deferred).** A future option: Latitude persists a dashboard definition
(widgets → `AnalyticsQuery` objects) and renders it server-side, reusing the existing ECharts +
Satori/Resvg pipeline used for incident-trend emails. This adds storage, sharing, and RLS on
dashboard rows; it is gated on real demand for hosted (vs agent-rendered) dashboards and is not part
of the current surface.

## Related

- [`filters.md`](./filters.md) — the `FilterSet` DSL and field registries this reuses verbatim.
- [`mcp.md`](./mcp.md) — how `queryAnalytics` / `querySpans` are auto-registered as MCP tools.
- [`api.md`](./api.md) — REST surface, middleware ring, rate-limit tiers.
- [`agent-dispatch.md`](./agent-dispatch.md) — the outbound half; assumes exactly this read-back surface.
- [`signals.md`](./signals.md), [`monitors.md`](./monitors.md), [`taxonomy.md`](./taxonomy.md) —
  entity semantics behind the `scores` / `behaviors` / `moments` streams.
