# Session materialization parity with traces

## Implementation tasks

Tracking checklist for the work this spec describes. Grouped by PR boundary;
within each group, order is execution order. Boxes use `- [ ]` (unchecked)
and flip to `- [x]` as the work lands.

### PR 1 — ClickHouse schema layer (LAT-604)

- [x] Scaffold migration 00016 via `pnpm --filter @platform/db-clickhouse ch:create session_parity` (creates both clustered + unclustered files).
- [x] Fill `clickhouse/migrations/unclustered/00016_session_parity.sql`:
  - [x] `ALTER TABLE sessions DROP COLUMN IF EXISTS duration_ns;` (drops the wall-clock ALIAS so it can be re-added as a real aggregate).
  - [x] Single `ALTER TABLE sessions ADD COLUMN …` adding `duration_ns`, `time_of_first_token`, `time_to_first_token_ns` (ALIAS), `root_span_id`, `root_span_name`, `input_messages`, `last_input_messages`, `output_messages`, `system_instructions`, `retention_days` — all with explicit `AFTER` clauses to mirror trace column order.
  - [x] `ALTER TABLE sessions MODIFY TTL toDateTime(min_start_time) + toIntervalDay(retention_days + 30) DELETE;`.
  - [x] `DROP VIEW IF EXISTS sessions_mv;`.
  - [x] `CREATE MATERIALIZED VIEW sessions_mv TO sessions AS SELECT …` with the new shape: `coalesce(nullIf(session_id, ''), toString(trace_id))` grouping key (no `WHERE session_id != ''`), root-span-sum `duration_ns`, sentinel `time_of_first_token`, `argMinIf` root_span_* projections, message payloads, `max(retention_days)`.
- [x] Fill `clickhouse/migrations/clustered/00016_session_parity.sql` mirroring the unclustered file with `ON CLUSTER default` on every DDL statement.
- [x] Apply locally: `pnpm --filter @platform/db-clickhouse db:up`.
- [x] Regenerate `packages/platform/testkit/src/clickhouse/schema.sql` via `pnpm --filter @platform/db-clickhouse ch:schema:dump` and commit. (Surgical patch instead of full regen — chdb chokes on the CH-26.2 `text` index from migration 00012 that was hand-stripped from the prior dump.)
- [x] Verify orphan-trace produces a 1-trace session (`session_id = toString(trace_id)`).
- [x] Verify a multi-trace conversational session aggregates with `trace_count = N` and non-empty `models` after merge.
- [x] Verify `sum(duration_ns)` diverges from `max_end_time - min_start_time` (active execution vs wall-clock) for a session with idle gaps.
- [x] Verify TTFT sentinel: a session with no first-token reads `time_to_first_token_ns = 0`; a session with one reads positive.
- [x] Confirm trace path untouched: `pnpm --filter @platform/db-clickhouse test` passes (133/133).

### PR 2 — Domain entity

- [ ] `packages/domain/spans/src/entities/session.ts`: add `timeToFirstTokenNs`, `rootSpanId`, `rootSpanName` to `sessionSchema`.
- [ ] Same file: add `sessionDetailSchema` and `SessionDetail` paralleling `traceDetailSchema` (extends `sessionSchema` with `inputMessages`, `lastInputMessages`, `outputMessages`, `systemInstructions`).

### PR 2 — Repository port

- [ ] `packages/domain/spans/src/ports/session-repository.ts`: extend `SessionMetrics` with `timeToFirstTokenNs: NumericRollup`; update `emptySessionMetrics`.

### PR 2 — Repository implementation

- [ ] `packages/platform/db-clickhouse/src/repositories/session-repository.ts`: extend `LIST_SELECT` with `time_to_first_token_ns` (sentinel-aware finalization), `argMinIfMerge(root_span_id)`, `argMinIfMerge(root_span_name)`.
- [ ] Same file: add `DETAIL_SELECT` projecting `argMinIfMerge(input_messages)`, `argMaxIfMerge(last_input_messages)`, `argMaxIfMerge(output_messages)`, `argMinIfMerge(system_instructions)`.
- [ ] Widen `SessionListRow` (and add a `SessionDetailRow`) to match.
- [ ] Update `toDomainSession` to populate the three new fields; add a `toDomainSessionDetail`.
- [ ] Add `findBySessionId(projectId, sessionId)` returning `SessionDetail`, mirroring `findByTraceId`.
- [ ] Add `time_to_first_token_ns` rollup to `aggregateMetricsByProjectId` so session metrics match trace metrics.

### PR 2 — Filter registry & sort columns

- [ ] `packages/platform/db-clickhouse/src/registries/session-fields.ts`: add `ttft: { column: "time_to_first_token_ns", chType: "Int64" }` and `name: { column: "root_span_name", chType: "String" }`.
- [ ] `session-repository.ts` `SORT_COLUMNS`: add `ttft: { expr: "time_to_first_token_ns", chType: "Int64", rowKey: "time_to_first_token_ns" }`.

### PR 2 — Tests

- [ ] New file `packages/platform/db-clickhouse/src/repositories/session-repository.test.ts` (no existing file) modeled on `trace-repository.test.ts`.
- [ ] Cover orphan-trace-as-session: spans without `gen_ai.conversation.id` produce a row keyed on `toString(trace_id)` with `trace_count = 1`.
- [ ] Cover active-execution `duration_ns`: multi-root and concurrent-trace scenarios sum independently of wall-clock.
- [ ] Cover TTFT sentinel: no-first-token → 0; with first-token → positive.
- [ ] Cover `root_span_name` population: comes from the earliest root span across the session's first trace.
- [ ] Cover the mixed-binding case: a real session + an orphan-fragment session emitted by the same trace ID, verifying `tokens_total = 0` on the orphan fragment.

## Goal

The `sessions` ClickHouse table is fed by the same `spans` source as `traces`,
but the `sessions_mv` definition is a strict subset of `traces_mv` and has
fallen behind every time `traces` got a new column. Every downstream feature
(session-level search, filter parity, the session detail panel, freshness-sorted
results) assumes a session row carries the same kind of information a trace row
does. Today it doesn't.

This document audits every column in `traces`, lists the corresponding column
(or absence thereof) in `sessions`, and proposes a concrete aggregation
strategy for each missing field. It also covers the migration shape and the
pipeline change.

Scope is **column-level parity in the CH materialization layer**. The
`SessionRepository` is missing read methods present on `TraceRepository`
(`histogramByProjectId`, `findByTraceId`-analog, `getDistribution`,
`countAnnotatedByProjectId`, …) — that gap is adjacent and gets called out at
the end, but the methods themselves are out of scope here.

## Source of truth

Both materialized tables aggregate the same source table, `spans`, via
`AggregatingMergeTree`-backed materialized views. The `spans` table is the
append-only ingestion target.

| Layer | Source / File |
|---|---|
| Source table | `spans` — `packages/platform/db-clickhouse/clickhouse/migrations/unclustered/00001_create_spans.sql:3` |
| Trace destination table | `traces` — `…/00002_materialized_traces.sql:10` (subsequent ALTERs in `00004`, `00005`, `00008`, `00011`) |
| Trace materialized view | `traces_mv` — current shape in `…/00011_plan_aware_retention.sql:16` |
| Session destination table | `sessions` — `…/00007_sessions.sql:4` (one ALTER in `00008`) |
| Session materialized view | `sessions_mv` — current shape in `…/00008_simulation_id.sql:78` |
| Generated current schema (post-migration) | `packages/platform/testkit/src/clickhouse/schema.sql:58` (sessions), `:235` (traces), `:278` (traces_mv), `:94` (sessions_mv) |
| Trace listing repo | `packages/platform/db-clickhouse/src/repositories/trace-repository.ts:287` (`LIST_SELECT`) |
| Session listing repo | `packages/platform/db-clickhouse/src/repositories/session-repository.ts:21` (`LIST_SELECT`) |
| Trace filter registry | `packages/platform/db-clickhouse/src/registries/trace-fields.ts:7` |
| Session filter registry | `packages/platform/db-clickhouse/src/registries/session-fields.ts:4` |
| Domain trace entity | `packages/domain/spans/src/entities/trace.ts:19` |
| Domain session entity | `packages/domain/spans/src/entities/session.ts:17` |

