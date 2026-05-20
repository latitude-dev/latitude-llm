# Freshness-weighted session ordering

Blend relevance and freshness in the session-level search result list, so a
user typing a query gets back results that are both topically on-target **and**
sorted with the live, recently-active sessions surfaced ahead of equally-
relevant but stale ones. The unit of ranking is one row per session as defined
by `2-session-level-search.md`; this spec adds a second axis on top of
`best_score` and reshapes the `ORDER BY` and the cursor.

This is a refinement spec. It does not change `buildSearchPlan`, the
trace-level indexes, or the rollup CTE structure. It changes one expression in
the outer `SELECT` (the sort key), the `HAVING`/cursor clause, and the
public-facing cursor shape carried by `SessionListPage.nextCursor`.

Read first:

- `specs/session-problems/2-session-level-search.md` — defines the rollup CTE,
  the cursor `(best_score, session_id)`, and how list / count / metrics /
  histogram share the same plan. This spec extends that pipeline.
- `specs/session-problems/1-parity-traces-sessions.md` — defines the
  `max_end_time` column on `sessions` (`max(end_time)` over the session's
  spans). This is the canonical "last activity" timestamp; freshness
  derives directly from it.

## Scope

- **In:** the `ORDER BY` clause inside the session-level search list query,
  the matching `HAVING` (cursor) clause, the cursor shape returned in
  `SessionListPage.nextCursor`, the constants/knobs that control the freshness
  weighting, and how the count / metrics / histogram siblings stay aligned
  with the new sort key.
- **Out:** changes to ranking when no `searchQuery` is active — the non-search
  session listing keeps its existing sort axes (`start_time`, `duration`,
  `cost`, `traceCount` per `session-repository.ts:163-168`). Freshness
  weighting is a search-result concern; outside search, the user already
  picks the axis with the column-header sort UI.
- **Out:** anything to do with the trace-level search page. Trace search keeps
  `ORDER BY relevance_score DESC, trace_id DESC` (`trace-repository.ts:984`).

## 1. Current state — what `ORDER BY` looks like today

Today's session-level search list query, defined in
`specs/session-problems/2-session-level-search.md` §4.3 (lines 432-505), ends
with:

```sql
GROUP BY organization_id, project_id, session_id
ORDER BY best_score DESC, session_id DESC
LIMIT {limit:UInt32}
```

(see `2-session-level-search.md:503` and the cursor pattern at lines 540-563).

The cursor predicate sits in a `HAVING` because `best_score` is an aggregate:

```sql
HAVING (max(relevance_score), session_id) <
       ({cursorSortValue:Float64}, {cursorSessionId:String})
```

The `nextCursor` returned to the client is `{ sortValue, sessionId }` where
`sortValue` is the page's last row's `best_score` serialized as a string —
same shape as `SessionListCursor` in
`packages/domain/spans/src/ports/session-repository.ts:42-45`:

```ts
export interface SessionListCursor {
  readonly sortValue: string
  readonly sessionId: string
}
```

The two-field cursor is sufficient for stable keyset pagination as long as the
`ORDER BY` tuple agrees with the cursor tuple. `2-session-level-search.md` §9
already flagged that the `session_id` tie-breaker is "stable but arbitrary"
and explicitly deferred to this spec: *"Is there a recency or freshness
signal we should prefer over `session_id` as the secondary sort?
`max(trace_end_time)` would put recently-active sessions first among ties —
defensible. Defer to the freshness-sort spec."* (`2-session-level-search.md:992`).

This spec answers that — and extends the answer past the tie-breaker case to
the general "blend the two axes" question.

## 2. Why pure relevance is wrong

A user opens the search page on a long-lived project and types `"refund
request"`. The session-level search returns one row per session whose traces
matched the query. Suppose three sessions matched:

| Session | best_score | last activity (`max_end_time`) |
|---|---|---|
| `S-A` | 0.87 | 18 months ago — long-resolved support escalation from 2024 |
| `S-B` | 0.85 | this morning — open conversation, customer waiting |
| `S-C` | 0.42 | five minutes ago — fresh, possibly-related complaint |

