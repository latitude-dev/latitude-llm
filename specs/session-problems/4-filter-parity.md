# Filter parity between sessions and traces

## Goal

Sessions list, count, and metrics endpoints accept a `FilterSet`. Today the set
of fields they recognize is a strict subset of what the traces endpoints
recognize: `getTextFieldsForMode("sessions")` at
`apps/web/src/components/filters-builder/constants.ts:37` actively strips
`name` and `traceId`, and the underlying `SESSION_FIELD_REGISTRY`
(`packages/platform/db-clickhouse/src/registries/session-fields.ts:4`) is
missing trace-level columns the trace registry has — most visibly
`status`, `name`, `traceId`, and `ttft`.

This spec audits every filter exposed on traces, decides for each one whether
sessions need a counterpart and (where the trace value is per-trace but a
session contains many traces) which "any / all / first" semantic the session
counterpart adopts. It builds on the materialization parity proposed in
`./1-parity-traces-sessions.md` — wherever a session column lands as part of
that spec, this one wires it into the filter pipeline.

The trace-side `status` filter is currently broken (it references
`overall_status`, which was dropped in
`…/00005_drop_overall_status.sql` — confirmed by the schema dump at
`packages/platform/testkit/src/clickhouse/schema.sql:235-270` having no such
column). The fix is in scope here: define a synthetic `status` derived from
`error_count`, applied identically on both sides.

## Source of truth

Both filter pipelines flow through the same boundary:

| Layer | File |
|---|---|
| UI filter field catalog | `packages/domain/shared/src/trace-filter-fields.ts:12` |
| `FilterSet` shape & operator zod schema | `packages/domain/shared/src/filter.ts:32` |
| ClickHouse generic WHERE/HAVING builder | `packages/platform/db-clickhouse/src/filter-builder.ts:55` |
| Trace field → CH column registry | `packages/platform/db-clickhouse/src/registries/trace-fields.ts:7` |
| Session field → CH column registry | `packages/platform/db-clickhouse/src/registries/session-fields.ts:4` |
| Score-scoped filters (cross-cutting) | `packages/platform/db-clickhouse/src/score-filter-subquery.ts:11` |
| Trace filter clause assembly | `packages/platform/db-clickhouse/src/repositories/trace-repository.ts:553` (`buildTraceFilterClauses`) |
| Session filter clause assembly | `packages/platform/db-clickhouse/src/repositories/session-repository.ts:170` (`buildSessionFilterClauses`) |
| Trace listing read path | `packages/platform/db-clickhouse/src/repositories/trace-repository.ts:948` (`listByProjectId`) |
| Session listing read path | `packages/platform/db-clickhouse/src/repositories/session-repository.ts:206` (`listByProjectId`) |
| Filter sidebar (UI, both modes) | `apps/web/src/routes/_authenticated/projects/$projectSlug/-components/filters-sidebar.tsx:351` |
| `getTextFieldsForMode` (UI mode gate) | `apps/web/src/components/filters-builder/constants.ts:37` |
| Multi-select adapter (per mode) | `apps/web/src/components/filters-builder/multi-select-filter.tsx:42` |
| Percentile filter resolver (trace-only today) | `packages/platform/db-clickhouse/src/repositories/trace-repository.ts:700` (`resolvePercentileFilters`) |

The shared filter shape is the same. The operator set is the same
(`FILTER_OPERATORS` at `filter.ts:7`). The clause builder is the same
(`buildClickHouseWhere`). What differs is the per-table column registry and
the listing path's surrounding query — `traces` uses an inner per-trace
`GROUP BY trace_id`, `sessions` uses an inner per-session `GROUP BY
session_id`. Both apply user filters as `HAVING` clauses on the merged
aggregates the `LIST_SELECT` projects.

## Current trace filters

Pulled from `TRACE_FILTER_FIELDS`
(`packages/domain/shared/src/trace-filter-fields.ts:12`) and the trace-side
registry (`packages/platform/db-clickhouse/src/registries/trace-fields.ts:7`).