Both `traces` and `sessions` are `AggregatingMergeTree` partitioned by
`toYYYYMM(min_start_time)`. The `traces_mv` groups by
`(organization_id, project_id, trace_id)`; the `sessions_mv` groups by
`(organization_id, project_id, session_id)` **filtered** by
`session_id != ''` (a span without a session is excluded entirely from
sessions, but every span — session or not — flows into traces).

**This filter is being removed.** Per the core constraint in `0-problems.md`,
every trace must paginate as a session — orphan spans without a
`gen_ai.conversation.id` need to surface in the sessions listing as
1-trace sessions, not be silently dropped. The new grouping expression is
`(organization_id, project_id, coalesce(nullIf(session_id, ''), toString(trace_id)))`,
which collapses real-session spans by their supplied id and synthesizes a
session per `trace_id` for orphans. The sessions table becomes a strict
superset over traces. The concrete SQL change lands in the
`sessions_mv` redefinition in §"Proposed `sessions_mv` and `sessions` shape"
below.

## Current state — `traces` materialization

Pulled directly from the post-migration schema dump
(`packages/platform/testkit/src/clickhouse/schema.sql:235`) and cross-checked
against the live MV in `…/00011_plan_aware_retention.sql:16`. Columns are
grouped by what the row carries semantically.

### Identity / grouping keys

| Column | CH type | Notes |
|---|---|---|
| `organization_id` | `LowCardinality(String)` | Part of `ORDER BY`. |
| `project_id` | `LowCardinality(String)` | Part of `ORDER BY`. |
| `trace_id` | `FixedString(32)` | Part of `ORDER BY`; OTel trace id. |

### Timing

| Column | CH type | Built from |
|---|---|---|
| `min_start_time` | `SimpleAggregateFunction(min, DateTime64(9, 'UTC'))` | `min(start_time)` over spans. |
| `max_end_time` | `SimpleAggregateFunction(max, DateTime64(9, 'UTC'))` | `max(end_time)` over spans. |
| `time_of_first_token` | `SimpleAggregateFunction(min, DateTime64(9, 'UTC'))` | `min(if(time_to_first_token_ns > 0, addNanoseconds(start_time, time_to_first_token_ns), <sentinel>))` — sentinel `2261-01-01` means "no span produced a first token". `traces_mv` line, `…/00011_plan_aware_retention.sql:61-65`. |
| `duration_ns` | `Int64 ALIAS` | `reinterpretAsInt64(max_end_time) - reinterpretAsInt64(min_start_time)` — computed at read time. |
| `time_to_first_token_ns` | `Int64 ALIAS` | `if(time_of_first_token < 2261-01-01, reinterpretAsInt64(time_of_first_token) - reinterpretAsInt64(min_start_time), 0)` — sentinel-aware. |

### Counts

| Column | CH type | Built from |
|---|---|---|
| `span_count` | `SimpleAggregateFunction(sum, UInt64)` | `count()` per group. |
| `error_count` | `SimpleAggregateFunction(sum, UInt64)` | `countIf(status_code = 2)`. |

### Tokens

| Column | CH type | Built from |
|---|---|---|
| `tokens_input` | `SimpleAggregateFunction(sum, UInt64)` | `sum(tokens_input)`. |
| `tokens_output` | `SimpleAggregateFunction(sum, UInt64)` | `sum(tokens_output)`. |
| `tokens_cache_read` | `SimpleAggregateFunction(sum, UInt64)` | `sum(tokens_cache_read)`. |
| `tokens_cache_create` | `SimpleAggregateFunction(sum, UInt64)` | `sum(tokens_cache_create)`. |
| `tokens_reasoning` | `SimpleAggregateFunction(sum, UInt64)` | `sum(tokens_reasoning)`. |
| `tokens_total` | `SimpleAggregateFunction(sum, UInt64)` | `sum(tokens_total)` (spans column itself is MATERIALIZED, not user-set). |

### Cost (microcents)

| Column | CH type | Built from |
|---|---|---|
| `cost_input_microcents` | `SimpleAggregateFunction(sum, UInt64)` | `sum(cost_input_microcents)`. |
| `cost_output_microcents` | `SimpleAggregateFunction(sum, UInt64)` | `sum(cost_output_microcents)`. |
| `cost_total_microcents` | `SimpleAggregateFunction(sum, UInt64)` | `sum(cost_total_microcents)`. |

### Identifiers carried through

| Column | CH type | Built from |
|---|---|---|
| `session_id` | `AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)` | `argMaxIfState(session_id, start_time, session_id != '')` — last non-empty session_id wins. |
| `user_id` | `AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)` | `argMaxIfState(user_id, start_time, user_id != '')`. |
| `simulation_id` | `AggregateFunction(argMaxIf, FixedString(24), DateTime64(9, 'UTC'), UInt8)` | `argMaxIfState(simulation_id, start_time, simulation_id != '')`. |

### Set-valued metadata

| Column | CH type | Built from |
|---|---|---|
| `tags` | `SimpleAggregateFunction(groupUniqArrayArray, Array(String))` | `groupUniqArrayArray(tags)`. |
| `metadata` | `SimpleAggregateFunction(maxMap, Map(String, String))` | `maxMap(metadata)` — per-key max wins on conflict. |
| `models` | `AggregateFunction(groupUniqArrayIf, String, UInt8)` | `groupUniqArrayIfState(model, model != '')`. |
| `providers` | `AggregateFunction(groupUniqArrayIf, String, UInt8)` | `groupUniqArrayIfState(provider, provider != '')`. |
| `service_names` | `AggregateFunction(groupUniqArrayIf, String, UInt8)` | `groupUniqArrayIfState(service_name, service_name != '')`. |

### Root-span attribution

| Column | CH type | Built from |
|---|---|---|
| `root_span_id` | `AggregateFunction(argMinIf, FixedString(16), DateTime64(9, 'UTC'), UInt8)` | `argMinIfState(span_id, start_time, parent_span_id = '')` — earliest parentless span. |
| `root_span_name` | `AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8)` | `argMinIfState(name, start_time, parent_span_id = '')`. |

### Detail-only message payloads

Only read by `findByTraceId` via `DETAIL_SELECT`
(`trace-repository.ts:324`). Big ZSTD(3)-compressed JSON; not in `LIST_SELECT`.

| Column | CH type | Built from |
|---|---|---|
| `input_messages` | `AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8)` | `argMinIfState(input_messages, start_time, input_messages != '')` — **first** span with input. |
| `last_input_messages` | `AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)` | `argMaxIfState(input_messages, end_time, output_messages != '')` — input of the last span that produced output. |
| `output_messages` | `AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)` | `argMaxIfState(output_messages, end_time, output_messages != '')` — **last** span with output. |
| `system_instructions` | `AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8)` | `argMinIfState(system_instructions, start_time, system_instructions != '')` — earliest non-empty. |

### Retention

| Column | CH type | Built from |
|---|---|---|
| `retention_days` | `SimpleAggregateFunction(max, UInt16)` | `max(retention_days)` — per-plan TTL knob. Drives `TTL toDateTime(min_start_time) + toIntervalDay(retention_days + 30) DELETE`. Added in `…/00011_plan_aware_retention.sql:11`. |

## Current state — `sessions` materialization

Pulled from `packages/platform/testkit/src/clickhouse/schema.sql:58` and
cross-checked against the live MV in `…/00008_simulation_id.sql:78`.

### Identity / grouping keys

| Column | CH type |
|---|---|
| `organization_id` | `LowCardinality(String)` |
| `project_id` | `LowCardinality(String)` |
| `session_id` | `String` (not `FixedString` — sessions are arbitrary tenant-supplied ids). |

### Carried through from spans

