# Session search — QA checklist

Manual verification for the LAT-599 session-level search feature (the
`/session-search/` route shipped behind the `session-search-v2` feature flag).
The companion script in
`tools/live-seeds/src/scripts/send-session-search-qa.ts` ingests a set of
engineered conversations with deterministic content so the queries below have
predictable expected results.

## Setup

1. Local services up: ingest service (`pnpm --filter @app/ingest dev`), workers
   (`pnpm --filter @app/workers dev`), web (`pnpm --filter @app/web dev`),
   ClickHouse, Postgres, Redis. See
   [`.agents/skills/toolchain-commands/SKILL.md`](../.agents/skills/toolchain-commands/SKILL.md)
   for the canonical `docker compose` + `pnpm dev` startup.
2. Enable the `session-search-v2` feature flag for your test org via
   `/backoffice/feature-flags/`. See `dev-docs/feature-flags.md` for the full
   lifecycle if the flag isn't there yet — the catalog picks it up
   automatically from
   [`packages/domain/feature-flags/src/constants.ts`](../../packages/domain/feature-flags/src/constants.ts).
3. Seed the QA fixtures into the seeded `Acme` org's `default-project`:

   ```bash
   pnpm --filter @tools/live-seeds seed:session-search-qa
   ```

   The script accepts `--project-slug <slug>` if you'd rather seed elsewhere.
4. **Wait ~10 seconds** for the trace-search worker to index the new traces.
   The worker has a debounce after `trace-end:run`
   ([`apps/workers/src/workers/trace-search.ts`](../../apps/workers/src/workers/trace-search.ts));
   if you query before it fires you'll see no matches.

## Sessions produced

With the default `--count 1`, you get five sessions:

| Session ID | Traces | Theme | Engineered intent |
|---|---|---|---|
| `qa-refund-4-1` | 4 | Refund / payment dispute | Every trace mentions "refund". Heavy lexical target. |
| `qa-code-3-1` | 3 | TypeScript / React | **Negative control** — should never match refund queries. |
| `qa-mixed-6-1` | 6 | Onboarding chatter + 2 incidental refund mentions | Validates that `matching_trace_count = 2`, not 6, when only 2 traces match. |
| `qa-cancellation-5-1` | 5 | Cancellation / chargeback | **Lexically disjoint from the canonical semantic query** (`"customer wanted their money back"`) — none of "refund", "money", or "back" appear anywhere in the conversation. The session has to be found by cosine similarity alone, via the surrounding cluster (cancel, subscription, reimbursement, reversal, chargeback, credit, billing). |
| `qa-deep-20-1` | 20 | Wide-ranging chatter | "refund" appears at traces 5, 12, 18. Trace 12 has the densest refund language (future highlights-scroll target — see "Highlights future work" below). |

## How "matching trace count" works (read this before running queries)

Each LLM call sends the full prior conversation as `input_messages`, and
`buildTraceSearchDocument` indexes that whole conversation context per trace.
Practical consequence: **once a phrase is uttered in a session, every later
trace in the same session also matches a literal search for that phrase**,
because the phrase lives in their indexed history.

So when you see "X matching traces" for a session, the expected count isn't
"how many traces directly mention the term"; it's
**`(session_trace_count − position_of_first_mention + 1)`**. A 20-trace
session where "refund" is first uttered at trace 5 will report **16**
matching traces (5 through 20), not 1.

This is intentional and consistent with how the existing `/search` route has
always behaved — we just didn't have a fixture engineered to make it
obvious. If you want a single matching trace, you need a phrase that only
ever appears in the very last trace of a session.

## Test queries

Run these on `/projects/default-project/session-search/`. Each row asserts an
expected behavior — tick the box once you've verified it.

| # | Query (typed into the search bar) | Mode | Expected `matching_trace_count` per session (sorted) | Why |
|---|---|---|---|---|
| 1 | `"refund"` | literal | `qa-refund-4-1` = **4** (all traces), `qa-deep-20-1` = **16** (first mention at trace 5 → 5..20), `qa-mixed-6-1` = **4** (first mention at trace 3 → 3..6). Total **24**. | `bestScore = 0.0` for every match (no semantic component), so secondary ordering collapses to `session_id DESC`. `qa-code-3-1` and `qa-cancellation-5-1` are absent. |
| 2 | `` `dispute team` `` | token phrase | `qa-refund-4-1` = **2** (first at trace 3 → 3..4), `qa-deep-20-1` = **9** (first at trace 12 → 12..20). Total **11**. | Adjacent tokens "dispute team" first appear in `qa-refund-4-1`'s trace 3 reply and `qa-deep-20-1`'s trace 12. Accumulated history carries the phrase forward into every later trace in each session. |
| 3 | `customer wanted their money back` | semantic — **pure** | `qa-cancellation-5-1` first (engineered pure-semantic target — none of "refund", "money", "back" appear in any of its turns; cosine alone has to surface it). `qa-refund-4-1`, `qa-mixed-6-1`, and `qa-deep-20-1` also appear since they're refund-themed. Specific per-session counts depend on which chunks survive the semantic-scan cap; don't pin exact numbers. | Cosine ranks across all chunk embeddings; no literal filter narrows the candidate set. **This is the only query in the suite that is genuinely pure-semantic** — the others either are literal/hybrid or rely on accidental token overlap. |
| 4 | `"refund" user complaint` | hybrid | Same per-session counts as query 1 (literal filter is the same), but ranked by the semantic prompt within each session: `qa-refund-4-1` likely first, then `qa-deep-20-1`, then `qa-mixed-6-1`. Total still **24**. | Literal `"refund"` filters the candidate set; the semantic prompt only reorders within. `qa-cancellation-5-1` drops out — no literal "refund" in any of its traces. |
| 5 | `pizza dough` (literally appears in `qa-deep-20-1` trace 14) | semantic (parser-wise) — but with literal overlap, so behaves like a literal hit | `qa-deep-20-1` only — first occurrence at trace 14 → **7** matches via accumulated history (14..20). | Parser-wise this is a semantic query (no quotes/backticks), but a trace containing the exact words has cosine ≈ 1.0, so semantic search behaves indistinguishably from literal here. Useful sanity check that the embedding worker actually indexed the deep fixture. |
| 6 | Empty search bar | n/a | Plain session listing, no "Matching traces" column, ordered by recency. | Non-search mode falls through to the regular sessions list — same as the project page's Sessions tab. |

