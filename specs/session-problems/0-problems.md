## Session problems

This document is the index of known problems with the current session
implementation, ordered by development priority based on dependencies. Each
problem points to a more specific document where its solution is explored in
depth.

Items earlier in the list must be solved (at least to a working baseline)
before items later in the list, because the latter assume the former are in
place.

---

## Future-state UX context

Today the sidebar has a single **Traces** entry. Inside that route, two
view toggles flip between a per-trace listing and a per-session listing
("Traces" / "Sessions" tabs in the page header). Search is a separate
top-level route. So the surfaces in play are:

- **Traces route, "Traces" tab** — current trace listing.
- **Traces route, "Sessions" tab** — current session listing.
- **Search route** — full-text + semantic search, returning trace rows.

The end state for the navigation chrome is **explicitly an open product
decision**:

- Option (a) — keep two separate sections (Traces and Sessions as
  sibling top-level entries, or as the current tabbed view).
- Option (b) — collapse to one Sessions surface that absorbs trace
  browsing via the row-expansion pattern.

Either way, the **behaviors** that this epic introduces are independent of
that navigation decision and stand on their own:

- **One list view per surface, paginated by session.** Search results,
  issues, and the sessions tab all render session rows. Per-trace
  pagination is broken by construction (see the core constraint below).
- **One filter bar per surface.** Filters cover the union of trace and
  session dimensions, evaluated against the session row (per
  `./4-filter-parity.md`). The traces tab keeps its own filter bar; the
  parity work makes the sessions filter bar cover everything the traces
  one does.
- **Search is a query parameter on the sessions surface, not its own
  semantics.** Typing in the search input adds `q=…` to the URL and
  re-renders the same session listing with hit badges on matching trace
  rows in each row's inline expansion.
- **One click contract on a session row.** Clicking a session row
  always opens the session panel (header with metadata, Conversation tab
  with one trace). For multi-trace sessions the row also expands inline
  showing every constituent trace, with matching ones highlighted when a
  search is active. The expansion is the trace navigator; the panel is
  the trace reader.

This epic implements the behavior **inside the search route** as the
first cut — that's where the most painful noise lives today. Lifting the
same component tree into the Sessions tab (and, if (b) wins, replacing
the Traces tab entirely) is the next item *after* this set. Everything
in this document is scoped to the search-route cut and is forward-compatible
with either navigation outcome.

---

## Core constraint — pagination is by session, not by trace

All listing surfaces (search results, issues view, sessions table) must
paginate on **session rows**, not trace rows. Trace-level pagination is
broken by construction: a 25-result page can collapse to 3 unique
conversations if a single session matched on ten turns. The user is led to
expect 25 distinct things and gets 3 — fewer real results than the page
size advertises, and the same conversation repeated over and over.

This is a hard architectural constraint, not a UX preference. It shapes the
choices in every problem below:

- **#2 session-level search** — the collapse must happen inside the query
  so cursors, counts, and the "results per page" affordance are
  session-stable. Collapsing in the UI after fetching trace rows is not
  acceptable: it would silently shrink each page.
- **#3 session issue dedup** — same shape on the issues view. A session
  with ten matching turns of the same issue counts as one paginated row,
  and the issues counter reflects distinct sessions.
- **#4 filter parity** — filters are evaluated against the session row;
  one matching session yields one paginated row regardless of how many
  of its traces individually qualify.
- **#6 session detail panel** — the click target from a paginated session
  row is the panel, not a per-trace drawer.