| Column | CH type | Built from |
|---|---|---|
| `trace_count` | `AggregateFunction(uniqExact, FixedString(32))` | `uniqExactState(trace_id)` — distinct trace_ids in the session. |
| `trace_ids` | `AggregateFunction(groupUniqArray, FixedString(32))` | `groupUniqArrayState(trace_id)` — full set; sessions only. |
| `span_count` | `SimpleAggregateFunction(sum, UInt64)` | `count()`. |
| `error_count` | `SimpleAggregateFunction(sum, UInt64)` | `countIf(status_code = 2)`. |
| `min_start_time` | `SimpleAggregateFunction(min, DateTime64(9, 'UTC'))` | `min(start_time)`. |
| `max_end_time` | `SimpleAggregateFunction(max, DateTime64(9, 'UTC'))` | `max(end_time)`. |
| `duration_ns` | `Int64 ALIAS` | `reinterpretAsInt64(max_end_time) - reinterpretAsInt64(min_start_time)`. |
| `tokens_input`, `tokens_output`, `tokens_cache_read`, `tokens_cache_create`, `tokens_reasoning`, `tokens_total` | `SimpleAggregateFunction(sum, UInt64)` | `sum(...)`. |
| `cost_input_microcents`, `cost_output_microcents`, `cost_total_microcents` | `SimpleAggregateFunction(sum, UInt64)` | `sum(...)`. |
| `user_id` | `AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)` | `argMaxIfState(user_id, start_time, user_id != '')`. |
| `tags` | `SimpleAggregateFunction(groupUniqArrayArray, Array(String))` | `groupUniqArrayArray(tags)`. |
| `metadata` | `SimpleAggregateFunction(maxMap, Map(String, String))` | `maxMap(metadata)`. |
| `models` | `AggregateFunction(groupUniqArrayIf, String, UInt8)` | `groupUniqArrayIfState(model, model != '')`. |
| `providers` | `AggregateFunction(groupUniqArrayIf, String, UInt8)` | `groupUniqArrayIfState(provider, provider != '')`. |
| `service_names` | `AggregateFunction(groupUniqArrayIf, String, UInt8)` | `groupUniqArrayIfState(service_name, service_name != '')`. |
| `simulation_id` | `AggregateFunction(argMaxIf, FixedString(24), DateTime64(9, 'UTC'), UInt8)` | `argMaxIfState(simulation_id, start_time, simulation_id != '')`. |

No `time_of_first_token`, no `root_span_*`, no message payloads, no
`retention_days`.

## Gap table

Side-by-side. Trace column → session counterpart. "Field semantics" describes
what the value means in the session row. Aggregation strategies are written
against `spans` (the source the MV reads), not against trace rows — the MV
runs per span insert, so there is no "trace row" available at MV time. Where
the trace MV uses one strategy and a different one makes semantic sense at
the session level, both are noted.

| Trace column | Session column today | Status | Proposed session aggregation (over every `spans` row, grouped on synthesized `session_id`) | Field semantics for session |
|---|---|---|---|---|
| `organization_id` | `organization_id` | OK | `GROUP BY` key. | Identity. |
| `project_id` | `project_id` | OK | `GROUP BY` key. | Identity. |
| `trace_id` | n/a (sessions group by `session_id`) | n/a — different grain. | Replaced by `trace_count` / `trace_ids` aggregates. | One session contains many traces. |
| `span_count` | `span_count` | OK | `count()`. | Total spans across all traces in the session. |
| `error_count` | `error_count` | OK | `countIf(status_code = 2)`. | Total error spans. |
| `min_start_time` | `min_start_time` | OK | `min(start_time)`. | Earliest activity. |
| `max_end_time` | `max_end_time` | OK | `max(end_time)`. | Latest activity. |
| `duration_ns` (ALIAS) | `duration_ns` (ALIAS) | **SEMANTIC CHANGE** | Drop the existing ALIAS. Add a real `SimpleAggregateFunction(sum, Int64)` column populated as `sum(if((parent_span_id = '' OR parent_span_id = '0000000000000000') AND end_time > start_time, reinterpretAsInt64(end_time) - reinterpretAsInt64(start_time), 0))` — sum of root-span durations, with broader root detection and a clock-skew guard. | Active execution time across all traces in the session (NOT wall-clock). Wall-clock is recoverable on the fly from `max_end_time - min_start_time`. See "On `duration_ns` semantics" below for limitations. |
| `time_of_first_token` | **MISSING** | **MISSING** | `min(if(time_to_first_token_ns > 0, addNanoseconds(start_time, time_to_first_token_ns), toDateTime64('2261-01-01 00:00:00.000000000', 9, 'UTC')))` — identical pattern to `traces_mv`. `SimpleAggregateFunction(min, DateTime64(9, 'UTC'))`. | Absolute instant of the earliest first token across the entire session. Sentinel = "no first-token instrumented in this session". |
| `time_to_first_token_ns` (ALIAS) | **MISSING** | **MISSING** | `Int64 ALIAS if(time_of_first_token < toDateTime64('2261-01-01', 9, 'UTC'), reinterpretAsInt64(time_of_first_token) - reinterpretAsInt64(min_start_time), 0)`. | Time-to-first-token of the session, measured from session start to the first first-token across all traces. Effectively `min(per-trace TTFT)` weighted by absolute trace start — the user's "how fast does this session start responding" metric. |
| `tokens_input` | `tokens_input` | OK | `sum(tokens_input)`. | Total prompt tokens. |
| `tokens_output` | `tokens_output` | OK | `sum(tokens_output)`. | Total completion tokens. |
| `tokens_cache_read` | `tokens_cache_read` | OK | `sum(tokens_cache_read)`. | Total cache reads. |
| `tokens_cache_create` | `tokens_cache_create` | OK | `sum(tokens_cache_create)`. | Total cache creates. |
| `tokens_reasoning` | `tokens_reasoning` | OK | `sum(tokens_reasoning)`. | Total reasoning tokens. |
| `tokens_total` | `tokens_total` | OK | `sum(tokens_total)`. | Total tokens. |
| `cost_input_microcents` | `cost_input_microcents` | OK | `sum(cost_input_microcents)`. | Total input cost. |
| `cost_output_microcents` | `cost_output_microcents` | OK | `sum(cost_output_microcents)`. | Total output cost. |
| `cost_total_microcents` | `cost_total_microcents` | OK | `sum(cost_total_microcents)`. | Total cost. |
| `session_id` (argMaxIf) | `session_id` (`GROUP BY` key) | n/a — at session grain it IS the key. | — | Identity. |
| `user_id` | `user_id` | OK | `argMaxIfState(user_id, start_time, user_id != '')`. | Last non-empty `user_id` observed in the session — a session is typically one user, but spans can be re-tagged. |
| `simulation_id` | `simulation_id` | OK | `argMaxIfState(simulation_id, start_time, simulation_id != '')`. | Last non-empty simulation id observed in the session. |
| `tags` | `tags` | OK | `groupUniqArrayArray(tags)`. | Union of all tags across spans. |
| `metadata` | `metadata` | OK | `maxMap(metadata)`. | Per-key max of metadata values. |
| `models` | `models` | OK | `groupUniqArrayIfState(model, model != '')`. | All models used in the session. |
| `providers` | `providers` | OK | `groupUniqArrayIfState(provider, provider != '')`. | All providers. |
| `service_names` | `service_names` | OK | `groupUniqArrayIfState(service_name, service_name != '')`. | All services. |
| `root_span_id` | **MISSING** | **MISSING (open question — see below)** | A session has no single root span; consider `argMinIfState(span_id, start_time, parent_span_id = '' OR parent_span_id = '0000000000000000')` to record the earliest root span (the root of the **first trace**). | "Where the session started." Less meaningful than for a trace but still useful for the session detail panel header. See open question. |
| `root_span_name` | **MISSING** | **MISSING** | `argMinIfState(name, start_time, parent_span_id = '' OR parent_span_id = '0000000000000000')` — earliest root span name. Predicate matches `duration_ns`'s root detection. | The first trace's root span name. Drives the session card's primary label, analogous to `root_span_name` on the trace card. |
| `input_messages` | **MISSING** | **MISSING (detail-only)** | `argMinIfState(input_messages, start_time, input_messages != '')` — input of the **earliest** span that has input. | The session opener. Renders in the session detail panel as the first message. |
| `last_input_messages` | **MISSING** | **MISSING (detail-only)** | `argMaxIfState(input_messages, end_time, output_messages != '')` — input of the **latest** span that produced output. | The most recent user turn that the model responded to. Used to render "current state" in the panel. |
| `output_messages` | **MISSING** | **MISSING (detail-only)** | `argMaxIfState(output_messages, end_time, output_messages != '')` — output of the **latest** span that produced output. | The most recent assistant response. |
| `system_instructions` | **MISSING** | **MISSING (detail-only)** | `argMinIfState(system_instructions, start_time, system_instructions != '')` — the earliest non-empty system. | The system instructions that opened the session. If the session re-instruments the system mid-conversation we keep the **first**; the detail panel can still pull per-trace system out of `traces` if needed. |
| `retention_days` | **MISSING** | **MISSING** | `SimpleAggregateFunction(max, UInt16)` initialized from `max(retention_days)` over spans. | Drives the same plan-aware `TTL toDateTime(min_start_time) + toIntervalDay(retention_days + 30) DELETE` we apply to `traces`. Without it, session retention diverges from trace retention. |