Pure `ORDER BY best_score DESC` lands `S-A` first, then `S-B`, then `S-C`.
That ordering is defensible for a research / forensic use case ("what was the
single best match in our entire history?") but it's wrong for the modal
session-search user, who is investigating live behavior: they want `S-B`
first (a real, recent, high-quality match), then `S-C` (a recent moderate
match worth triaging), and only then the 18-month-old artifact. The fact that
the historical session edges the live one by 0.02 in cosine similarity is not
a meaningful preference — it's noise inside the bi-encoder's confidence
band — and it's letting an effectively-dead row dominate the first screen.

The pathology generalizes. Session corpora monotonically grow; over months
and years the corpus accumulates many high-scoring stale rows for every query
shape that has come up before. As a project ages, the top of the search
results list calcifies — the same handful of canonical past conversations
crowd out anything new that touches the same topic. The user can't see what
their *current* system is doing because their query is being answered by
their system's history. The fix has to push freshness up the priority list
without nuking relevance: a 0.85-scoring session from this morning should
beat a 0.87-scoring session from 18 months ago, but a 0.42-scoring session
from 5 minutes ago should not beat a 0.85-scoring session from this morning.
The challenge is calibrating where the relevance gap stops being meaningful
and freshness starts to dominate.

## 3. The freshness axis

We need one column per session that answers "how recently was this session
active?", with the following properties:

1. **Bounded by reality.** A client with a wrong clock cannot make a session
   look fresher than `now()`. Defense lives in CH at read time, not in the
   client.
2. **Stable enough for cursor pagination.** The value can move forward when
   new traces land — that's the whole point — but the *cursor* has to encode
   the value at the moment the page was issued so subsequent page-fetches
   compare against the same baseline.
3. **Cheap.** Already materialized; no join, no extra subquery.

### Candidate timestamps

| Source | Where | Behavior |
|---|---|---|
| `traces.max_end_time` per matching trace | Joined into `trace_rollup` via the existing join to `traces` (`2-session-level-search.md:498-502`). | Bounding-box of the **matching** traces. `max(trace_end_time)` is the latest matching turn's end. |
| `sessions.max_end_time` | CH `sessions` AggregatingMergeTree (`packages/platform/db-clickhouse/clickhouse/migrations/unclustered/00007_sessions.sql:16-17`); read via `max(max_end_time) AS end_time` in `session-repository.ts:30`. | Latest span end_time across the **whole** session. The session's canonical "last activity". |

### Recommendation: `sessions.max_end_time`

Use the session-level `max_end_time` (the whole session's latest activity),
not the per-matching-trace `max(trace_end_time)`. Three reasons:

1. **Definition match.** It's the same value the panel header uses for
   "Last activity" and the same value the panel uses to derive its
   `live` / `idle` status pill (`now() - max_end_time` against
   `SESSION_LIVE_THRESHOLD_MS`). Freshness sort sharing that definition
   means "fresh in the sort" and "live in the pill" line up: a user
   wondering why an old-looking session is at the top can always check
   the pill for the answer.
2. **Robust to single-trace matches.** A session active today whose only
   matching turn is from six months ago should still rank as fresh — the
   conversation is alive, the query just happened to hit an old quote. Using
   `max(trace_end_time)` from `trace_rollup` would penalize that case
   incorrectly; using `sessions.max_end_time` does not. See §6.3 for the
   worked example.
3. **Trivially available.** It's already on the `sessions` row and the
   rollup CTE in `2-session-level-search.md` is going to need to join through
   `sessions` anyway to get `session_id` (today the join goes through
   `traces`; see Open Questions about pulling other session-row fields).
   Worst case it's a cheap extra column on the existing join.

### Clock-skew defense

A span whose client-reported `end_time` lies in the future would otherwise
make a session sort as "infinitely fresh" forever. Sort against
`least(max_end_time, now64(9, 'UTC') + INTERVAL 1 HOUR)`:

```sql
least(max(max_end_time), now64(9, 'UTC') + toIntervalHour(1)) AS last_activity_at
```

The `+1 HOUR` window absorbs honest small skews (NTP drift, batch-finalized
spans) without collapsing them to `now()` exactly, while still capping the
2099-dated junk-span case.

## 4. Options considered

Three viable shapes for combining `best_score` and `last_activity_at`. All
three preserve the existing rollup CTE; they differ in the outer `ORDER BY`
expression and the cursor shape.

### Option A — Bucketed relevance + recency within bucket (the user's proposal)

Round `best_score` into 10 fixed-width buckets and sort by recency inside
each bucket. The recency axis is `last_activity_at DESC`.

```sql
-- New expression in the outer SELECT:
floor(best_score * 10) / 10 AS relevance_bucket  -- in {0.0, 0.1, 0.2, …, 0.9, 1.0}

ORDER BY
  relevance_bucket DESC,
  last_activity_at DESC,
  session_id DESC
```

**Bucket math.** `floor(best_score * 10) / 10` partitions `[0.0, 1.0]` into
ten half-open intervals `[0.0, 0.1), [0.1, 0.2), …, [0.9, 1.0)`, plus the
singleton bucket `{1.0}` (a perfect cosine 1.0 lands in its own bucket).
Boundaries are deterministic: `best_score = 0.85` and `best_score = 0.89999`
both land in bucket `0.8`; `best_score = 0.9` lands in bucket `0.9`. The
floor's left-closed/right-open semantic means the bucket containing a value
`x` is always `floor(x * 10) / 10`, never ambiguous.

In ClickHouse the `floor()` function returns a `Float32`/`Float64` matching
its argument's type — `best_score` is `Float64` from
`max(search_results.relevance_score)` — so the bucket column is `Float64`
with a fixed dust of decimals (`0.1` is `0.10000000000000001` in IEEE 754,
but it compares equal to itself within the same query, so cursor stability
is preserved).

**Cursor.** Three fields, lexicographically compared:

```sql
HAVING (
  floor(max(relevance_score) * 10) / 10,
  least(max(max_end_time), now64(9, 'UTC') + toIntervalHour(1)),
  session_id
) < (
  {cursorBucket:Float64},
  {cursorLastActivityAt:DateTime64(9, 'UTC')},
  {cursorSessionId:String}
)
```

The cursor shape changes from `{ sortValue, sessionId }` to
`{ bucket, lastActivityAt, sessionId }`. Same keyset-pagination contract as
today, just one extra field. See §5 for the wire shape.

**Pros**

- Matches the user mental model — "approximately-same-relevance, fresher
  first" — in one sentence. The §2 failure mode (18-month-old 0.87 beats
  this-morning 0.85) is gone for any pair inside the same bucket.
- Relevance still dominates across bucket boundaries: a 0.85 always beats
  a 0.79 no matter how fresh.
- One knob: bucket width. Wider → favor freshness; narrower → favor
  relevance.
- Cursor stays a deterministic tuple comparison.

**Cons**

- **Boundary cliffs.** `0.8001` and `0.7999` sit in adjacent buckets and
  can be displaced by many rows despite a 0.0002 score gap. Price of
  the simplicity.
- **Cursor instability on bucket bump.** A new high-scoring trace can
  lift a paginated session into a higher bucket. Same forward-time
  anomaly as `2-session-level-search.md:999-1006`; the bucket jump is
  more visible than a continuous-score nudge but not more frequent.
- **No score variance inside a bucket.** `0.99` and `0.90` are
  indistinguishable. Acceptable in `[0.9, 1.0)` but more debatable in
  `[0.3, 0.4)` where the band spans the signal floor
  (`TRACE_SEARCH_MIN_RELEVANCE_SCORE = 0.3`, `constants.ts:138`).

**Query cost.** Negligible. The bucket expression is a pure scalar
computation on the outer aggregate; ClickHouse handles it inside the same
group-by pass. The `HAVING` cursor predicate is the same tuple comparison as
today, with one more field.

**Tunability.** The bucket width is one constant. Tied to a single
`SESSION_SEARCH_RELEVANCE_BUCKET_WIDTH = 0.1` in `constants.ts`. Cheap to
A/B if we ever want to (0.05 = more buckets, 0.2 = fewer, etc.).

**Edge surprises.** Lexical-only matches all have `best_score = 0.0`, so
they all share bucket `0.0` (see `2-session-level-search.md:822-833`); inside
that bucket they sort by `last_activity_at` — which is the right behavior.
Phrase-only matches naturally separate themselves into "freshest first"
without any extra plumbing.

### Option B — Continuous composite score (exponential decay)

Combine the two axes into a single scalar:

```
composite_score = best_score * exp(-lambda * age_days)
```

where `age_days = (now() - last_activity_at) / (1 day)` and `lambda` is
chosen so that a fixed half-life `T_half` means `exp(-lambda * T_half) = 0.5`,
i.e. `lambda = ln(2) / T_half`.

The codebase already uses this pattern for the issue-discovery centroid
decay: `packages/domain/issues/src/helpers.ts:70-74` uses
`alpha = 0.5 ** (delta / halfLifeMilliseconds)` for an analogous
exponential half-life decay, with `CENTROID_HALF_LIFE_SECONDS = 14 * 86400`
(`packages/domain/issues/src/constants.ts:125`). The session-search version
operates at read time inside ClickHouse instead of inside the worker, but
the math is the same.

In CH:

```sql
best_score * exp(
  -ln(2) * dateDiff('day',
    least(max(max_end_time), now64(9, 'UTC') + toIntervalHour(1)),
    now64(9, 'UTC')
  ) / {halfLifeDays:Float64}
) AS composite_score

ORDER BY composite_score DESC, session_id DESC
```

**Tuning `T_half`.** The half-life is the moment when an old session of
relevance `x` ties a fresh session of relevance `x / 2`. Decay multiplies,
so a session at 0.4 can *never* beat a fresh session at 0.8 — the
freshness benefit is *proportional*. A recent 0.42 only beats an old 0.85
once `0.42 > 0.85 * exp(-lambda * age)`, i.e. once the old session's
decay multiplier falls below `0.42/0.85 ≈ 0.49`, slightly later than one
half-life. Default `T_half = 7 days` is a reasonable starting point.

**Cursor.** Two fields, like today, but the sort value is the composite:

```sql
HAVING (composite_score, session_id) <
       ({cursorSortValue:Float64}, {cursorSessionId:String})
```

The wire cursor shape doesn't change at all — `{ sortValue: string;
sessionId: string }` keeps working.

**Pros**

- Smooth — no boundary cliffs.
- Reuses today's 2-field cursor shape exactly. No client changes.
- Mirrors `updateIssueCentroid` (`helpers.ts:107-130`).

**Cons**

- **Leapfrog.** With a short half-life, a 0.42 can climb above a 0.87.
  User reads "0.42 above 0.87" and has to reason about decay.
- **Half-life is a soft knob.** No principled answer; tune to taste.
- **Cursor unstable under decay.** `composite_score` depends on
  `now64()`, which moves between page fetches; the strict-less-than
  comparison can drop or duplicate boundary rows. Fix: snapshot
  `now()` at first request and thread the snapshot through every
  paginated call. Extra wire field, extra wiring. Option A is exempt
  because `floor()` of a stable `best_score` doesn't depend on `now()`.
- **`exp()` per row.** Cheap relative to `cosineDistance` already in
  the pipeline, but worth noting.

**Query cost.** One `dateDiff` + one `exp` per row in the outer
aggregation. Cheaper than the existing cosine, more expensive than a
`floor()`. Negligible.

**Tunability.** One knob, the half-life. Ship as
`SESSION_SEARCH_RECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000` for
symmetry with the issue centroid constant.

**Edge surprises.** Sessions with `best_score = 0.0` (lexical-only) all
sort to the bottom regardless of recency: `0.0 * exp(...) = 0.0`. That's
worse than Option A, where lexical-only rows still sort among themselves
by recency. We'd have to special-case `best_score = 0.0` to fall back to a
recency-only ordering inside that band — adding back a branch we got rid
of when we picked "continuous".

### Option C — Two-pass / rerank by recency

Pull the top-K by pure relevance (K large, e.g. 200), then rerank that set
by `last_activity_at` for the user-visible page.

```sql
SELECT … FROM (
  SELECT * FROM session_rollup
  ORDER BY best_score DESC
  LIMIT 200
)
ORDER BY last_activity_at DESC, session_id DESC
LIMIT 50
```

**Pros**

- Trivially understandable: "200 most relevant, ordered by freshness".
- Inside the shortlist there's no boundary cliff.

**Cons**

- **Pagination is broken.** The shortlist is computed per request. A
  cursor cannot express "below row 200 in the relevance shortlist"
  because that boundary moves under inserts. Offset-based pagination is
  the only option and offsets re-order under inserts.
- **The 201st-best-relevance session is invisible no matter how fresh.**
  Single hard cliff at K — worse boundary semantics than Option A.

**Query cost.** Two passes; intermediate state. Comparable to today.

**Tunability.** One knob (K). Same boundary-cliff pathology as A but at
a single global threshold.

**Cursor stability.** No keyset cursor that survives concurrent updates.

### Summary table

| | Option A — Buckets | Option B — Decay | Option C — Two-pass |
|---|---|---|---|
| Sort key | `(bucket, last_activity_at, session_id)` | `(composite_score, session_id)` | `(rerank_position)` |
| Cursor fields | 3 | 2 (same as today, value differs) | offset (unstable) |
| Cursor stable under concurrent inserts | Same as today within bucket; cross-bucket the row jumps | Composite drifts as `now()` advances; mitigated by snapshot | No |
| Boundary cliff | Yes, at bucket edges (knob-controlled) | No (smooth) | Yes, at K (single cliff) |
| Lexical-only (`0.0`) rows order | By recency within bucket 0.0 | All collapse to 0 | Likely never in top-K |
| Knobs to tune | bucket width (default 0.1) | half-life (default 7 days) | K (default 200) |
| Read-time cost | floor + tuple cmp | exp + dateDiff + cmp | inner ORDER BY + LIMIT + outer ORDER BY |
| Wire cursor change | Yes (1 extra field) | No (same shape) | Yes (offset) |
| Affinity with §1 quote from `2-session-level-search.md:992` | Direct (recency tie-breaker generalized) | Indirect | Indirect |

## 5. Recommended approach — Option A

**Ship the bucketed sort.** The bucket-width knob maps directly to the
user mental model ("approximately-same-relevance → fresher wins"), the
cursor stays a deterministic tuple, lexical-only rows still order by
recency, and we don't have to take a dependency on snapshotting `now()`
across requests. Option B is a credible alternative — and if we ever ship
both behind a feature flag, the cursor shape from A is a strict superset
of B's, so we can switch the inner mechanic without breaking client URL
state. Option C is rejected outright on pagination.

### 5.1 Concrete SQL — full outer query

The outer `SELECT` from `2-session-level-search.md` §4.3, with the freshness
additions inlined. Diff against `2-session-level-search.md:464-505`:

```sql
SELECT
  organization_id,
  project_id,
  session_id,

  -- Score aggregation across the session's matching traces (unchanged).
  max(relevance_score)                                            AS best_score,
  argMax(trace_id, relevance_score)                               AS best_trace_id,

  -- NEW: freshness axis. `max(max_end_time)` is the session's last activity
  -- — the same value the session panel uses as "Last activity" and for the
  -- live/idle pill. The `least(…, now + 1 HOUR)` clamp absorbs client-clock
  -- skew without collapsing honest small drift to now() exactly.
  least(
    max(max_end_time),
    now64(9, 'UTC') + toIntervalHour(1)
  )                                                               AS last_activity_at,

  -- NEW: relevance bucket. floor(score * 10) / 10 partitions [0, 1] into
  -- ten 0.1-wide buckets {0.0, 0.1, ..., 0.9}, plus the singleton 1.0 for an
  -- exact cosine of 1. Lexical-only sessions (best_score = 0.0) land in bucket 0.0
  -- and order by last_activity_at among themselves.
  floor(max(relevance_score) * {bucketWidth:Float64} * 10) /
    ({bucketWidth:Float64} * 10)                                  AS relevance_bucket,
  -- ^ Parameterized form. Default {bucketWidth:Float64} = 1.0 → buckets of width 0.1.
  --   Set to 2.0 for buckets of width 0.05; 0.5 for buckets of width 0.2; etc.
  --   See §5.4 on knob plumbing.

  -- Existing aggregates (unchanged from 2-session-level-search.md §4.3):
  count()                                                         AS matching_trace_count,
  arrayMap(
    pair -> pair.1,
    arrayReverseSort(pair -> pair.2, groupArray((trace_id, relevance_score)))
  )                                                               AS matching_trace_ids,
  arrayMap(
    pair -> pair.2,
    arrayReverseSort(pair -> pair.2, groupArray((trace_id, relevance_score)))
  )                                                               AS matching_trace_scores,

  min(trace_start_time)                                           AS session_start_time,
  max(trace_end_time)                                             AS session_end_time,
  sum(cost_total_microcents)                                      AS cost_total_microcents,
  sum(span_count)                                                 AS span_count,
  sum(error_count)                                                AS error_count,
  sum(tokens_total)                                               AS tokens_total