| Filter | Type | UI control | Operators it accepts (via op support) | Trace CH column | Trace MV provenance |
|---|---|---|---|---|---|
| `status` | `status` (enum) | enum chip | `in`, `notIn`, `eq`, `neq` via `mapStatusValue` | `overall_status` (**broken**, column dropped) | Was a derived span-level rollup; replaced by `error_count` signal. |
| `name` | `text` | contains-input | `contains`, `notContains`, `eq`, `neq` | `root_span_name` | `argMinIf(name, start_time, parent_span_id = '')` — name of the earliest parentless span in the trace. |
| `traceId` | `text` | contains-input | `contains`, `notContains`, `eq`, `neq`, `in`, `notIn` | `trace_id` | `GROUP BY` key. |
| `sessionId` | `text` | contains-input | same as traceId | `session_id` (alias from `argMaxIfMerge(session_id)` in `LIST_SELECT`) | `argMaxIfState(session_id, start_time, session_id != '')`. |
| `simulationId` | `text` | contains-input | same | `simulation_id` (`argMaxIfMerge`) | `argMaxIfState(simulation_id, start_time, simulation_id != '')`. |
| `userId` | `text` | contains-input | same | `user_id` (`argMaxIfMerge`) | `argMaxIfState(user_id, start_time, user_id != '')`. |
| `tags` | `multiSelect` | combobox + `hasAny` | `in`, `notIn` | `tags` (array) | `groupUniqArrayArray(tags)` — union across spans. |
| `models` | `multiSelect` | combobox + `hasAny` | `in`, `notIn` | `models` (array, `groupUniqArrayIfMerge`) | Union of distinct models. |
| `providers` | `multiSelect` | combobox + `hasAny` | `in`, `notIn` | `providers` (array, `groupUniqArrayIfMerge`) | Union of distinct providers. |
| `serviceNames` | `multiSelect` | combobox + `hasAny` | `in`, `notIn` | `service_names` (array, `groupUniqArrayIfMerge`) | Union of distinct service names. |
| `duration` | `numberRange` (percentile) | min/max + percentile tabs | `gt/gte/lt/lte`, `gtePercentile` | `duration_ns` (`Int64 ALIAS`) | `max(end_time) - min(start_time)` — wall clock. |
| `ttft` | `numberRange` (percentile) | min/max + percentile tabs | same + `gtePercentile` | `time_to_first_token_ns` (`Int64 ALIAS`) | Min first-token instant across spans, minus min start_time. |
| `cost` | `numberRange` (percentile) | same | same + `gtePercentile` | `cost_total_microcents` | `sum(cost_total_microcents)`. |
| `spanCount` | `numberRange` | min/max | `gt/gte/lt/lte` | `span_count` | `count()` across spans. |
| `errorCount` | `numberRange` | min/max | same | `error_count` | `countIf(status_code = 2)`. |
| `tokensInput` | `numberRange` | min/max | same | `tokens_input` | `sum(tokens_input)`. |
| `tokensOutput` | `numberRange` | min/max | same | `tokens_output` | `sum(tokens_output)`. |
| `startTime` (internal) | injected as range | not a UI chip — used by histogram window merge in `helpers.ts:115` | `gte`, `lte` | `start_time` (the `min(min_start_time)` alias from `LIST_SELECT`) | `min(start_time)`. |
| `metadata.<path>` | `text`-like | metadata sidebar | `eq`/`neq`/`in`/`notIn`/`contains`/`notContains` via `buildMetadataClause` | `metadata[<key>]` via `Map(String, String)` | `maxMap(metadata)`. Cross-cutting (filter-builder.ts:69), works on both tables for free. |
| `score.passed` | (boolean, cross-cutting) | not a typed UI field — flows via `score.*` keys | scalar ops | `passed` column on `scores`, joined via `buildScoreRollupSubquery` | Per-score evaluation; see `SCORE_FIELD_REGISTRY` at `packages/platform/db-clickhouse/src/registries/score-fields.ts:11`. |
| `score.errored`, `score.value`, `score.source`, `score.sourceId`, `score.issueId`, `score.simulationId` | (cross-cutting) | not first-class UI fields | scalar ops | see `SCORE_FIELD_REGISTRY` | Filters the score sidecar table; subquery joins on `trace_id` / `session_id`. |

Notes:

- The `status` row is **broken on traces today**. `mapStatusValue`
  (`packages/platform/db-clickhouse/src/registries/helpers.ts:21`) still
  maps `"ok"/"error"/"unset"` to ints, and the registry still names
  `overall_status`, but no such column exists post-`…/00005`. A query
  referencing this filter fails at execution time. The fix lives in this
  spec rather than in 1-parity-traces-sessions.md because it's a filter
  surface, not a materialization gap.
- `metadata.<path>` and `score.*` already work on both tables — they're
  cross-cutting in `buildClickHouseWhere` / `buildScoreRollupSubquery`. No
  per-table registry entry needed.

## Current session filters

Pulled from `SESSION_FIELD_REGISTRY`
(`packages/platform/db-clickhouse/src/registries/session-fields.ts:4`).