### Trace columns intentionally NOT mirrored

- `traces.trace_id` has no counterpart — sessions group by `session_id`,
  so the analog is the **set** of trace ids the session contains, already
  carried in `sessions.trace_ids` (`AggregateFunction(groupUniqArray, FixedString(32))`)
  and the cardinality count in `sessions.trace_count`.

### Session-specific columns with no trace counterpart

- `trace_count` (`uniqExact(trace_id)`) and `trace_ids` (`groupUniqArray(trace_id)`)
  exist on sessions but not on traces, by design — a trace is by definition
  one trace_id. They stay.

## On `duration_ns` semantics

`duration_ns` on sessions is **redefined** in this spec. The trace
column stays as-is (wall-clock from `min_start_time` to `max_end_time`,
which for a single trace is also its active execution time). The
session column changes meaning.

### Today (wrong for sessions)

`duration_ns` is an `Int64 ALIAS` computed as
`reinterpretAsInt64(max_end_time) - reinterpretAsInt64(min_start_time)`
— wall-clock from first activity to last. For a session this is
misleading: two sessions with the same wall-clock window can do wildly
different amounts of work.

| Session A | Session B |
|---|---|
| Spans 2 days | Spans 2 days |
| 24 traces averaging 12 hours each | 24 traces averaging 5 minutes each |
| Wall-clock window: 2 days | Wall-clock window: 2 days |
| Active execution: ~12 d (sum) | Active execution: ~2 h (sum) |

The current `duration_ns` reports the same 2 days for both.

### After this spec

`duration_ns` on sessions becomes a real
`SimpleAggregateFunction(sum, Int64)` column storing the **sum of
per-trace active execution times**. Computed at MV time as:

```sql
sum(if(
    (parent_span_id = '' OR parent_span_id = '0000000000000000')
        AND end_time > start_time,
    reinterpretAsInt64(end_time) - reinterpretAsInt64(start_time),
    toInt64(0)
)) AS duration_ns
```

Finalized at read time as `sum(duration_ns)` in `LIST_SELECT`.

This is the active-execution-time semantic the user actually cares
about. Wall-clock is still trivially recoverable when needed (the
panel header's "started 2 days ago" copy uses
`now() - min_start_time` or `max_end_time - min_start_time` directly
off the timestamp columns; no derived column required).

### Why "root spans only"

`sessions_mv` groups by `(org, project, session_id)` and runs per span,
so we can't first group by trace_id and take each trace's duration. The
naive `sum(end_time - start_time)` over **all** spans double-counts: a
parent span's window already contains its children's windows, so
summing both adds the child time twice.

Filtering to **root spans** avoids the double count. Each trace's
active duration equals its root span's duration (or sum-of-root-durations
when a trace has multiple parent-less roots — rare; sum is still a
defensible read of "top-level work"). The session-level `sum(...)` then
sums those across all of the session's traces, which is what "active
duration of a session" means.

### Root-span detection: broader than `parent_span_id = ''`

We treat a span as a root if **either** of these holds:

- `parent_span_id = ''` — the conventional OTel "no parent" signal.
- `parent_span_id = '0000000000000000'` — the all-zeros sentinel some
  OTLP exporters emit instead of an empty string.

Both shapes appear in customer telemetry. Matching only the empty
string would silently miss legitimate roots from exporters using the
sentinel, dropping those traces' contribution to `duration_ns` to zero.
The same broader predicate is used for `root_span_id` / `root_span_name`
in `sessions_mv` for consistency — if a span is a root for one purpose,
it's a root for all of them.

### Asymmetry with traces is intentional

On traces, `duration_ns = max_end_time - min_start_time` (the existing
ALIAS) stays correct. A trace is one continuous unit of work — there
are no idle gaps inside a trace — so wall-clock and active execution
coincide. The asymmetry only kicks in at the session level, which is
where the wall-clock definition was actively wrong.

The cost of this asymmetry is that "compare a session's `duration_ns`
to its constituent traces' `duration_ns`s" doesn't yield max-of-traces;
it yields sum-of-traces. Worth documenting on the entity; not worth
splitting into two columns.

### Clock-skew guard

The `end_time > start_time` predicate inside the `if` keeps a span with
client-reported clock drift (negative duration) from polluting the
sum. Same defensive pattern the trace `time_to_first_token_ns` ALIAS
uses. Note this only catches **negative** drift — a span with a
positive runaway duration (`end_time` 10 years in the future) is
**not** clamped. See "Known limitations" below.

### Known limitations

The formula is honest about which edge cases produce surprising
numbers. None of these are corrected at the MV level because the
corrections would either require per-trace logic the MV can't express,
or would silently mask bugs that customers need to see.

| Case | Effect on `duration_ns` | Why we don't "fix" it |
|---|---|---|
| **Trace with no root span at all** (every span has a non-root `parent_span_id`, e.g. root was dropped during ingestion or all spans reference parents outside the trace) | Trace contributes 0 to the session sum. Other timing columns (`min_start_time`, `max_end_time`) are unaffected. | The MV can't detect "this trace has no root span" without per-trace grouping. Wall-clock is still recoverable for affected sessions via `max_end_time - min_start_time`; the customer's instrumentation needs fixing anyway. |
| **Trace with multiple root spans, running in parallel** | Both root durations are summed; total can exceed the trace's wall-clock window. | Intentional. `duration_ns` is "compute time spent", not wall-clock. Same posture as the cross-trace parallelism case below. |
| **Concurrent traces in one session** (e.g. agent fires off two simultaneous requests, each its own `trace_id`) | Both traces' durations are summed even though wall-clock overlaps. | Intentional — same reasoning as multiple-roots. Users who need to detect parallelism can compare `sum(duration_ns)` to wall-clock `reinterpretAsInt64(max(max_end_time)) - reinterpretAsInt64(min(min_start_time))`. |
| **Root span with `end_time` drifted far into the future** (forgotten finalization, clock skew) | The bad span's contribution dominates the sum; `duration_ns` reads in the years/centuries. | Deliberately not capped. A capped value would silently mask a real instrumentation bug — the customer needs to see the obvious-wrong number to investigate. Trace-side `duration_ns` has the same vulnerability and isn't capped either; matching behavior beats one-sided patching. |
| **Root span with `end_time < start_time`** (negative duration from clock skew) | Caught by the `end_time > start_time` guard; contributes 0. | Logical nonsense, distinct from "anomalous but meaningful". Zero is the only honest answer. |
| **All spans of a trace use an unusual `parent_span_id` sentinel** (not empty, not all-zeros) | Trace contributes 0. | Falls under "no root span" — same outcome, same reasoning. If a third sentinel pattern appears in production, add it to the predicate at that time. |
| **Spans arriving out of order** (child span lands before parent in separate insert blocks) | Initially under-counts because the child block sees no root. The parent block, when it arrives, contributes its duration as a partial. `AggregatingMergeTree` merges the partials in the background. Eventually consistent. | Transient under-count, no special handling needed. |

## On `time_to_first_token_ns` semantics

For a single trace, TTFT is unambiguous: time from `min_start_time` to the
first first-token instant across spans. For a session containing multiple
traces, we have a choice:

| Option | Definition | Surface |
|---|---|---|
| **A — Session-opening TTFT (proposed)** | `min(time_of_first_token) - min(start_time)` — the gap from when the session started to when the first token of any span ever streamed. | Matches the trace definition mechanically (same SQL pattern). |
| B — Min per-trace TTFT | Smallest TTFT across the session's traces, ignoring inter-trace timing. | Requires the materialization to know trace boundaries, which `sessions_mv` doesn't (it groups by `session_id`, not `trace_id`). |
| C — Avg per-trace TTFT | Average across traces. | Same constraint as B; also distorted by silent/zero-TTFT traces. |

Option A is the only one expressible at MV time without re-grouping by
trace_id, and it mirrors the trace definition exactly. It answers the
question users actually ask in the freshness/responsiveness context: *"how
quickly does this session start producing output?"*

If we ever want per-trace TTFT statistics at the session grain (B/C), the
right place is the read path: a CTE that selects from `traces` filtered to
the session's `trace_ids` and computes whatever rollup you want. Don't push
that into `sessions_mv`.

## Proposed `sessions_mv` and `sessions` shape

Single migration that brings `sessions` to full parity with `traces` for
the columns that have a session-meaningful counterpart. Mirrors the
`traces_mv` pattern row-for-row so future ALTERs can be applied identically
to both tables.

```sql
-- duration_ns on sessions is being redefined from a wall-clock ALIAS to a
-- real "sum of per-trace active execution time" aggregate column. The drop
-- and re-add must run in this order — CH doesn't support MODIFY COLUMN to
-- change a column from ALIAS to a real aggregate.
ALTER TABLE sessions DROP COLUMN IF EXISTS duration_ns;

ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS duration_ns
        SimpleAggregateFunction(sum, Int64)
        DEFAULT 0
        CODEC(T64, ZSTD(1))
        AFTER max_end_time,
    ADD COLUMN IF NOT EXISTS time_of_first_token
        SimpleAggregateFunction(min, DateTime64(9, 'UTC'))
        CODEC(Delta(8), ZSTD(1))
        AFTER duration_ns,
    ADD COLUMN IF NOT EXISTS time_to_first_token_ns Int64 ALIAS if(
        time_of_first_token < toDateTime64('2261-01-01', 9, 'UTC'),
        reinterpretAsInt64(time_of_first_token) - reinterpretAsInt64(min_start_time),
        0
    ) AFTER time_of_first_token,
    ADD COLUMN IF NOT EXISTS root_span_id
        AggregateFunction(argMinIf, FixedString(16), DateTime64(9, 'UTC'), UInt8)
        CODEC(ZSTD(1))
        AFTER service_names,
    ADD COLUMN IF NOT EXISTS root_span_name
        AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8)
        CODEC(ZSTD(1))
        AFTER root_span_id,
    ADD COLUMN IF NOT EXISTS input_messages
        AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8)
        CODEC(ZSTD(3))
        AFTER root_span_name,
    ADD COLUMN IF NOT EXISTS last_input_messages
        AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)
        CODEC(ZSTD(3))
        AFTER input_messages,
    ADD COLUMN IF NOT EXISTS output_messages
        AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)
        CODEC(ZSTD(3))
        AFTER last_input_messages,
    ADD COLUMN IF NOT EXISTS system_instructions
        AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8)
        CODEC(ZSTD(3))
        AFTER output_messages,
    ADD COLUMN IF NOT EXISTS retention_days
        SimpleAggregateFunction(max, UInt16)
        DEFAULT 90
        CODEC(T64, ZSTD(1));

ALTER TABLE sessions
    MODIFY TTL toDateTime(min_start_time) + toIntervalDay(retention_days + 30) DELETE;

DROP VIEW IF EXISTS sessions_mv;

CREATE MATERIALIZED VIEW IF NOT EXISTS sessions_mv TO sessions
AS SELECT
    s.organization_id,
    s.project_id,
    -- Every trace must paginate as a session (see 0-problems.md core constraint).
    -- Spans with no gen_ai.conversation.id synthesize a session keyed on
    -- trace_id, so orphan traces surface as 1-trace sessions.
    coalesce(nullIf(s.session_id, ''), toString(s.trace_id))         AS session_id,

    uniqExactState(s.trace_id)                                       AS trace_count,
    groupUniqArrayState(s.trace_id)                                  AS trace_ids,
    count()                                                          AS span_count,
    countIf(s.status_code = 2)                                       AS error_count,

    min(s.start_time)                                                AS min_start_time,
    max(s.end_time)                                                  AS max_end_time,

    -- Active execution time: sum of root-span durations across the session's
    -- traces. Distinguishes a 2-day session that worked 12 h/day from a 2-day
    -- session that worked 5 min/day. See "On duration_ns semantics" above for
    -- the rationale, the limitations, and why we don't cap runaway values.
    -- Wall-clock is recoverable from min/max_*_time directly.
    sum(if(
        (s.parent_span_id = '' OR s.parent_span_id = '0000000000000000')
            AND s.end_time > s.start_time,
        reinterpretAsInt64(s.end_time) - reinterpretAsInt64(s.start_time),
        toInt64(0)
    ))                                                               AS duration_ns,

    min(if(
        s.time_to_first_token_ns > 0,
        addNanoseconds(s.start_time, toInt64(s.time_to_first_token_ns)),
        toDateTime64('2261-01-01 00:00:00.000000000', 9, 'UTC')
    ))                                                               AS time_of_first_token,

    sum(s.tokens_input)                                              AS tokens_input,
    sum(s.tokens_output)                                             AS tokens_output,
    sum(s.tokens_cache_read)                                         AS tokens_cache_read,
    sum(s.tokens_cache_create)                                       AS tokens_cache_create,
    sum(s.tokens_reasoning)                                          AS tokens_reasoning,
    sum(s.tokens_total)                                              AS tokens_total,

    sum(s.cost_input_microcents)                                     AS cost_input_microcents,
    sum(s.cost_output_microcents)                                    AS cost_output_microcents,
    sum(s.cost_total_microcents)                                     AS cost_total_microcents,

    argMaxIfState(s.user_id, s.start_time, s.user_id != '')          AS user_id,
    groupUniqArrayArray(s.tags)                                      AS tags,
    maxMap(s.metadata)                                               AS metadata,
    groupUniqArrayIfState(s.model, s.model != '')                    AS models,
    groupUniqArrayIfState(s.provider, s.provider != '')              AS providers,
    groupUniqArrayIfState(s.service_name, s.service_name != '')      AS service_names,
    argMaxIfState(s.simulation_id, s.start_time, s.simulation_id != '') AS simulation_id,

    -- Root detection matches the duration_ns predicate above: both bare
    -- empty string and the all-zeros OTLP sentinel count as roots.
    argMinIfState(s.span_id, s.start_time,
        s.parent_span_id = '' OR s.parent_span_id = '0000000000000000') AS root_span_id,
    argMinIfState(s.name, s.start_time,
        s.parent_span_id = '' OR s.parent_span_id = '0000000000000000') AS root_span_name,
    argMinIfState(s.input_messages, s.start_time, s.input_messages != '') AS input_messages,
    argMaxIfState(s.input_messages, s.end_time, s.output_messages != '')  AS last_input_messages,
    argMaxIfState(s.output_messages, s.end_time, s.output_messages != '') AS output_messages,
    argMinIfState(s.system_instructions, s.start_time, s.system_instructions != '') AS system_instructions,

    max(s.retention_days)                                            AS retention_days

FROM spans AS s
GROUP BY s.organization_id, s.project_id, session_id;
```

Notes on the shape:

- The previous `WHERE s.session_id != ''` filter is **removed**. Every span
  now produces a session row — real sessions keyed by `gen_ai.conversation.id`,
  orphan traces keyed by their `trace_id` cast to a string. `trace_count = 1`
  is the natural marker for the orphan case, and downstream surfaces don't
  branch on it. See the core constraint in `0-problems.md` for the user-facing
  reason; see "On orphan-trace sessions" below for the read-time implications.
- `root_span_id` / `root_span_name` use `argMinIf` on the earliest parent-less
  span observed in the session, which is the root span of the session's
  first trace. The session detail panel can present this as the session's
  "primary trace name" without an extra join against `traces`.