FROM trace_rollup
WHERE session_id != ''
  ${sessionCursorClause}     -- HAVING, see §5.2
GROUP BY organization_id, project_id, session_id

-- NEW: ORDER BY uses the bucket + freshness + session_id tuple.
ORDER BY
  relevance_bucket  DESC,
  last_activity_at  DESC,
  session_id        DESC

LIMIT {limit:UInt32}
```

**Surfacing `sessions.max_end_time`.** The rollup CTE in
`2-session-level-search.md` reads from `traces`. Two options: (a) extend
`trace_rollup` with a `LEFT JOIN sessions` to pull `s.max_end_time`
through; (b) use `max(trace_rollup.trace_end_time)` instead. Recommend
(a) — see §6.3: a session with one old matching trace but live activity
*outside* the matching set should still rank as fresh; (b) penalizes
that case. The join is cheap (`sessions` shares the
`(organization_id, project_id, session_id)` primary key), and the
right-hand side is unique per session, so `any(sess.max_end_time)` is
safe inside `trace_rollup`:

```sql
-- inside trace_rollup:
any(sess.max_end_time)                                  AS session_max_end_time
FROM traces t
INNER JOIN search_results ON t.trace_id = search_results.trace_id
LEFT JOIN sessions sess ON
     sess.organization_id = t.organization_id
 AND sess.project_id     = t.project_id
 AND sess.session_id     = argMaxIfMerge(t.session_id)