- [ ] Query 1 — literal (`"refund"`)
- [ ] Query 2 — token phrase (`` `dispute team` ``)
- [ ] Query 3 — semantic only (`customer wanted their money back`)
- [ ] Query 4 — hybrid (`"refund" user complaint`)
- [ ] Query 5 — deep-only word (semantic with literal overlap)
- [ ] Query 6 — empty bar

## Behavioral checklist

Independent of any specific query — verify the UI plumbing:

- [ ] Sidebar entry "Session search" is **visible** when `session-search-v2`
      is on for your org.
- [ ] Toggle the flag off in backoffice → sidebar entry disappears and
      navigating to `/projects/default-project/session-search/` directly
      redirects to `/search`.
- [ ] On a search with results, the "Matching traces" column renders a pill on
      every row whose session has a `searchMatches[sessionId]` entry. Counts
      match the expected table above.
- [ ] Expanding `qa-deep-20-1` shows ONLY the matching traces by default
      (count varies by query — e.g., 16 for `"refund"`, 9 for
      `` `dispute team` ``), with a full-width toggle row above them:
      `[⇅ Show N non-matching traces]` (count is the difference between
      total traces and matching). Clicking it reveals all 20 traces in
      ingestion order with non-matching traces dimmed to 50% opacity, and
      the toggle label flips to `[⇵ Hide N non-matching traces]`.
- [ ] Collapse `qa-deep-20-1`, then re-expand it: it starts again in the
      matches-only state (toggle reset on collapse).
- [ ] Top-level row click on a multi-trace session toggles expansion. (The
      `bestTraceId` field is still part of the search payload but isn't
      wired to the row click in the current UX — we land on expansion so
      the user can see all matches in context.)
- [ ] Expanded trace-row click on any specific trace opens the drawer on that
      `traceId` (regardless of match status, regardless of toggle state).
- [ ] Filter dropdown still works under search. E.g., apply
      `cost > 1_000_000` (microcents) and verify the result set narrows to
      sessions with cost-passing matching traces.
- [ ] Drawer prev/next walks every trace of the expanded session in
      ingestion order — matching AND non-matching, regardless of whether
      the table currently shows non-matching traces via the toggle row.
      (Heads-up: in the matches-only default view, pressing prev/next on
      a matching trace can land you on a non-matching trace that isn't
      visible in the table. Log if this feels confusing.)
- [ ] Selection: checking the `qa-refund-4-1` row's checkbox selects all 4 of
      its traces. Clicking export produces a CSV of all 4 trace rows (NOT
      filtered to matching ones — selection mirrors the Sessions tab today).
- [ ] Count string in the header: empty query → no count; filters only →
      `"N sessions"`; query active → `"N sessions · M matching traces"`.

## Highlights future work

The `qa-deep-20-1` fixture is engineered so that when
[`./specs/session-problems/5-search-highlights.md`](../../specs/session-problems/5-search-highlights.md)
Phase A ships (scroll-to-best-match inside the trace drawer), it serves as
the QA target. "refund" is first uttered at trace 5, again at trace 12, and
again at trace 18 — the three originating positions are far apart so a
20-trace session reads as a scroll-required session in the UI, and trace 12
has the densest refund language so it should be picked as the "best match"
by the highlight pipeline. When that work lands, the expected outcome is:
opening any matching trace's drawer from `qa-deep-20-1` lands **already
scrolled to the matching chunk** inside that trace's conversation, with the
chunk visually highlighted.

Neither today's `/search` nor the new `/session-search` has highlight
support yet — the trace-level subquery doesn't produce
`matched_chunk_index` / `matched_first_message_index` columns. The
session-search UI today flags matching traces by **hiding non-matching
traces in the expanded view by default**; that's a per-trace signal, not
a per-message-within-trace signal, so it doesn't help scroll-to-match
inside a specific trace. That's what the highlights spec is for.

## Cleanup

The QA sessions live in ClickHouse alongside real data. They age out
naturally via the per-plan retention TTL (default 90 days). For an immediate
hard delete during local dev:

```sql
-- Use chdb / your local ClickHouse client
ALTER TABLE spans DELETE WHERE session_id LIKE 'qa-%';
ALTER TABLE traces DELETE WHERE argMaxIfMerge(session_id) LIKE 'qa-%';
ALTER TABLE sessions DELETE WHERE session_id LIKE 'qa-%';
```

Don't run that in any shared / staging environment without scoping
`organization_id` too.

## When to re-run the script

- After a local DB wipe.
- After the trace-search worker indexes age out (30 days for embeddings, 90
  days for lexical) — the queries will progressively stop matching.
- After significant changes to the search pipeline (e.g., the highlight work)
  to re-validate everything in one pass.