- `time_of_first_token` uses the same sentinel-based pattern as
  `traces_mv` — drop-in from `…/00011_plan_aware_retention.sql:61-65`.
- `retention_days` aligns session TTL with trace TTL. Without it, sessions
  would be retained at the table-level default forever, drifting from
  `traces` after `00011`.
- `last_input_messages` is keyed on `end_time + output_messages != ''`, same
  as on `traces`. The intent — "input that the last responsive span saw" —
  carries over verbatim.

## On orphan-trace sessions

Spans without `gen_ai.conversation.id` produce a session row whose
`session_id` is the trace_id as a hex string. Implications worth recording:

- **`trace_count` is the orphan marker.** Pure orphan sessions always have
  `trace_count = 1` and `trace_ids = [the same trace_id the session_id was
  derived from]`. The UI may render them differently (no "session of N
  turns" badge), but the storage shape is the same. Treat `trace_count = 1`
  as a derived predicate, not as a separate row class.
- **`session_id` column type is unchanged.** `sessions.session_id` is
  already `String` (not `FixedString`) per `…/00007_sessions.sql:4`, so a
  32-character hex trace_id fits without a schema change.
- **No risk of collision with real session ids.** Real `session_id`s are
  arbitrary tenant-supplied strings (commonly UUIDs, short slugs, or
  database ids). A 32-char lowercase hex trace_id matches the `FixedString(32)`
  format only by coincidence; in practice tenants don't pick OTel trace ids
  as their conversation ids. If a collision ever happens, the two rows
  merge — same `(org, project, session_id)` key — which is a no-op for
  every aggregation in the MV. It would conflate one orphan trace with one
  real session of the same id, which is a strictly tenant-controlled
  outcome.
- **`trace_ids` invariant.** For orphan sessions, `trace_ids = [trace_id]`
  and `session_id = toString(trace_id)`. Anything that wants to look up
  the underlying trace can use either field; the panel and search-result
  navigation pick `trace_ids[0]`.

### SDK contract and mixed binding

For the rollup to be correct, `gen_ai.conversation.id` must be set on
**every span of a conversational trace, or none of them.** This is the
SDK-side contract documented in `0-problems.md`. The Latitude SDK propagates
the attribute automatically via OTel context — any project using the
Latitude SDK satisfies the contract by construction.

OTel-direct customers using auto-instrumentation libraries (HTTP frameworks
+ third-party GenAI SDKs) are the case where the contract can be violated.
By default, auto-instrumentation only tags the GenAI SDK's own LLM-call
spans; surrounding HTTP / DB / auth spans of the same trace carry empty
`session_id`. When this happens the trace produces **two session rows**:

| Row | Built from | Visual signature |
|---|---|---|
| Real session (`session_id = 'conv-xyz'`) | LLM-tagged spans | `tokens_total > 0`, `cost_total_microcents > 0`, non-empty `models`, real `output_messages` |
| Orphan fragment (`session_id = toString(trace_id)`) | Framework spans only | `tokens_total = 0`, `cost_total_microcents = 0`, `models = []`, empty `output_messages`, `trace_count = 1` |

The orphan fragment is noise. It's not actively misleading — it represents
the framework overhead of one conversational request — but it doubles the
rows in the sessions list for affected customers. Mitigation lives at two
layers:

- **Filter-bar default**: a "has LLM activity" chip (`tokens_total > 0 OR
  length(models) > 0`) is applied by default on the sessions list and
  hides orphan fragments. Documented in `./4-filter-parity.md`.
- **Documentation**: the OTel-direct integration guide tells customers to
  propagate `gen_ai.conversation.id` to all spans of a conversational
  trace, with a copy-paste OTel context-propagator snippet. Latitude-SDK
  users don't need to read it.

Reconciliation (server-side merging of fragments back into the real
session) is **not** a goal of this spec. The contract is the contract;
violations produce visible-but-bounded noise; if mixed binding becomes
common enough to matter, we add reconciliation later as a separate item.

### Why every downstream surface uses the coalesce expression directly

The MV's `session_id` field is the canonical id. Anywhere outside the MV
that needs to derive "this trace's session" — score writes, search
rollups, listing queries that join from `traces` — should apply the same
expression on the trace row:

```sql
coalesce(nullIf(traces.session_id, ''), toString(traces.trace_id))
```

(where `traces.session_id` is the `argMaxIfMerge` finalization of the
trace's resolved session_id). This guarantees that every layer arrives at
the same canonical id without coordinating through `sessions` directly,
and that orphan traces always get the synthesized id without an `IS NULL`
branch downstream. The exact use of this expression is documented in
`./3-session-issue-dedup.md` (score writes) and `./2-session-level-search.md`
(rollup grouping).

## Read path changes — `SessionRepository.LIST_SELECT`

The repo's `LIST_SELECT` at
`packages/platform/db-clickhouse/src/repositories/session-repository.ts:21`
needs to project the new columns through the same `*Merge` finalizers as
`traces`. Below is the proposed shape; identical in form to the trace
repo's `LIST_SELECT` (`trace-repository.ts:287`):

```ts
const LIST_SELECT = `
  organization_id,
  project_id,
  session_id,
  uniqExactMerge(trace_count)  AS trace_count,
  groupUniqArrayMerge(trace_ids) AS trace_ids,
  sum(span_count)              AS span_count,
  sum(error_count)             AS error_count,
  min(min_start_time)          AS start_time,
  max(max_end_time)            AS end_time,
  sum(duration_ns)             AS duration_ns,  -- active execution time, NOT wall-clock
  if(
    min(time_of_first_token) < toDateTime64('2261-01-01', 9, 'UTC'),
    reinterpretAsInt64(min(time_of_first_token))
      - reinterpretAsInt64(min(min_start_time)),
    0
  )                              AS time_to_first_token_ns,
  sum(tokens_input)            AS tokens_input,
  sum(tokens_output)           AS tokens_output,
  sum(tokens_cache_read)       AS tokens_cache_read,
  sum(tokens_cache_create)     AS tokens_cache_create,
  sum(tokens_reasoning)        AS tokens_reasoning,
  sum(tokens_total)            AS tokens_total,
  sum(cost_input_microcents)   AS cost_input_microcents,
  sum(cost_output_microcents)  AS cost_output_microcents,
  sum(cost_total_microcents)   AS cost_total_microcents,
  argMaxIfMerge(user_id)       AS user_id,
  groupUniqArrayArray(tags)    AS tags,
  maxMap(metadata)             AS metadata,
  groupUniqArrayIfMerge(models)        AS models,
  groupUniqArrayIfMerge(providers)     AS providers,
  groupUniqArrayIfMerge(service_names) AS service_names,
  argMaxIfMerge(simulation_id)         AS simulation_id,
  argMinIfMerge(root_span_id)          AS root_span_id,
  argMinIfMerge(root_span_name)        AS root_span_name
`
```

And a `DETAIL_SELECT` once the session detail panel lands, mirroring
`trace-repository.ts:324`:

```ts
const DETAIL_SELECT = `${LIST_SELECT},
  argMinIfMerge(input_messages)        AS input_messages,
  argMaxIfMerge(last_input_messages)   AS last_input_messages,
  argMaxIfMerge(output_messages)       AS output_messages,
  argMinIfMerge(system_instructions)   AS system_instructions
`
```

The repo's `toDomainSession` (`session-repository.ts:128`) needs to widen
to populate `timeToFirstTokenNs`, `rootSpanId`, `rootSpanName`. The domain
`sessionSchema` (`packages/domain/spans/src/entities/session.ts:17`) gets
the same fields. A `SessionDetail` schema parallel to `traceDetailSchema`
(`packages/domain/spans/src/entities/trace.ts:68`) is the natural home for
the message payload fields, kept off the list endpoint for the same
list-payload-budget reason.

### Filter registry

`SESSION_FIELD_REGISTRY` (`packages/platform/db-clickhouse/src/registries/session-fields.ts:4`)
gains:

```ts
ttft: { column: "time_to_first_token_ns", chType: "Int64" },
// + once session-level root span name lands:
name: { column: "root_span_name", chType: "String" },
```

The `status` field (`overall_status` on traces was dropped in `…/00005`, so
neither table has it) — `error_count > 0` is the OK/ERROR signal for both.
A future filter-parity pass can add a synthetic `status` filter that
translates to `error_count = 0` / `error_count > 0`, but it doesn't need
a new column.

## Pipeline — how rows are produced

### Today

```
client SDK
   │
   ▼
OTLP ingest → SpanRepository.insert (db-clickhouse/src/repositories/span-repository.ts:410)
                                         │
                                         ▼
                                     spans (ReplacingMergeTree)
                                         │  (ClickHouse-native MV trigger,
                                         │   runs per-block on insert)
              ┌──────────────────────────┴──────────────────────────┐
              ▼                                                     ▼
        traces_mv → traces                                  sessions_mv → sessions
        (AggregatingMergeTree, ORDER BY trace_id)           (AggregatingMergeTree, ORDER BY session_id)
```

There is **no worker** in this path. Both `traces` and `sessions` are
populated entirely inside ClickHouse from `spans` inserts. The
`trace-search:refreshTrace` worker referenced in `specs/trace-search.md`
is downstream of this — it indexes already-materialized traces for
full-text/semantic search and is unrelated to the materialization itself.

There is also **no Postgres mirror** of either table — `Session` and
`Trace` are CH-only entities at the storage layer. Postgres carries
organizations, projects, scores' relational links, but not the
session/trace rollups.

### After this change

Same shape — only the `sessions_mv` definition changes. The pipeline
remains "insert into spans → ClickHouse fans out via two MVs". No new
worker, no new queue, no Postgres write.

The MV swap (`DROP VIEW; CREATE VIEW`) is the only moment a session insert
can land on the source table without being projected. Both runs of the MV
DDL in `00008_simulation_id.sql` and `00004_user_id_and_metadata.sql`
follow this drop-and-recreate pattern; the existing `traces_mv` migrations
accept the same brief gap. In practice the migration runs on a quiescent
deployment slot; the gap is sub-second.

### One operational gotcha worth flagging

ClickHouse MVs fire on **inserted blocks**, not on the destination table
state. If a single trace's spans arrive split across two inserts, both
`traces_mv` and `sessions_mv` produce two partial rows for the same
`(org, project, trace_id)` / `(org, project, session_id)`. The
`AggregatingMergeTree` engine merges them in the background. That's why
both repos finalize partials at read time with `*Merge` /
`sum`/`min`/`max` and `GROUP BY` (see `LIST_SELECT` patterns above and
the explicit comment in `…/00002_materialized_traces.sql:6-9`).
This is already the operating model; the changes here don't shift it.

## Migration / backfill

### Forward migration

One migration file (paired clustered/unclustered, same shape as `00008`):

```
clickhouse/migrations/unclustered/00016_session_parity.sql
clickhouse/migrations/clustered/00016_session_parity.sql
```

Structure:

1. `ALTER TABLE sessions DROP COLUMN IF EXISTS duration_ns;` — drops the
   existing wall-clock ALIAS so the next step can re-add the name as a
   real `SimpleAggregateFunction` column with the new active-execution
   semantics. Must be a separate statement before the bulk ADD; CH
   doesn't allow swapping an ALIAS into an aggregate column inside a
   single ALTER.
2. `ALTER TABLE sessions ADD COLUMN … (all new columns including the new
   `duration_ns`) … AFTER …` — single ALTER to minimize DDL metadata churn
   (same comment in `…/00008_simulation_id.sql:5`).
3. `ALTER TABLE sessions MODIFY TTL …` — apply plan-aware retention.
4. `DROP VIEW IF EXISTS sessions_mv;`
5. `CREATE MATERIALIZED VIEW sessions_mv TO sessions AS SELECT …;`

The clustered variant adds `ON CLUSTER default` and switches
`AggregatingMergeTree` → `ReplicatedAggregatingMergeTree`, same as the
existing pair (`…/clustered/00007_sessions.sql` vs `…/unclustered/00007_sessions.sql`).

### Backfill strategy

Two scenarios depending on operational priorities:

**Option 1 — Forward-only (recommended).** New columns default to:

- `duration_ns`: column DEFAULT 0. Existing session rows read as 0
  until a new span lands. This is a **noticeable change** for old
  sessions — they used to render their wall-clock window as duration
  and will now render 0 until they ingest something new. Callers that
  show "duration" on the sessions list need to tolerate 0 on
  pre-migration rows (the same way they tolerate 0 TTFT on
  pre-`…/00005` traces). Wall-clock is still readable on the fly from
  `max_end_time - min_start_time` for any UI that wants a non-zero
  number on legacy rows (no separate derived column — see Decisions
  below).
- `time_of_first_token`: the sentinel `2261-01-01` (effectively NULL via the
  ALIAS path; `time_to_first_token_ns` ALIAS returns 0).
- `root_span_id`, `root_span_name`, `input_messages`, `last_input_messages`,
  `output_messages`, `system_instructions`: `*State` aggregate functions
  default to zero-byte empty state; their `*Merge` finalizers return empty
  string / `FixedString` zeros.
- `retention_days`: column DEFAULT 90.

For sessions that haven't received an insert since the migration, all new
columns read as empty/zero. New inserts (i.e. new spans on existing
sessions, or fully new sessions) immediately produce correct values for
those sessions going forward.

This is the same forward-only stance that `specs/trace-search.md` takes for
the search corpus. Justification:

- The MV runs per insert. For a session that's still active (still
  receiving spans), the next ingested span produces a partial row with the
  new columns filled in, which the `AggregatingMergeTree` merges with the
  existing partials. No worker required.
- For closed sessions, the new columns stay empty. UI must tolerate empty
  `rootSpanName`, zero `timeToFirstTokenNs`, etc. — this is the same
  tolerance the trace path already has for traces ingested before
  `…/00005` and `…/00008`.

**Option 2 — Backfill via re-aggregation.** If product wants historical
sessions to carry the new columns:

```sql
INSERT INTO sessions
SELECT
    organization_id,
    project_id,
    coalesce(nullIf(session_id, ''), toString(trace_id))           AS session_id,
    uniqExactState(trace_id)                                       AS trace_count,
    groupUniqArrayState(trace_id)                                  AS trace_ids,
    count()                                                        AS span_count,
    countIf(status_code = 2)                                       AS error_count,
    min(start_time)                                                AS min_start_time,
    max(end_time)                                                  AS max_end_time,
    sum(if((parent_span_id = '' OR parent_span_id = '0000000000000000')
               AND end_time > start_time,
           reinterpretAsInt64(end_time) - reinterpretAsInt64(start_time),
           toInt64(0)))                                            AS duration_ns,
    min(if(time_to_first_token_ns > 0,
           addNanoseconds(start_time, toInt64(time_to_first_token_ns)),
           toDateTime64('2261-01-01 00:00:00.000000000', 9, 'UTC'))) AS time_of_first_token,
    sum(tokens_input), sum(tokens_output), sum(tokens_cache_read),
    sum(tokens_cache_create), sum(tokens_reasoning), sum(tokens_total),
    sum(cost_input_microcents), sum(cost_output_microcents), sum(cost_total_microcents),
    argMaxIfState(user_id, start_time, user_id != '')              AS user_id,
    groupUniqArrayArray(tags)                                      AS tags,
    maxMap(metadata)                                               AS metadata,
    groupUniqArrayIfState(model, model != '')                      AS models,
    groupUniqArrayIfState(provider, provider != '')                AS providers,
    groupUniqArrayIfState(service_name, service_name != '')        AS service_names,
    argMaxIfState(simulation_id, start_time, simulation_id != '')  AS simulation_id,
    argMinIfState(span_id, start_time,
        parent_span_id = '' OR parent_span_id = '0000000000000000') AS root_span_id,
    argMinIfState(name, start_time,
        parent_span_id = '' OR parent_span_id = '0000000000000000') AS root_span_name,
    argMinIfState(input_messages, start_time, input_messages != '') AS input_messages,
    argMaxIfState(input_messages, end_time, output_messages != '')  AS last_input_messages,
    argMaxIfState(output_messages, end_time, output_messages != '') AS output_messages,
    argMinIfState(system_instructions, start_time, system_instructions != '') AS system_instructions,
    max(retention_days)                                            AS retention_days
FROM spans
WHERE start_time >= now() - INTERVAL <N> DAY
GROUP BY organization_id, project_id, coalesce(nullIf(session_id, ''), toString(trace_id));
```

This produces additional partial rows for every session in the window;
`AggregatingMergeTree`'s background merges fold them into the existing
rows. `<N>` should match the desired backfill horizon. Per-org or
per-project chunking is straightforward by adding `AND organization_id =
{...}` and looping in a maintenance script.

**Recommendation:** ship Option 1 (forward-only). If a customer explicitly
asks for historical session enrichment, run Option 2 scoped to that
project. It is the same posture as `trace-search`'s "no first-class
backfill in the product UI".

### `ReplacingMergeTree` vs `AggregatingMergeTree` consideration

The `sessions` table is `AggregatingMergeTree`, and stays so. The
`SimpleAggregateFunction(min|max|sum, …)` + `AggregateFunction(arg*If, …)`
columns are the right primitives for incremental, idempotent
materialization — every new span lands as a partial row, merges fold
partials together, queries finalize via `sum`/`min`/`max`/`*Merge`.

`ReplacingMergeTree` would only make sense if sessions were
**worker-computed snapshots** (one row per session, replaced wholesale on
the next refresh). They aren't — they're a true streaming roll-up. Don't
change the engine.

For comparison: the search-corpus tables `trace_search_documents` and
`trace_search_embeddings` ARE `ReplacingMergeTree`
(`testkit/src/clickhouse/schema.sql:362,379`), because the trace-search
worker computes them as wholesale snapshots indexed at trace-end. That
pipeline is parallel and unrelated.

## Files that change

| Layer | File | Change |
|---|---|---|
| Migration | `packages/platform/db-clickhouse/clickhouse/migrations/unclustered/00016_session_parity.sql` (new) | ALTER + DROP/CREATE MV. |
| Migration | `packages/platform/db-clickhouse/clickhouse/migrations/clustered/00016_session_parity.sql` (new) | Same with `ON CLUSTER default` and `ReplicatedAggregatingMergeTree`. |
| Generated schema | `packages/platform/testkit/src/clickhouse/schema.sql` | Regenerated via `pnpm --filter @platform/db-clickhouse ch:schema:dump` after applying migrations. |
| Domain entity | `packages/domain/spans/src/entities/session.ts:17` | Add `timeToFirstTokenNs`, `rootSpanId`, `rootSpanName`. |
| Domain entity | `packages/domain/spans/src/entities/session.ts` | Add `sessionDetailSchema` and `SessionDetail` paralleling `traceDetailSchema`. |
| Repo port | `packages/domain/spans/src/ports/session-repository.ts:61` | Update `SessionMetrics` to add `timeToFirstTokenNs: NumericRollup`; update `emptySessionMetrics`. |
| Repo impl | `packages/platform/db-clickhouse/src/repositories/session-repository.ts:21` | Extend `LIST_SELECT` with new columns, add `DETAIL_SELECT`, widen `SessionListRow`, update `toDomainSession`, add a `findBySessionId` method that returns `SessionDetail`. |
| Repo impl | `packages/platform/db-clickhouse/src/repositories/session-repository.ts:310` | Add `time_to_first_token_ns` to `aggregateMetricsByProjectId` so the metric matches `TraceRepository`. |
| Filter registry | `packages/platform/db-clickhouse/src/registries/session-fields.ts:4` | Add `ttft`, `name` (root_span_name). |
| Sort columns | `packages/platform/db-clickhouse/src/repositories/session-repository.ts:163` | Add `ttft` to `SORT_COLUMNS`. |

The list intentionally does NOT touch trace-side files — every change here
is additive to sessions.

## Adjacent — read-path methods sessions doesn't have

Called out for completeness; not in this spec's implementation scope.
`SessionRepository` is a strict subset of `TraceRepository`:

| `TraceRepository` method | Session counterpart | Comment |
|---|---|---|
| `listByProjectId` | `listByProjectId` | Present. |
| `countByProjectId` | `countByProjectId` | Present; doesn't accept `searchQuery`. |
| `aggregateMetricsByProjectId` | `aggregateMetricsByProjectId` | Present; missing `tokensTotal` + `timeToFirstTokenNs` rollups (the trace version has both). |
| `histogramByProjectId` | **MISSING** | Sessions list page has no histogram. |
| `findByTraceId` (returns `TraceDetail`) | **MISSING** | No `findBySessionId`; session detail panel needs one. |
| `getDistribution` | **MISSING** | No percentile distribution for duration/cost/ttft on sessions. Blocks `gtePercentile` filters on sessions. |
| `countAnnotatedByProjectId` | **MISSING** | No equivalent. |
| `matchesFiltersByTraceId` | **MISSING** | Used for trace-filter materialization in scores; sessions analogue might or might not be needed. |
| `getCohortBaselineByTags` | **MISSING** | Cohort baselines are trace-specific (per-tag-combo); no session-level analogue planned. |
| `findLastTraceAt` | **MISSING** | Sessions has no equivalent; freshness sort will need one. |
| `distinctFilterValues` | `distinctFilterValues` | Present; covers `tags`, `models`, `providers`, `serviceNames`. |

These methods depend on the materialization columns in this spec being in
place first (every "MISSING" above wants `time_to_first_token_ns` or
`root_span_name` to be usable). They are the work item this spec unblocks.

## Decisions

- **`root_span_id` for sessions = first-trace-root.** The proposed shape
  (`argMinIfState(span_id, start_time, parent_span_id = '' OR parent_span_id = '0000000000000000')`)
  returns the earliest parent-less span — the root of the session's
  **first trace**. Stable (doesn't change as the session grows), cheap
  to compute, and matches "what was this conversation about" for the
  session card label. Alternatives considered and rejected: last
  trace's root (volatile — the label changes every new turn) and
  most-frequently-rooted name (complex materialization for marginal
  value). The session detail panel may override per-row if UX wants a
  different label in some context.

- **No separately exposed wall-clock duration column.** Sessions
  `duration_ns` is active execution time per "On `duration_ns`
  semantics". Wall-clock is recoverable at any read site as
  `reinterpretAsInt64(endTime) - reinterpretAsInt64(startTime)` from
  the same row — one subtraction, no need for an ALIAS or a stored
  column. If a UI surfaces both side-by-side often enough that the
  per-query arithmetic gets repetitive, callers add a local helper.

- **`models` / `providers` / `service_names` keep union semantics on
  sessions.** Both tables collect the union of values across child
  spans via `groupUniqArrayIf`. Union is right for the filter question
  users ask — "find sessions that used GPT-4" via `hasAny`. The
  "most-recent model" question is a different filter; if product
  demand surfaces, we add a separate `current_model` column (one
  extra `argMaxIf` aggregate) rather than redefining the existing
  semantic.

- **`retention_days` uses `max` across the session's spans.** Matches
  the trace-side aggregate. Edge case: if a project's retention
  changes mid-session (30-day → 7-day), `max` keeps the session under
  the longer retention until the cutoff, which over-retains relative
  to the project's *current* setting. The alternative — `min` — would
  under-retain relative to what the customer had been paying for at
  the start. `max` is the safer default: don't prematurely delete
  what the customer had been paying to keep. Document the edge case
  in the migration notes; revisit only if customers complain.
  (Mid-session retention changes are rare — sessions are typically
  minutes to hours, plan changes are weeks apart.)

### Resolved elsewhere

- **Session-detail `allMessages` rendering** is no longer needed —
  `./6-session-panel.md` §5 ("Conversation tab") renders one trace's
  conversation at a time using the existing `<Conversation>`
  primitive, not a merged stream. No session-level `allMessages`
  derivation is required.

- **Status filter (broken `overall_status`)** is resolved in
  `./4-filter-parity.md` "Status filter — concrete shape". A synthetic
  status derived from `error_count > 0` fixes both the trace-side bug
  and the session-side gap in one move.