```

The outer SELECT then reads `least(max(session_max_end_time),
now() + 1 HOUR) AS last_activity_at`.

**Knob form.** The parameterized expression
`floor(score * bucketWidth * 10) / (bucketWidth * 10)` keeps the knob as
"buckets per unit of relevance": `bucketWidth = 1.0` (default) → 10
buckets, reads `floor(score * 10) / 10` exactly; `2.0` → 20 buckets of
width 0.05; etc.

### 5.2 Cursor encoding

The wire shape changes. From `SessionListCursor` today
(`packages/domain/spans/src/ports/session-repository.ts:42-45`):

```ts
export interface SessionListCursor {
  readonly sortValue: string
  readonly sessionId: string
}
```

To, for the search variant only:

```ts
// Lives next to SessionListCursor in
// packages/domain/spans/src/ports/session-repository.ts (or beside it in a
// new file alongside the search-mode types introduced by
// 2-session-level-search.md §5.1).
export interface SessionSearchCursor {
  readonly relevanceBucket: number       // 0.0, 0.1, ..., 0.9, or 1.0
  readonly lastActivityAt: string        // ISO-8601, ns precision dropped to ms
  readonly sessionId: string
}
```

Three fields, lexicographic. The `HAVING` predicate inside the outer query
becomes:

```sql
HAVING (
  floor(max(relevance_score) * 10) / 10,
  least(max(any_session_max_end_time), now64(9, 'UTC') + toIntervalHour(1)),
  session_id
) < (
  {cursorBucket:Float64},
  {cursorLastActivityAt:DateTime64(9, 'UTC')},
  {cursorSessionId:String}
)
```

with `cmp = <` for `DESC, DESC, DESC` ordering (as today). When
`sortDirection = "asc"` is requested under search, the comparator inverts
to `>`; in practice search ignores client-side `sortBy/sortDirection` and
always orders by the relevance+freshness tuple, mirroring the policy from
`trace-search.md` §"Ordering policy" (line 133) — so this is mostly
defensive.

**Tie-breaker semantics.** Two sessions with the same bucket and the
same `last_activity_at` to nanosecond precision are essentially
impossible by accident (`max_end_time` is a 9-digit-fraction DateTime64),
but possible under deliberate construction (synthetic data, replays). The
final `session_id` tie-breaker resolves them deterministically. Same
posture as today.

**Cursor returned to the client** (the `nextCursor` field of
`SessionListPage`):

```ts
{
  relevanceBucket: 0.8,                    // last row's bucket
  lastActivityAt: '2026-05-19T11:24:31.000Z',
  sessionId: '01HXYZ…',
}
```

Wire-format: the bucket is serialized as a number (decoded with
`parseFloat`); `lastActivityAt` as an ISO string parsed back to
`DateTime64`; `sessionId` as a string. Same `String(...)` pattern as the
existing cursor encoding (`session-repository.ts:265`).

### 5.3 Count / metrics / histogram alignment

These three already share the rollup CTE with the list path per
`2-session-level-search.md` §4.6. They do **not** need the freshness sort
applied — they aggregate over the matched set, not enumerate it page by
page — but they do need to be consistent about *which* matched set they
operate over. Three checks:

- **count**: returns `count(DISTINCT session_id)` over the rolled-up
  rows. The freshness sort doesn't change which rows match, so the count
  is unchanged. No bucket math in this path.
- **metrics**: aggregates over rolled-up rows. Same: same row set, no
  ordering involved. No change.
- **histogram**: bucketed by session start time. Same row set, no
  ordering involved. No change.

In other words, the freshness sort is purely a list-path concern. The
sibling queries don't need a `last_activity_at` column or a
`relevance_bucket` column.

### 5.4 Knob surfacing

Three constants in `packages/domain/spans/src/constants.ts`, grouped under
a new comment block adjacent to the existing trace-search constants:

```ts
// ═══════════════════════════════════════════════════════════════════════════════
// Session Search — Freshness-Weighted Ordering
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Width of the relevance bucket used when sorting session search results.
 *
 * Sessions are sorted by `(relevance_bucket, last_activity_at, session_id)`
 * where `relevance_bucket = floor(best_score / RELEVANCE_BUCKET_WIDTH) *
 * RELEVANCE_BUCKET_WIDTH`. A wider bucket favors freshness (more sessions
 * share a tier, recency dominates); a narrower bucket favors relevance.
 *
 * 0.1 is the default: with TRACE_SEARCH_MIN_RELEVANCE_SCORE = 0.3 the
 * non-empty buckets are {0.3-0.4, 0.4-0.5, ..., 0.9-1.0}, giving seven
 * recency-sorted tiers above the lexical-only floor.
 */