Counters rendered alongside any of these surfaces ("25 results", "8
issues this week", "3 sessions filtered") count distinct sessions for the
same reason.

### Precondition — every trace is a session

For the constraint above to apply universally, every trace has to map to a
session. Today it doesn't: `sessions_mv` filters `WHERE session_id != ''`,
so any trace produced without `gen_ai.conversation.id` (one-shot
completions, non-chat workloads, older SDKs) is invisible to a
session-paginated listing.

We treat **orphan traces as 1-trace sessions**, with `session_id`
synthesized from the trace_id when the SDK didn't supply one. Mechanically
that's a `GROUP BY coalesce(nullIf(session_id, ''), toString(trace_id))` in
`sessions_mv` and dropping the `WHERE session_id != ''` filter. The
sessions table becomes a strict superset over traces — orphans show up
with `trace_count = 1`, and every downstream surface (search, issues,
filters, panel) gets a single code path. This lands as part of #1
(materialization parity) below.

**The same coalesce expression is the canonical session_id everywhere
downstream of ingest.** Scores carry it (so issue dedup groups correctly),
the search rollup uses it (so search never returns orphan-fragment rows),
and any future read path that needs a "trace's session" should derive it
the same way rather than reading `traces.session_id` raw. This convention
is what lets the spec set treat `session_id` as an always-present grouping
key — no `IS NULL` branches anywhere.

### Contract — session_id propagation

For session aggregates to be correct, `gen_ai.conversation.id` must be set
on **every span of a conversational trace, or none of them.** The Latitude
SDK propagates the attribute automatically via OTel context, so anyone
using it inherits the contract for free. OTel-direct customers using
auto-instrumentation libraries around third-party GenAI SDKs (Vercel AI,
LangChain, Anthropic SDK direct) must propagate the attribute manually to
their framework spans — auto-instrumentation only tags LLM-call spans by
default.

When the contract is violated (mixed binding inside a single trace), the
trace's LLM spans form a normal session row and the framework spans form a
separate **orphan-fragment** session row keyed on `toString(trace_id)`.
Orphan fragments are visually distinguishable: `tokens_total = 0`,
`cost_total_microcents = 0`, `models = []`, `trace_count = 1`. The
sessions list dims them by default via a "has LLM activity" filter chip
(see #4 filter parity), so the noise stays contained.

---

### 1. Session materialization parity with traces

Session materialization is missing 1-to-1 aggregations with traces. We are
missing `duration` and `TTFT` at minimum. Audit every field present in
materialized traces and decide for each whether the session row needs a
counterpart (sum, max, min, first, or last depending on the field) until we
reach parity.

This item also lands the **orphan-trace-as-session** change from the
precondition above: replace the `sessions_mv` filter with a synthesized
group key so every trace is a session.

- **Why this position:** This is the data-layer foundation. Filtering,
  sorting, displaying, and freshness weighting all assume the session row
  carries the same kind of information a trace row does. Anything we build
  before this is patching on top of an incomplete schema. The orphan-trace
  fix has to ship in the same migration because every downstream surface
  assumes the sessions table covers every trace.
- **Dependencies:** None.
- **Blocks:** filter parity, session detail panel, freshness sort, and
  partially session-level search (it needs these fields to render result
  cards). Also blocks the core constraint from applying universally —
  without the orphan-trace fix, session-paginated listings silently hide
  one-shot traces.

→ Spec: `./1-parity-traces-sessions.md`

---

### 2. Search paginates and counts by session, not by trace

Search today returns results per trace, so a single session that matched on
ten turns occupies ten rows of the page and the user gets three real
conversations instead of the 25 the page size promised. This is the direct
manifestation of the core constraint above: the collapse to one row per
session has to happen **inside the search query**, so the cursor advances
one session at a time, the result counter reflects distinct sessions, and
each page delivers what the page size advertises. Each row must still carry
enough information to render which of the session's traces matched and how
strongly.

- **Why this position:** This is the core change to the search pipeline.
  Several downstream problems (search highlights, freshness sort) depend on
  the pipeline operating at the session level rather than the trace level.
  It has to happen before refinements to that pipeline are worth building.
- **Dependencies:** Benefits from materialization parity so the collapsed
  session row has the fields needed to render a useful result card.
- **Blocks:** search highlights, freshness sort.

→ Spec: `./2-session-level-search.md`

---

### 3. Issues paginate and count by session, not by trace

Same shape as #2, applied to the issues view: the same issue currently
surfaces once per matching trace, so a session that triggered an issue on
ten turns floods the page with ten rows. Per the core constraint, the issue
view has to paginate and count distinct sessions — one row per
`(session, issue)`, with the underlying matching traces discoverable from
that row.

- **Why this position:** Same conceptual fix as session-level search —
  collapse to session — applied to the issues stream instead of the search
  stream. Pairing the two keeps the deduplication logic consistent across
  surfaces and avoids two divergent implementations.
- **Dependencies:** Conceptually parallel to session-level search.
- **Blocks:** session detail panel (the panel surfaces issues; they should
  already be deduplicated by then).

→ Spec: `./3-session-issue-dedup.md`

---

### 4. Filter parity between sessions and traces

Sessions are missing several filters that traces already have, notably
`traceName` and `traceId`. Audit every filter available on traces and
replicate the meaningful ones on sessions, deciding for each how it should
behave when a session contains traces with multiple values for the field.

- **Why this position:** Once sessions are the unit of search and carry the
  required fields, filters are the next visible UX gap. Doing this here
  avoids users hitting a half-functional filter bar right after session
  search lands.
- **Dependencies:** Materialization parity for the underlying fields;
  benefits from session-level search.

→ Spec: `./4-filter-parity.md`

---

### 5. Search highlights work with session results

The problems already listed in `./5-search-highlights.md` need to be fixed on
their own merits. On top of that, highlights must operate on session-level
matches — i.e. across the merged set of traces inside a session — not on a
single trace at a time.

- **Why this position:** Highlights are a presentation layer on top of the
  search pipeline. Implementing them before session-level search would mean
  building them twice — once for trace results, then again for session
  results.
- **Dependencies:** Hard-depends on session-level search. Pre-existing scope
  is documented in `./5-search-highlights.md`.

→ Spec: `./5-search-highlights.md`

---

### 6. Session detail panel

The sessions table needs its own panel where users can see:

1. The full conversation with all annotations across all of the session's
   traces.
2. Session metadata and the issues associated to the session (likely a join
   with scores).

- **Why this position:** This is the consumer of most of the data foundation
  work. It needs materialized fields and deduplicated issues to render
  correctly. Building it earlier means designing UI against incomplete data
  and reworking it later. Lifecycle status is derived inline at read time
  (`live` / `idle` from `now() - max_end_time`); no separate state table.
- **Dependencies:** Materialization parity, issue dedup.

→ Spec: `./6-session-panel.md`

---

### 7. Freshness-weighted session ordering

Session results are currently ordered purely by relevance. We want a balance
of relevance and freshness. One candidate approach: round relevance into
buckets of 0.1–0.9, then sort by recency inside each bucket — so highly
relevant results stay near the top while fresher items win ties.

- **Why this position:** A refinement on top of an otherwise-correct session
  search pipeline. Tackling freshness before session-level search lands
  would be wasted work, because the result set itself was wrong. The
  freshness axis is `max_end_time` from `sessions` directly, with a 1-hour
  clock-skew clamp — no separate lifecycle resolution needed.
- **Dependencies:** Session-level search.

→ Spec: `./7-freshness-weighted-sort.md`