| Filter | Type | UI control | CH column | Notes |
|---|---|---|---|---|
| `sessionId` | `text` | contains-input | `session_id` (`GROUP BY` key) | Direct. |
| `simulationId` | `text` | contains-input | `simulation_id` (`argMaxIfMerge`) | Same shape as traces. |
| `userId` | `text` | contains-input | `user_id` (`argMaxIfMerge`) | Same shape as traces. |
| `tags` | `multiSelect` | combobox + `hasAny` | `tags` (array, `groupUniqArrayArray`) | Union across the session's spans. |
| `models` | `multiSelect` | combobox + `hasAny` | `models` (array, `groupUniqArrayIfMerge`) | Union across the session's spans. |
| `providers` | `multiSelect` | combobox + `hasAny` | `providers` (array, `groupUniqArrayIfMerge`) | Union across the session's spans. |
| `serviceNames` | `multiSelect` | combobox + `hasAny` | `service_names` (array, `groupUniqArrayIfMerge`) | Union across the session's spans. |
| `duration` | `numberRange` | min/max | `duration_ns` (real column after `./1-parity-traces-sessions.md` lands; ALIAS today) | **Active execution time** — sum of per-trace root-span durations, NOT wall-clock. See "On `duration_ns` semantics" in `./1-parity-traces-sessions.md`. No percentile support today (no `getDistribution` analog on sessions). |
| `cost` | `numberRange` | min/max | `cost_total_microcents` | No percentile support today. |
| `spanCount` | `numberRange` | min/max | `span_count` | Sum across spans. |
| `errorCount` | `numberRange` | min/max | `error_count` | Sum across spans. |
| `traceCount` | `numberRange` | min/max | `trace_count` | Session-specific — no trace counterpart. |
| `tokensInput`, `tokensOutput` | `numberRange` | min/max | `tokens_input`, `tokens_output` | Direct. |
| `startTime` (internal) | range | injected by histogram merge | `start_time` alias from `min(min_start_time)` | Same shape as traces. |
| `metadata.<path>` | (cross-cutting) | metadata sidebar | `metadata[<key>]` | Works for free via `buildClickHouseWhere`. |
| `score.passed` etc. | (cross-cutting) | n/a — programmatic | scores subquery | Works for free via `buildScoreRollupSubquery("session_id", …)`. |

Sessions accept the same `FilterSet` shape and the same operator set; the UI
just doesn't surface a chip for fields the registry doesn't know about. An
attacker (or buggy client) that sends `{ traceId: [...] }` to
`listSessionsByProject` today gets the field silently dropped by
`buildClickHouseWhere` (registry miss path, `filter-builder.ts:91`).

## Gap table

Each row picks an "any / all / first" semantic for the session counterpart.
The choice is forced by what the session MV can express **without
re-grouping by trace_id at MV time**: the `sessions_mv` groups by
`session_id`, so columns that fold spans (`sum`, `count`, `max`, `min`,
`groupUniqArrayIfState`, `argMaxIfState`, `argMinIfState`) naturally collapse
to a session value. Per-trace-then-rolled-up semantics need a read-path CTE
joining `sessions.trace_ids` against `traces.<column>`.

