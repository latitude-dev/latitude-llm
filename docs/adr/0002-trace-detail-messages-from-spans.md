# ADR 0002: Trace-detail message fields are read from `spans`, not the `traces` MV

- **Status:** Accepted
- **Date:** 2026-04-27
- **Context:** Production OOMs on the ClickHouse server when `trace-end` and the trace-detail UI loaded a trace via `findByTraceId` / `listByTraceIds`.

## Context

The `traces` table is a `ReplicatedAggregatingMergeTree` populated by the `traces_mv` materialized view (see migrations `00002` / `00008`). For each ingested batch of spans, the MV writes a partial-state row to `traces` carrying:

- Lightweight `SimpleAggregateFunction` columns (`sum`, `min`, `max`) for counts / timings / token counters.
- Two `AggregateFunction(groupUniqArrayIf, ...)` columns for distinct models / providers / service names.
- **Four heavy** `AggregateFunction(argMin/MaxIf, String, DateTime64(9), UInt8)` columns:
  - `input_messages` (earliest span with non-empty input)
  - `last_input_messages` (latest span with output, take its input)
  - `output_messages` (latest span with output)
  - `system_instructions` (earliest span with non-empty system instructions)

Each of those four states stores the **full candidate value** (multi-MB JSON) inside the binary aggregate state. A long-running trace that's been ingested in many batches accumulates many partial-state rows, each carrying its own candidate.

`findByTraceId` / `listByTraceIds` finalised those columns at read time:

```sql
SELECT
  ...,
  argMinIfMerge(input_messages)        AS input_messages,
  argMaxIfMerge(last_input_messages)   AS last_input_messages,
  argMaxIfMerge(output_messages)       AS output_messages,
  argMinIfMerge(system_instructions)   AS system_instructions
FROM traces
WHERE organization_id = ? AND project_id = ? AND trace_id = ?
GROUP BY organization_id, project_id, trace_id
```

To merge `argMinIf` states for a String column, ClickHouse must deserialize **every** candidate in **every** unmerged partial row, compare timestamps, and pick the winner. Memory peaks at *N partial rows × 4 heavy columns × candidate value size*, which on long traces with multi-MB messages exceeded the 10.8 GiB server limit:

> `(total) memory limit exceeded ... While executing AggregatingTransform`

Hot path on every span ingest: the `trace-end` worker fires (debounced) per trace and calls `findByTraceId`, so the OOM affected steady-state operation, not just rare detail clicks.

## Decision

1. **Heavy message data is read from `spans`, not from `traces`.** The four message fields on the `TraceDetail` domain shape are now resolved by aggregating the equivalent expressions over the `spans` table — the MV's source of truth. On `spans` each row stores the value as a plain `String`, so the aggregate set is bounded by spans-per-trace (typically dozens) instead of by partial-state-rows × heavy aggregate states.

   The semantics are unchanged: the spans-side query mirrors the MV's `argMin/MaxIf` definitions exactly (see `traces_mv` in migration `00008`).

2. **Repository surface is split by need.** Two new methods serve callers that don't need messages, and don't pay any cost related to them:

   - `TraceRepository.findSummaryByTraceId(input) → Trace`
   - `TraceRepository.listSummariesByTraceIds(input) → readonly Trace[]`

   These are simple aggregations against `traces` using `LIST_SELECT` only. Use them for trace-end orchestration, listing summaries by id (issues, annotation-queue items, bulk imports, exports, etc.).

3. **`findByTraceId` / `listByTraceIds` continue to return `TraceDetail`** (unchanged for callers that genuinely consume the messages: trace-detail UI, dataset export, evaluations, annotation enrichment, flagger strategies). Internally they now run two queries in parallel: (a) the lightweight summary against `traces`, (b) the message aggregation against `spans`. Results are joined in application code.

4. **No schema migration.** The four heavy columns on `traces` are still populated by the MV. We just stop reading them. Dropping them is a follow-up the team can take whenever it's convenient, without coordinating with code changes.

## Consequences

- **No more OOM** on the trace-end firehose (summary lookup) or on detail reads (data is read from `spans` where each candidate is a plain String, not a binary aggregate state).
- **No domino refactor** of message-shaped consumers. The `TraceDetail` domain entity is unchanged.
- **`listByTraceIds` does two parallel CH queries instead of one.** Latency is comparable; memory profile is dramatically better.
- Callers that need only trace-level metadata MUST use `findSummaryByTraceId` / `listSummariesByTraceIds`. Reaching for `findByTraceId` "just to be safe" reintroduces the `spans` aggregation pass needlessly.
- **MV cost is now redundant for the four message columns** — they're written by the MV but never read. Cleanup migration is tracked separately.

## References

- [`packages/platform/db-clickhouse/src/repositories/trace-repository.ts`](../../packages/platform/db-clickhouse/src/repositories/trace-repository.ts) — `SPAN_MESSAGES_SELECT`, `findSummaryByTraceId`, `listSummariesByTraceIds`, refactored `findByTraceId` / `listByTraceIds`.
- [`packages/platform/db-clickhouse/clickhouse/migrations/clustered/00002_materialized_traces.sql`](../../packages/platform/db-clickhouse/clickhouse/migrations/clustered/00002_materialized_traces.sql) — `traces` table + MV definition.
- [`packages/platform/db-clickhouse/clickhouse/migrations/clustered/00008_simulation_id.sql`](../../packages/platform/db-clickhouse/clickhouse/migrations/clustered/00008_simulation_id.sql) — current `traces_mv` body.
- [`packages/domain/spans/src/use-cases/load-trace-for-trace-end.ts`](../../packages/domain/spans/src/use-cases/load-trace-for-trace-end.ts) — example of the lightweight call site.
