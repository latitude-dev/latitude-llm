# Memory Insights

> Builds an aggregated-insight layer on top of [Memory Observability](./memory-observability.md). That spec ships the *forensic* surfaces (stores → record tree → record body, per-change diff, session/trace summary); this one adds the *analytics* that answer "what's interesting?" without browsing store by store, mirroring the Tools and Users pages. Read the observability spec's [Data model](./memory-observability.md#data-model) for the ledger — this spec does not restate it.
>
> **Linear**: follow-up to LAT-729.

## Contents

1. [Purpose](#purpose)
2. [Model and vocabulary](#model-and-vocabulary)
3. [Calculation rules](#calculation-rules)
4. [Surfaces](#surfaces)
5. [Data & code layout](#data--code-layout)
6. [Decisions](#decisions)
7. [Tasks](#tasks)

---

## Purpose

Memory observability lets users *see* their agent's memory and how it evolves, but that is its only value today — finding anything interesting means opening every store and record by hand. Every other observe surface (Tools, Users) leads with analytics: stat tiles, a time-series chart, an enriched table. This adds the same to Memory: which memory is useful, wasteful, or unstable — surfaced, not hunted.

## Model and vocabulary

Four orthogonal axes keep the metrics from muddling (the key design cut):

- **Hot / cold** describes a **record** — how much it's retrieved.
- **Consumed / superseded-unread / pending** describes a **version** — whether it was read before being replaced.
- **No-op / revert** describes a single **write**.
- **Churn** describes **aggregate** writing behavior.

The headline metric is **write yield**: of the versions the agent completed (wrote then later superseded), how many were read at least once before being replaced. It is memory's equivalent of an error rate — a single number that says whether the writing is worth anything — and it excludes the current pending version, which can't be judged yet.

## Calculation rules

All reads target the ledger alone (`memory_events` + `memory_current` + `memory_blobs`); the `spans` table is not involved (see [D-insights-1](#decisions)).

- **Version chain** per `(store_id, record_id)`: deduped mutation events ordered by `end_time`. A version is *completed* once a later mutation supersedes it, else *pending*.
- **Consumed**: ≥1 read of the record in `[version end, successor end)`. Attribution is time-based; the returned-body hash now stamped on read events (see below) enables an exact upgrade later.
- **Write yield** = consumed ÷ completed; pending excluded; `-` when nothing has completed.
- **No-op**: a version whose non-empty `content_hash` equals its predecessor's. Excluded from content-write counts and churn token sums.
- **Revert**: a non-empty hash equal to an older, non-adjacent version's.
- **Net token growth** (per store, per window): Σ over records of `(live tokens at window end) − (live tokens at window start)`, a `remove` counting 0.
- **Never-read %**: over live (`memory_current`) records, those with no read event ever.
- **Zero-hit search**: a `read` event with `record_count = 0`.
- **Dedup**: the ledger is append-only with retry duplicates. Idempotent aggregates (`uniqExact*`, `max`, `argMax`) run raw; additive aggregates (`sum`, `count`) run over an inner `LIMIT 1 BY (span_id, store_id, record_id)`.
- **Exclusions**: hash-less versions (content capture off) are excluded from no-op/revert detection; reads with `record_id = ''` count toward totals but attribute to no record.

**Emit-side change**: `materializeTraceMemoryUseCase` now stamps the sha256 of the returned record body on `read` events (the body is already in hand for token counting). Zero-hit and content-off reads stay hash-less. No migration — `memory_events.content_hash` already exists on every row. This future-proofs exact read→version attribution; v1 analytics still attribute by time.

## Surfaces

**Main Memory page** — aggregates and store-level content only, never record-specific items ([D-insights-3](#decisions)):

- Time filter (`useAnalyticsTimeWindow`) + a Tools/Users-style analytics panel: tiles (Records · Live tokens + never-read % · Read sessions · Retrieved tokens · Writes + no-ops · Write yield + superseded-unread) and an activity chart (stacked add/update/remove bars + reads line).
- An "Unanswered searches" card (zero-hit queries grouped by text) — the *what to add to memory* report — shown only when there are zero-hit searches.
- The store table gains a write/read trend sparkline and Reads, Write yield, Net growth columns, with column visibility + server-side sort.

**Store page** (PR2) — an "Overview" entry pinned above the record tree, selected by default: store-scoped stat strip, activity + footprint charts, four ranked record cards (most retrieved / cold & large / wasteful writers / highest churn), a store-scoped search panel, and an events feed (wipes, blast-radius sessions).

**Record section** (PR2) — Changes-tab rows gain a per-version consumption verdict ("Read by N sessions" / "Never read" / "No change" / "Revert of …"), and a new Insights tab (lifetime usage profile + top queries retrieving the record).

## Data & code layout

- **Port**: `packages/domain/memories/src/ports/memory-analytics-repository.ts` (`MemoryAnalyticsRepository`) — `ChSqlClient` leaked in `R`, methods org+project scoped, optional `storeId` on shared reads so the store page reuses them.
- **Adapter**: `packages/platform/db-clickhouse/src/repositories/memory-analytics-repository.ts` — bucketed aggregations (bucketing + dedup per the Tools repo), a window-function version-outcome subquery (predecessor hash for no-ops, successor for completed, ASOF read join for consumed), and net-growth via `argMaxIf` at window boundaries. chdb integration tests colocated.
- **Use-cases**: `get-memory-analytics-overview`, `get-memory-activity-histogram`, `list-stores-with-metrics` (list + trend zip), `list-zero-hit-queries`.
- **Web**: server functions + hooks in `apps/web/src/domains/memories/`; UI under `apps/web/src/routes/_authenticated/projects/$projectSlug/memory/`.
- **Operations/MCP/SDK exposure is deferred** to a follow-up ([D-insights-4](#decisions)); the domain use-cases are the shared seam so exposure needs no rework.

## Decisions

- **D-insights-1 — Ledger only; no error/latency insights.** Memory spans virtually never fail, and the failure story lives on the wrapping tool call (Tools page). Dropping errors/latency keeps every insight on `memory_events`/`memory_current`/`memory_blobs` — no `spans` join, one repository.
- **D-insights-2 — No badges.** No status chips on stores/records/the tree. Ranked lists, sortable columns, and per-version verdict lines carry the signal instead.
- **D-insights-3 — Main page is aggregates + store-level only.** Record-specific rankings live on the store page; the fleet page ranks and compares stores.
- **D-insights-4 — Web-first, operations deferred.** These PRs ship web server functions over domain use-cases; API/MCP/SDK/CLI exposure follows in its own PR (precedent: the observability reads exposed after their UI).
- **D-insights-5 — Time-based version consumption, hash stamped for later.** v1 attributes reads to the active version by time; read events now carry the returned body hash so an exact attribution (and the outcome-impact join) can follow without re-emitting.

## Tasks

### PR1 — Main Memory page analytics

- [x] Stamp `content_hash` on read events in the materializer (+ tests).
- [x] `MemoryAnalyticsRepository` port, entities, and four use-cases.
- [x] ClickHouse adapter (overview, activity histogram, store metrics + trend, zero-hit queries) with chdb tests.
- [x] Web server functions + hooks.
- [x] Memory page: time filter, analytics panel, unanswered-searches card, store-table trend/metrics columns + column settings.

### PR2 — Store Overview + record insights

- [ ] Store Overview section (stat strip, activity + footprint charts, four ranked record cards, search panel, events feed) as the default store selection.
- [ ] Record Changes-tab per-version consumption verdicts + diff-header echo.
- [ ] Record Insights tab (usage profile, reads trend, top queries).
- [ ] Repository/use-case additions: footprint series, record rankings, store events, record consumption + insights; extend `computeRecordHistory` with no-op/revert/pending flags.

### Later (out of these PRs)

- Operations/MCP/SDK/CLI exposure of the analytics reads.
- Group-by-record-path rankings (the store-per-user fleet view).
- Outcome / eval-score join (version impact on consuming sessions) — unblocked by the read-hash stamp.
- Memory tax (retrieved tokens vs prompt spend; needs a span join), memory monitors stream, semantic hygiene detectors.