export const SESSION_SEARCH_RELEVANCE_BUCKET_WIDTH = 0.1

/**
 * Maximum future skew (milliseconds) tolerated when reading max_end_time
 * for the freshness sort. A span with end_time more than this far in the
 * future is clamped to now() + this interval, preventing client-clock-skew
 * junk from floating to the top of search results forever.
 */
export const SESSION_SEARCH_MAX_CLOCK_SKEW_MS = 60 * 60 * 1000
```

The constants are read once at repository construction and passed as
query parameters to ClickHouse (`bucketWidth`, `clockSkewMs`,
`boostActive`). They are *not* env-var-driven — these are product
decisions, not deployment-environment decisions, and they need to stay
identical across all dynos. If/when we eventually expose them per project
(see Open Questions), the resolution path will be the same per-org
resolver that `EmbedBudgetResolver` uses for the embedding budget knobs
(`constants.ts:96-99`), not env vars.

### 5.5 Files touched

| Layer | File | Change |
|---|---|---|
| Domain constants | `packages/domain/spans/src/constants.ts:138` (end of file) | Add `SESSION_SEARCH_RELEVANCE_BUCKET_WIDTH`, `SESSION_SEARCH_MAX_CLOCK_SKEW_MS`. |
| Domain port | `packages/domain/spans/src/ports/session-repository.ts:42-45` | Add `SessionSearchCursor` type alongside `SessionListCursor`; widen `SessionListPage.nextCursor` to `SessionListCursor \| SessionSearchCursor` (or split into two page types — see Open Questions). |
| CH repository (search path introduced by 2-session-level-search.md) | `packages/platform/db-clickhouse/src/repositories/session-repository.ts` (the `if (plan?.ranked)` branch added by `2-session-level-search.md` §7) | Extend the outer SELECT with `relevance_bucket` + `last_activity_at`; swap the `ORDER BY` and `HAVING` clauses for the three-field form; widen `nextCursor` shape. |
| Server fn | `apps/web/src/domains/sessions/sessions.functions.ts` (the `listSessionsByProject` shape introduced by `2-session-level-search.md` §5.1) | Pass the new cursor shape through to the client. |
| Client collection hook | `apps/web/src/domains/sessions/sessions.collection.ts:31-46` | `initialPageParam` type widens to the cursor union; `getNextPageParam` already returns `lastPage?.nextCursor` so no logic change. |
| React Query key | `apps/web/src/domains/sessions/sessions.collection.ts:30` | If we expose the bucket width per project eventually, the bucket width belongs in the query key; today the constant is global, so the key is unchanged. |

No CH migration is needed — all freshness fields are derived at read time
from existing columns. No PG migration is needed. No worker changes.

## 6. Edge cases

### 6.1 Live vs idle sessions

The panel's status pill distinguishes `live` (recent activity, within
`SESSION_LIVE_THRESHOLD_MS`) from `idle` (older). The freshness axis
already captures this implicitly: a `live` session by definition has a
`last_activity_at` close to `now()` and will sort above any `idle`
session within the same relevance bucket. No additional priority tier
is needed in the baseline — the timestamp itself does the work.

### 6.2 Score ties at bucket boundaries

`floor()` is unambiguous: `0.7999 → 0.7`, `0.8000 → 0.8`. SQL side is
clean; the UX question is whether the user reads it as "0.80 beat
0.7999 unfairly" or "different relevance, 0.80 wins". The
matching-turn pill from `2-session-level-search.md` §5.3 shows match
count, not score, so the boundary is mostly invisible in the UI. If
boundary effects become a complaint, shrink buckets to 0.05 width by
flipping the constant. Document the semantic in the constant's comment
("`floor`-based, left-closed/right-open, except the singleton 1.0
bucket") and move on.

### 6.3 Old matching trace in a fresh session vs fresh matching trace in an old session

Two cases, both subtle:

- **Session-A:** a customer-support thread that has been live all week,
  with hundreds of recent turns. The user's query `"refund request"`
  matches one turn from six months ago and nothing recent.
  `matching_trace_count = 1`; the matching trace is old; the *session*
  is fresh.
- **Session-B:** a long-resolved thread that ended six months ago. The
  user's query matches three of its turns. `matching_trace_count = 3`;
  the matching traces are all old; the *session* is old.

If freshness uses `max(trace_rollup.trace_end_time)` (the freshness of
the **matching** traces, the simpler option (b) in §5.1), both sessions
sort as equally old. That's wrong — Session-A is alive; Session-B is
dead.

If freshness uses `sessions.max_end_time` (the freshness of the
**whole** session, recommended option (a) in §5.1), Session-A correctly
sorts ahead of Session-B. The matching turns can be old; what matters
for freshness ranking is "is this conversation still alive?".

This is the §3 "session-level not trace-level" choice in concrete form.
Use `sessions.max_end_time`.

### 6.4 Cursor stability under concurrent inserts

Two failure modes when a new trace lands mid-scroll:

1. **Bucket bump.** A new high-scoring trace lifts a session's
   `best_score` from 0.79 → 0.81, moving it from bucket 0.7 to 0.8.
   If the user already paged past bucket 0.8, the row re-appears on
   the new bucket. Same forward-time anomaly as
   `2-session-level-search.md:999-1006`; document and accept.
2. **Freshness bump.** A new span advances `last_activity_at`. The
   strict-less-than cursor `(bucket, last_activity_at, session_id) <
   (cursorBucket, cursorLastActivityAt, cursorSessionId)` correctly
   excludes the row from subsequent pages; the user only sees the
   duplicate if they reload page 1.

Bucket bumps are *more visibly* anomalous than the continuous-score
case (the row jumps across dozens of others), but not more frequent.
If duplicates become a complaint, add client-side dedupe-by-sessionId
in the page-flatten step of `useSessionsInfiniteScroll`
(`apps/web/src/domains/sessions/sessions.collection.ts:58`).

### 6.5 Lexical-only matches (`best_score = 0.0`)

Lexical-only sessions all land in bucket 0.0 and sort by
`last_activity_at DESC` among themselves. This is the right behavior —
phrase matches alone are a filter not a ranking signal
(`2-session-level-search.md:822-833`, `trace-search.md` §"Why no native
phrase relevance"), so freshness is the only signal available. A
project with *only* lexical-only hits gets a coherent page of "latest
sessions whose text contains this phrase".

### 6.6 Clock skew and missing timestamps

`sessions.max_end_time` is never `NULL` (every session row requires at
least one span with `session_id` and `end_time`). Future-dated spans
(NTP drift, batch-finalized) are absorbed by the `+ 1 HOUR` clamp; two
clamped sessions tie at `now() + 1 HOUR` and break on `session_id`.

### 6.7 Re-opened sessions

A previously-idle session that receives a new span advances
`max_end_time` automatically (the MV merges the new partial). The
freshness sort reads the merged value, so the re-opened session
correctly sorts as fresh again. No separate "re-opened" concept
exists in the schema.

### 6.8 Embedding TTL eviction

A semantic-scored session older than 30 days
(`TRACE_SEARCH_EMBEDDING_LOOKBACK_DAYS`, `constants.ts:64`) loses its
embedding contribution and may collapse from `best_score ≈ 0.45` to
`0.0` (lexical-only). It drops to bucket 0.0 and sorts by recency from
there. Acceptable — the session was already aging off the top of the
sort by then. `sessions.max_end_time` itself doesn't expire on the
30-day cadence; the `sessions` aggregate TTL is much longer.

## 7. Open questions

- **Per-org/per-project bucket width.** Defaulting to 0.1 is fine for
  V1. If a research-heavy org wants 0.05 (favor score) and a live-ops
  org wants 0.2 (favor freshness), route resolution through the same
  per-org resolver pattern as the embedding-budget constants
  (`constants.ts:96-99`). Until plans land, hardcoded constant.
- **Expose the bucket in the UI?** Probably not in V1 — the
  `matching_trace_count` pill from `2-session-level-search.md` §5.3
  already gives a relative-strength cue. Reconsider if §6.2 boundary
  effects become a complaint.
- **`SessionListCursor` vs `SessionSearchCursor` typing.** Pick
  between a plain union (`SessionListCursor | SessionSearchCursor`,
  callers branch on presence of `relevanceBucket`) and a discriminated
  union with a `kind` tag. Either works.
- **Surface `last_activity_at` in `SessionRecord`?** Today
  `Session.endTime` is `max(max_end_time)` already
  (`session-repository.ts:30`). The clamp is only on the sort key; the
  displayed `endTime` keeps its raw value (so a wonky-clock span is
  *visible* to the user but doesn't poison the sort).
- **Active-boost (§6.1) on or off by default.** Ship off; re-evaluate
  after a sprint of telemetry.
- **Histogram bucket key.** `2-session-level-search.md` §4.6 keys the
  histogram on `min(trace_start_time)`. Worth asking whether to use
  `last_activity_at` instead so the list-sort axis matches the
  timeline axis. Defer.
- **Interaction with score-filter (`HAVING`).** Filters narrow inside
  `trace_rollup` per `2-session-level-search.md` §4.5; freshness sort
  runs on the outer aggregate. The two don't interfere.