| Trace filter | Session today | Status | Proposed semantic (one of any / all / first / aggregate) | Backing session column | Index implications |
|---|---|---|---|---|---|
| `status` | MISSING | **MISSING (and broken on traces)** | **Aggregate**. Synthetic across both tables. Map `status = "error"` → `error_count > 0`, `status = "ok"` → `error_count = 0 AND span_count > 0`, `status = "unset"` → `span_count = 0` (effectively unreachable on sessions since `sessions_mv` filters `session_id != ''`; reachable on traces if all spans had `status_code = 0`). Documented in "Status filter" below. | `error_count` and `span_count` — already on both tables. | None. Both columns already in `LIST_SELECT` aliases; `error_count` is a sum, HAVING-side. |
| `name` | MISSING | **MISSING — adds when materialization parity lands** | **First-trace**. Session's `root_span_name` is `argMinIfState(name, start_time, parent_span_id = '')` — the root span of the **first** trace, per `./1-parity-traces-sessions.md`. Filter behaves as "first trace's name matches X". | `root_span_name` (added by parity migration `00016_session_parity.sql`). | None at filter time — `root_span_name` is finalized in `LIST_SELECT` via `argMinIfMerge`, then HAVING uses the alias. No skip index needed; the cardinality of distinct root-span-names per project is low. |
| `traceId` | MISSING | **MISSING — semantic discussed below** | **Any-trace**. Session contains the queried `trace_id` if it appears anywhere in `trace_ids`. SQL: `has(trace_ids, {traceId:FixedString(32)})` for `eq`, `hasAny(trace_ids, ...)` for `in`. | `trace_ids` (existing — `AggregateFunction(groupUniqArray, FixedString(32))`, finalized via `groupUniqArrayMerge` in `LIST_SELECT`). | Not adding an index. `trace_ids` is already pulled in `LIST_SELECT`; the HAVING-side `has(...)` runs after the per-session aggregation. The reads are bounded by `(organization_id, project_id)` primary-key range, so we accept the linear scan in the aggregate-then-filter shape we use for everything else. See "Why no skip index for `trace_ids`" below. |
| `sessionId` | PRESENT | OK | Identity — `GROUP BY` key. | `session_id`. | n/a. |
| `simulationId` | PRESENT | OK | Last-non-empty (same `argMaxIfState` shape as traces, where the trace took the latest one). | `simulation_id`. | n/a — already a session column. |
| `userId` | PRESENT | OK | Last-non-empty. Same `argMaxIfState` shape as traces. | `user_id`. | n/a. |
| `tags` | PRESENT | OK | **Any** (current). Session's `tags` is the union across spans; `hasAny(tags, X)` returns true if any span has any of `X`. | `tags`. | n/a — existing. |
| `models` | PRESENT | OK | **Any**. Same as tags. | `models`. | n/a. |
| `providers` | PRESENT | OK | **Any**. | `providers`. | n/a. |
| `serviceNames` | PRESENT | OK | **Any**. | `service_names`. | n/a. |
| `duration` | PRESENT | **SEMANTIC CHANGE** | **Aggregate** (active execution time — sum of per-trace root-span durations). Read-side numeric range works on `sum(duration_ns)` after the column becomes a real `SimpleAggregateFunction` per `./1-parity-traces-sessions.md`. Old wall-clock behavior is replaced. | `duration_ns` (real column after parity spec; ALIAS today). | n/a. |
| `ttft` | MISSING | **MISSING — adds when materialization parity lands** | **Aggregate** (session-opening TTFT). Per `./1-parity-traces-sessions.md`: `min(time_of_first_token) − min(min_start_time)` — the gap from session start to the earliest first token across the session's traces. Same shape as the trace TTFT filter. | `time_to_first_token_ns` (ALIAS, added by parity migration). | n/a. |
| `cost` | PRESENT | OK | **Aggregate** (sum). | `cost_total_microcents`. | n/a. |
| `spanCount` | PRESENT | OK | **Aggregate** (sum across all spans in all the session's traces). | `span_count`. | n/a. |
| `errorCount` | PRESENT | OK | **Aggregate** (sum). Note: a session with three traces, one erroring with 2 error spans, exposes `errorCount = 2`. | `error_count`. | n/a. |
| `tokensInput` | PRESENT | OK | **Aggregate** (sum). | `tokens_input`. | n/a. |
| `tokensOutput` | PRESENT | OK | **Aggregate** (sum). | `tokens_output`. | n/a. |
| `startTime` (internal) | PRESENT | OK | **Aggregate** (`min(min_start_time)` — earliest activity). Same semantic as `traces.startTime`. | alias from `min(min_start_time)`. | Both tables carry an `idx_start_time` `minmax` skip index on `min_start_time` (`schema.sql:86` for sessions, `:270` for traces) so the range pruning works identically. |
| `metadata.<path>` | (cross-cutting, present) | OK | **Aggregate (per-key max)** — `maxMap(metadata)` is the union with per-key max-wins on conflict. Filter compares `metadata[<key>]` against the value. | `metadata` (Map). | n/a. |
| `score.*` | (cross-cutting, present) | OK | **Any-score**. `buildScoreRollupSubquery("session_id", …)` returns the set of `session_id`s that have at least one matching score row. `IN (...)` semantics → any score on any of the session's traces matching the predicate keeps the session in. | `scores.session_id`. | n/a — already exists. |

### Trace filters intentionally not mirrored

None. Every trace filter has a session counterpart in the table above. The
two judgment calls worth flagging:

- `traceId` could have been "INTENTIONALLY SKIPPED" on the grounds that the
  user can already pivot from a trace to its session via the session column
  in the trace list. We mirror it anyway because workflows like "find the
  session that contained this specific trace id" come up in incident
  response. Cost is low (one column already projected, one `has()`).
- `name` could have been "INTENTIONALLY SKIPPED" on the grounds that a
  session contains traces with multiple names. We mirror it as a
  first-trace-name filter because (a) the UI session card already labels
  the session by the first trace's root span name in
  `./1-parity-traces-sessions.md`, and (b) `argMinIf` on `parent_span_id = ''`
  costs the same one MV column we already added for the panel header.

### Session-specific filters with no trace counterpart

- `traceCount` (`packages/platform/db-clickhouse/src/registries/session-fields.ts:16`)
  — a session can have multiple traces. A trace has one trace_id by
  definition. Stays session-only.

## Cross-cutting decisions — defaults by filter type

Future filters will land in one of these categories. To avoid re-deciding
"any / all / first / aggregate" per filter, this table records the default
each type adopts. Deviations require justification in the per-filter row.

| Filter type | Default session semantic | Justification | Existing examples |
|---|---|---|---|
| **`numberRange` over a sum-able quantity** (`cost`, `tokens*`, `spanCount`, `errorCount`) | **Aggregate (sum across all spans in all the session's traces)** | The MV already aggregates these as `sum()`. The session row's value *is* the aggregate. The user mental model — "sessions where total cost > $X" — matches the sum. No alternative is expressible at MV time without re-grouping. | `cost`, `tokens*`, `spanCount`, `errorCount`. |
| **`numberRange` over an aggregate or min-instant field** (`duration`, `ttft`, `startTime`) | **Aggregate (sum-of-trace-durations or min-instant per field)** | `duration` is the **sum of per-trace active execution times** (see `./1-parity-traces-sessions.md`, "On `duration_ns` semantics") — it answers "how busy was this session". `ttft` is the earliest first-token-minus-start across the session's traces. `startTime` is `min(start_time)`. All three are existing aggregate definitions; the numeric range works against them as-is. | `duration`, `ttft`, `startTime`. |
| **`multiSelect` over a span-level dimension** (`tags`, `models`, `providers`, `serviceNames`) | **Any (`hasAny`)** | The MV stores the **union** of values across spans (`groupUniqArrayIf*`), and `hasAny` over the union answers "did any span in this session have any of these values". "All" would require `hasAll` and a flipped mental model the UI doesn't communicate; "first" would require a separate `argMinIf*` column per dimension. Default = any. | All current multiSelect session filters use `hasAny` via `buildClause` at `filter-builder.ts:115`. |
| **`text` over a per-trace string** (`name`) | **First-trace value** | The session row carries one canonical "primary trace name" — the root span of the earliest trace. That value drives the session card label, so the filter applies to the same thing the user sees on the card. "Any-trace name contains" would need a `groupUniqArrayIf` column on names; we don't add one without a use case. | `name` (after parity). |
| **`text` over an identifier-set** (`traceId`) | **Any (the set contains)** | A session's set of trace ids is its identity for cross-referencing. "All trace ids contain X" is meaningless; "first trace id contains X" is only useful if the user knows trace ordering, which they don't from the URL bar. Any-trace-id-matches is the natural identity check. | `traceId` (after this spec). |
| **`text` over a last-known scalar** (`userId`, `simulationId`, `sessionId`) | **Last-non-empty (the existing `argMaxIfState`)** | Same shape on both tables. Users associate a session with a user; the latest non-empty `user_id` reads as "who this session ended up belonging to". | `userId`, `simulationId`. |
| **`status`** (synthetic enum) | **Aggregate from `error_count` / `span_count`** | A session is "error" if any of its spans errored. Mirrors the trace-side fix. | New, see below. |
| **`gtePercentile`** | **Project-scoped percentile of the session distribution, with the same `ignoreZeros` rule as traces for TTFT** | Same shape as the existing trace path. Read-side resolver lives in the session repo, structurally identical to `resolvePercentileFilters` at `trace-repository.ts:700`. | Adds with this spec. |
| **`score.*`** | **Any-score (subquery returns matching `session_id` set)** | Already implemented; the existing `buildScoreRollupSubquery("session_id", …)` is exactly "any score on this session matches". | Existing. |

The pattern that falls out: **default to "any" for span-level dimensions,
"first" for trace-level string identifiers exposed on the card, "aggregate"
for everything numeric**. "All" doesn't appear as a default for anything,
which matches user intent in every observed workflow.

## Default "has LLM activity" chip (orphan-fragment hider)

The coalesce convention in `./1-parity-traces-sessions.md` means every trace
shows up as a session. For customers using the Latitude SDK with proper
`gen_ai.conversation.id` propagation, this just works — every conversational
trace forms a normal session, every non-conversational trace forms a 1-trace
"orphan" session.

But for OTel-direct customers whose auto-instrumentation only tags
LLM-call spans (Vercel AI / LangChain / Anthropic SDK inside an Express /
Next.js trace), the same trace produces **two session rows**: the real
session built from the LLM spans, plus an "orphan fragment" built from the
surrounding framework spans. Both reference the same `trace_id`, but the
orphan fragment has no LLM data — `tokens_total = 0`, `cost_total_microcents
= 0`, `models = []`, `trace_count = 1`. See `./0-problems.md` for the contract
discussion and `./1-parity-traces-sessions.md` for the visual signature table.

To keep the sessions list clean for these customers, the filter bar applies
a **default chip** on the sessions list:

```
has LLM activity   (tokens_total > 0 OR length(models) > 0)
```

This is a normal filter chip — the user can clear it explicitly to see
orphan fragments alongside real sessions (useful for debugging
instrumentation), or invert it to find traces that *only* have framework
overhead and no LLM call.

Implementation:

- **Registry entry**: `hasLlmActivity` in `SESSION_FIELD_REGISTRY` maps to
  the synthetic expression `(tokens_total > 0 OR length(models) > 0)`.
  Same pattern as the synthetic `status` filter described below.
- **Default-on at the UI layer**: the sessions list page initializes its
  filter set with `hasLlmActivity = true` if no filter set was loaded from
  URL / saved view. The chip renders as removable like any other; it just
  starts pre-applied. Implementation lives in the same place the default
  time-range filter is set today.
- **Pure orphan traces** (no SDK session_id on any span) typically have
  `models` set on the LLM span — they're 1-trace sessions but still
  conversational. They satisfy `hasLlmActivity = true`. Only orphan
  fragments from mixed-binding traces fail it.

This is the user-visible mitigation for the SDK-contract violation case
documented in `./0-problems.md`. Other filter chips (model, provider,
tag, etc.) compose with the default chip normally.

## Status filter — concrete shape

The trace registry today references `overall_status`, a column that no
longer exists. The fix is symmetric:

```ts
// New helper, replaces mapStatusValue. Lives next to it in helpers.ts.
function buildStatusHaving(conditions: readonly FilterCondition[]): {
  clause: string
  params: Record<string, unknown>
}
```

Synthesis rules, applied identically on both tables:

| User value | Session/Trace HAVING fragment |
|---|---|
| `"error"` | `error_count > 0` |
| `"ok"` | `error_count = 0 AND span_count > 0` |
| `"unset"` | `span_count = 0` (in practice unreachable on sessions since the MV requires `session_id != ''` and a span exists; falsy on traces only for trace rows whose every span was `status_code = 0`) |

Because the synthesized HAVING fragment doesn't fit the
`{column} {op} {param}` shape that `buildClause` produces, `status` becomes
a special-cased registry entry: the registry carries a `buildClause` hook
rather than a `column / chType`. Concretely:

```ts
// In ChFieldMapping (filter-builder.ts:7), widen to support synthesized clauses:
export type ChFieldMapping =
  | ScalarFieldMapping                    // existing { column, chType, ... }
  | {
      readonly kind: "synthetic"
      readonly buildClause: (cond: FilterCondition, paramName: string) =>
        { clause: string; param: unknown }
    }
```

`buildClickHouseWhere` then branches on `mapping.kind === "synthetic"` and
delegates the clause and param generation. Both registries register
`status` against the same helper:

```ts
// trace-fields.ts:8 — REPLACE the broken entry:
status: { kind: "synthetic", buildClause: buildStatusClause },

// session-fields.ts — ADD:
status: { kind: "synthetic", buildClause: buildStatusClause },
```

Where `buildStatusClause` reads the operator off the condition and
translates `eq/neq/in/notIn` over `{"ok","error","unset"}` into a disjunction
of the fragments above (e.g. `in: ["error","ok"]` →
`(error_count > 0 OR (error_count = 0 AND span_count > 0))`).

This collapses two fixes into one: the trace `status` filter starts working
again, and sessions gain a parity status filter, both with one helper.

## API surface changes

### `SESSION_FIELD_REGISTRY` (`registries/session-fields.ts:4`)

Add (most depend on `./1-parity-traces-sessions.md` having landed first):

```ts
status: { kind: "synthetic", buildClause: buildStatusClause },
name:   { column: "root_span_name",        chType: "String" },
traceId:{ column: "trace_ids",             chType: "String", isArray: true },
ttft:   { column: "time_to_first_token_ns", chType: "Int64" },
```

Notes:

- `traceId` is `isArray: true` so `in` / `notIn` become `hasAny` / `NOT
  hasAny` against `trace_ids` — that's exactly the "session contains this
  trace id" semantic. For `eq` on a single value, the SQL is
  `trace_ids = {value:String}` per the generic `buildClause` path, which
  would mismatch (compares a `FixedString(32)` array to a scalar). Two
  options:
  - **Recommended:** extend `ChFieldMapping` with an `arrayContains:
    boolean` flag that maps `eq` on array fields to `has(<column>,
    {param:<chType>})` instead of `=`. This adds the same convenience for
    `tags = "foo"` (today the user has to write `tags in ["foo"]`), which
    is a small ergonomic win.
  - Alternative: leave `eq` unsupported on `traceId` and document that the
    UI emits `in: [value]` for single-value selection. The UI already does
    that for `tags`; pushing `traceId` through the same path costs nothing.
- `name` filter accepts the same operators trace `name` accepts
  (`contains`, `notContains`, `eq`, `neq`) — `buildClause` already routes
  `contains` to `ILIKE`. No special-casing needed.

### `SessionRepository` port (`packages/domain/spans/src/ports/session-repository.ts`)

`SessionRepositoryShape` widens with one new method needed for
`gtePercentile` parity:

```ts
getDistribution(input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly field: PercentileSessionFilterField
}): Effect.Effect<TraceDistribution, RepositoryError, ChSqlClient>
```

`PercentileSessionFilterField` lives in `@domain/shared` next to
`PercentileTraceFilterField`. Initial set:

```ts
export const PERCENTILE_SESSION_FILTER_FIELDS = ["duration", "ttft", "cost"] as const
```

— same set as traces. The trace and session distributions are independent
(a session-cost distribution is not the same as a trace-cost distribution),
so the resolver must compute against the session aggregate.

### `SessionRepositoryLive` implementation (`session-repository.ts`)

Three changes:

1. **Resolve `gtePercentile` filters before WHERE/HAVING assembly.**
   Mirror `resolvePercentileFilters` from `trace-repository.ts:700`. Same
   helper shape; reads from the per-session `LIST_SELECT` subquery. Wire
   it into `listByProjectId`, `countByProjectId`, and
   `aggregateMetricsByProjectId` exactly where `buildSessionFilterClauses`
   is called today (lines 214, 278, 313).
2. **Adopt the synthetic `status` clause.** No change beyond registering
   the entry — `buildClickHouseWhere` handles the dispatch.
3. **Project `trace_ids` already happens in `LIST_SELECT` (line 26).** The
   HAVING-side `has(trace_ids, …)` uses the merged alias. No SQL changes
   beyond the registry.

### `listSessionsByProject` server fn (`apps/web/src/domains/sessions/sessions.functions.ts:54`)

The input schema already uses `filterSetSchema` — it accepts any field.
What changes is which fields the validator allows downstream. We don't
need a per-field allowlist at the server-fn layer: `buildClickHouseWhere`
silently drops unknown fields, and the registry update is the single
source of truth. No code change here.

### `TraceRepository` port

Existing trace-side `getDistribution`
(`packages/domain/spans/src/ports/trace-repository.ts:124`) covers the
trace surface unchanged.

## UI surface changes

The filter sidebar is field-driven from a small set of catalogs. Adding
fields ripples through automatically.

### `getTextFieldsForMode` (`apps/web/src/components/filters-builder/constants.ts:37`)

Drop the exclusion. Today:

```ts
export function getTextFieldsForMode(mode: FilterMode) {
  if (mode === "sessions") {
    return TEXT_FIELDS.filter((f) => f.field !== "name" && f.field !== "traceId")
  }
  return TEXT_FIELDS
}
```

After this spec — both `name` and `traceId` work on sessions:

```ts
export function getTextFieldsForMode(_mode: FilterMode) {
  return TEXT_FIELDS
}
```

(The function is kept rather than inlined so future per-mode divergences
have a place to live.)

### `NUMBER_RANGE_FIELDS` / percentile UI

Today the percentile tab in `NumberFilterSection`
(`filters-sidebar.tsx:267`) only renders when the field is in
`PERCENTILE_TRACE_FILTER_FIELDS`. For sessions, the same set
(`duration`, `ttft`, `cost`) gets percentile support once
`SessionRepository.getDistribution` is implemented. The
`PercentileFilter` component
(`apps/web/src/components/filters-builder/percentile-filter.tsx`) needs to
know which mode it's in so it can call the session distribution endpoint
instead of the trace one — a `mode: FilterMode` prop threaded the same way
as in `MultiSelectFilter`.

### Status filter UI

The trace-side status filter exists as a control today; once the
synthetic clause replaces the broken column reference, the same control
applies to sessions. No new component — `getTextFieldsForMode` and the
existing status filter UI are independent. Confirm the status field reads
`type: "status"` from `TRACE_FILTER_FIELDS:13` and is rendered by whatever
already renders it on traces (the trace filter bar — not in
`filters-sidebar.tsx` but the chip-level UI; the catalog drives both).

### `MultiSelectFilter` adapter — no change

`MultiSelectFilter` already dispatches per mode via `useDistinctValues`
(`multi-select-filter.tsx:33`). Tags, models, providers, serviceNames all
work today; this spec doesn't change them.

### Saved searches

Saved-search filters route through `filterSetSchema` and the same
`buildClickHouseWhere` path. Sessions saved searches with new fields work
automatically.

## Why no skip index for `trace_ids`

`trace_ids` is an `AggregateFunction(groupUniqArray, FixedString(32))`. A
bloom_filter index on it would have to apply on the merged value, not the
per-block partial states `AggregatingMergeTree` actually stores — so it
can't be a per-row skip index over the raw column without changes to how
the MV emits the column.

Two reasonable alternatives:

1. **Drop it.** The `traceId` filter on sessions is rare (incident
   response), the query always scans within a single
   `(organization_id, project_id)`, and `idx_start_time` already prunes by
   month. Acceptable for v1.
2. **Add `idx_trace_ids ... TYPE bloom_filter(0.01) GRANULARITY 1` on a
   materialized `groupUniqArrayMerge(trace_ids)` column** (i.e. a finalized
   column rather than an aggregate state). That requires either a second
   table or a `final` projection; both add complexity disproportionate to
   the use case. **Don't ship this in v1.**

Recommendation: ship option 1. Revisit if `traceId`-on-sessions becomes a
hot query.

## Files that change

| Layer | File | Change |
|---|---|---|
| Filter helper | `packages/platform/db-clickhouse/src/registries/helpers.ts` | Add `buildStatusClause`; remove `mapStatusValue` (no longer wired to a column). |
| Filter builder | `packages/platform/db-clickhouse/src/filter-builder.ts:7` | Widen `ChFieldMapping` to support `{ kind: "synthetic", buildClause }`; route in `buildClause` and `buildClickHouseWhere`. Optionally add `arrayContains: boolean` to map scalar `eq` against array fields to `has(…)`. |
| Trace registry | `packages/platform/db-clickhouse/src/registries/trace-fields.ts:8` | Replace broken `status` entry with synthetic clause. |
| Session registry | `packages/platform/db-clickhouse/src/registries/session-fields.ts:4` | Add `status`, `name`, `traceId`, `ttft`. |
| Domain shared | `packages/domain/shared/src/trace-filter-fields.ts` | Add `PERCENTILE_SESSION_FILTER_FIELDS`, `PercentileSessionFilterField`, `isPercentileSessionFilterField` (mirror of the trace versions). Keep `TRACE_FILTER_FIELDS` as the single source for UI catalog. |
| Session port | `packages/domain/spans/src/ports/session-repository.ts` | Add `getDistribution` method to `SessionRepositoryShape`. |
| Session repo | `packages/platform/db-clickhouse/src/repositories/session-repository.ts:170` | Mirror `resolvePercentileFilters` from `trace-repository.ts:700`; implement `getDistribution`; wire percentile resolution into `listByProjectId` / `countByProjectId` / `aggregateMetricsByProjectId`. |
| UI catalog | `apps/web/src/components/filters-builder/constants.ts:37` | Drop the `name` / `traceId` exclusion. |
| UI percentile | `apps/web/src/components/filters-builder/percentile-filter.tsx` | Accept `mode: FilterMode`; dispatch to session distribution endpoint when `mode === "sessions"`. |
| UI filter sidebar | `apps/web/src/routes/_authenticated/projects/$projectSlug/-components/filters-sidebar.tsx:267` | Pass `mode` through to `NumberFilterSection` / `PercentileFilter`. |
| Sessions domain function | `apps/web/src/domains/sessions/sessions.functions.ts` | Add `getSessionDistribution` server fn paralleling the trace one. |

## Migration / rollout

All changes are additive on the read path. No CH schema change beyond what
`./1-parity-traces-sessions.md` already proposes. Two ordering constraints:

1. **`./1-parity-traces-sessions.md` must land first.** Until `root_span_name`
   and `time_to_first_token_ns` exist on `sessions`, the `name` and `ttft`
   filters can't be registered (`buildClickHouseWhere` would emit a
   reference to a non-existent column).
2. **The synthetic `status` filter can land independently.** It only
   depends on existing columns (`error_count`, `span_count`). It fixes a
   pre-existing bug on traces, so shipping it ahead of session parity is
   safe and useful.

Recommended order:

1. Ship `status` synthetic clause (fixes traces, no session migration
   needed).
2. Land `./1-parity-traces-sessions.md` migration (`00016_session_parity`).
3. Ship the rest of this spec (`name`, `traceId`, `ttft`, percentile
   resolver on sessions).

UI changes ride with whichever phase introduces them — drop the exclusion
in `getTextFieldsForMode` together with phase 3 so we never expose a chip
the backend doesn't understand.

## Out of scope (lands in adjacent specs)

- **Session-level search** (the `searchQuery` argument). Trace's
  `listByProjectId` takes `searchQuery`; sessions doesn't yet. That's
  `./2-session-level-search.md`, not this spec.
- **Search highlighting parity** — see `./5-search-highlights.md`.
- **Freshness-weighted ordering** — see `./7-freshness-weighted-sort.md`.
  Note that `gtePercentile` on sessions does not contradict relevance
  ordering; the percentile filter is applied before sort.

## Open questions

- **Default semantic for `name` — first-trace vs any-trace?** Spec picks
  first-trace because the session card label is the first-trace name. If
  product later wants "session whose any trace was called X", the right
  shape is a second column (e.g. `trace_names AggregateFunction(groupUniqArrayIf, String, UInt8)`)
  added when needed, and a second filter `traceName` distinct from
  `name`. Don't pre-build it.
- **`traceId` `eq` ergonomics.** Two options listed above. Recommendation
  is "add `arrayContains` flag in `ChFieldMapping`", since it benefits
  `tags` too. Confirm with frontend whether the multi-select UI ever
  emits `eq` against `tags` today — if not, we can defer the flag and
  document that single-trace-id selection sends `in: [value]`.
- **Should `metadata.<path>` reads be normalized to first-trace or
  union semantics?** The session MV uses `maxMap(metadata)` — per-key
  max-wins. That means if two traces in a session set
  `metadata.env = "staging"` and `metadata.env = "production"`, the
  session row reports the lexicographic max (`"staging"`). Probably
  acceptable, but worth noting before customers report "I filtered
  sessions by `env = production` and lost one I expected".
- **Should `score.*` filters get an "all-traces" mode?** Today the
  subquery returns sessions with **any** matching score. A common product
  question is "all of this session's traces passed" — that requires a
  different shape (count of unique trace_ids in scores ≥ session's
  `trace_count`, or per-trace evaluation). Not in this spec; logged for
  future.
- **Status filter — `"unset"` on sessions.** With the
  `sessions_mv WHERE session_id != ''` filter, every session row has at
  least one span. The "unset" status on sessions is therefore effectively
  unreachable. Decide whether to (a) hide the `unset` option from the
  session-mode status UI, or (b) keep it and let it match zero rows. (b)
  is cheaper and consistent with the trace-side behavior; recommendation
  is (b).
- **TTFT `ignoreZeros` on sessions.** The percentile resolver on traces
  ignores 0-valued rows for `ttft` (sentinel for "no LLM"). The session
  version should mirror that. Confirm `time_to_first_token_ns = 0` is the
  same sentinel on sessions — by construction from
  `./1-parity-traces-sessions.md`'s `time_of_first_token` sentinel, yes.
