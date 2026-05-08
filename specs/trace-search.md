# Trace Search: Explicit Modes + Text Index

## Spec Contract

Redesign trace search around two explicit modes — quoted phrase match and free-text semantic similarity — backed by a ClickHouse 26.2 text index in place of ILIKE substring matching.

## Motivation

Trace search today blends lexical (`ILIKE %q%`) and semantic (Voyage cosine) into a single hybrid score. Three failure modes fall out of that design:

1. **Whitespace asymmetry.** The UI prettifies JSON parts on read (`prettifyCompactJson`), so users copy `"key": true` into the search bar. The indexed bytes are compact (`"key":true`). ILIKE substring match returns zero hits even though the field is in the doc.
2. **Boolean intent leaks into similarity.** A query like `"handOffToHuman": true` is a filter ("show me traces where this field is true"), not a similarity question. The semantic embedder cannot reliably distinguish `:true` from `:false` (one token apart in a sea of structural tokens), so results mix true and false matches.
3. **Heuristic intent detection is dark magic.** Any "infer mode from query shape" rule is a guess. Different shapes need different operators; the system should not be the one deciding.

The new model makes the user state intent. Quotes mean "match this phrase exactly." Everything else is semantic. The text index handles tokenization at the storage layer, so whitespace differences between query and index disappear without ad-hoc canonicalization regex on either side.

## Scope

In scope:

- ClickHouse 26.2 text index on `trace_search_documents.search_text` with `splitByNonAlpha` tokenizer and `lower()` preprocessor.
- Drop the legacy `tokenbf_v1` and `ngrambf_v1` indexes after a stability window.
- Query parser that extracts double-quoted phrase segments from raw user input, with lenient handling of unbalanced quotes.
- Rewrite of `buildLexicalSearchSubquery` to emit `hasPhrase` predicates.
- Rewrite of `buildHybridSearchSubquery` so the lexical side is a filter (not a scored contribution) and the semantic side is the only ranker.
- Search-bar placeholder text in `apps/web` updated to teach the syntax.

Out of scope (explicitly):

- Identifier tokenization (camelCase / snake_case → space-separated appendix on the indexed text). Independent patch; can land before, after, or never.
- Per-turn conversation chunking with multi-vector retrieval. Separate work targeting embedding recall on long agent traces.
- Customer-facing structured filters. The existing `tags` / `metadata` channels remain the right home for boolean filter queries; documenting that for customers is separate.
- Boolean operators in the search bar (`NOT "phrase"`, `OR`, etc.). Defer until a customer asks.
- Migration of historical indexed documents — the text index is built lazily; existing rows become searchable as the `MATERIALIZE INDEX` job completes.

## Design

### Quote semantics

Familiar pattern from Google / Slack / GitHub:

| Input | Behavior |
| --- | --- |
| `pricing complaint` | Pure semantic ranking. |
| `"handOffToHuman" "true"` | Both phrases must be present. No semantic ranking — pure filter. |
| `"property search" billing` | Phrase filter on `"property search"` AND semantic ranking on `billing`. |
| `"unmatched` | Unmatched leading quote → entire string (including the `"`) treated as free text; pure semantic. |
| `apple` | Pure semantic. (Users use `"apple"` for literal lookups.) |

### Query parser

A small utility, lives in `@domain/spans` next to the existing search constants:

```ts
interface ParsedSearchQuery {
  readonly phrases: readonly string[]   // each → hasPhrase predicate
  readonly semanticPrompt: string       // "" when only phrases were typed
}
export function parseSearchQuery(raw: string): ParsedSearchQuery
```

Rules:

- Extract every balanced `"..."` segment as a phrase. Empty phrases (`""`) are dropped.
- Whitespace separates phrases from free text and from each other.
- An unmatched leading or trailing quote is treated as literal: the quote character and the unparsed remainder become part of `semanticPrompt`. No syntax errors surfaced to the UI.

### ClickHouse text index

```sql
-- packages/platform/db-clickhouse/clickhouse/migrations/clustered/00011_text_index_search_documents.sql

ALTER TABLE trace_search_documents ON CLUSTER default
  ADD INDEX idx_search_text_text(search_text)
  TYPE text(
    tokenizer    = 'splitByNonAlpha',
    preprocessor = lower(search_text)
  ) GRANULARITY 1;

ALTER TABLE trace_search_documents ON CLUSTER default
  MATERIALIZE INDEX idx_search_text_text;
```

`splitByNonAlpha` discards every non-alphanumeric ASCII character as a separator. `{"handOffToHuman":true,"replyBody":null}` and `{"handOffToHuman": true, "replyBody": null}` produce the same token sequence (`handOffToHuman`, `true`, `replyBody`, `null`) — the whitespace asymmetry that originated this work cannot exist at the token layer.

`preprocessor = lower(search_text)` lowercases tokens at index time, so case-insensitive matching is free at query time without the manual `toLowerCase()` round-trip currently in `buildLexicalSearchSubquery`.

After a stability window, drop the legacy bloom-filter indexes:

```sql
ALTER TABLE trace_search_documents
  DROP INDEX idx_search_text_tokenbf,
  DROP INDEX idx_search_text_ngrambf;
```

### Query subqueries

`buildLexicalSearchSubquery({ phrases })` emits one `hasPhrase` predicate per phrase, AND-ed:

```sql
WHERE organization_id = {organizationId:String}
  AND project_id      = {projectId:String}
  AND hasPhrase(search_text, {phrase0:String})
  AND hasPhrase(search_text, {phrase1:String})
```

`buildHybridSearchSubquery({ phrases, semanticPrompt })` collapses to one of four shapes:

| Phrases | Semantic | Behavior |
| --- | --- | --- |
| 0 | empty | No search predicate. Catalog list. |
| ≥1 | empty | Pure lexical filter. No relevance ordering. |
| 0 | non-empty | Pure semantic ranking + relevance floor (current behavior). |
| ≥1 | non-empty | Lexical filter; semantic ranker within the filtered set. |

`HYBRID_SEARCH_CONFIG.lexicalWeight` / `semanticWeight` are removed. The lexical side is now a binary filter, not a scored contribution. `TRACE_SEARCH_MIN_RELEVANCE_SCORE` stays as the semantic-only floor.

### UI

Search-bar placeholder text becomes: `Search by meaning. Use "quotes" for an exact phrase.`

A small inline help affordance (`?` button or tooltip) links to a one-paragraph doc page documenting the syntax.

### What does not change

- The document indexer (`build-trace-search-document.ts`) and its `searchText` shape.
- Voyage embedding pipeline, model choice, dimensions, or budget gating.
- Embedding TTL / document TTL.
- Identifier tokenization (independent).

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 — Schema migration

- [x] **P1-1**: Validate text-index features against the upgraded local CH 26.2 container. Confirm `system.settings` shows no `experimental_*` flag gating, that `ALTER ... ADD INDEX TYPE text(...)` succeeds on the existing replicated table shape, and that `preprocessor = lower(col)` is the working syntax. (Verified on 26.2.1.235 cloud and 26.2.17.31 Docker; `enable_full_text_index` and `allow_experimental_full_text_index` already on by default. `hasPhrase` was added in **26.4** (PR ClickHouse/ClickHouse#101997) — it is **not** available on prod's 26.2, so the implementation uses `hasTokenCaseInsensitive` AND-ed across phrase tokens. Trade-off: token-bag match instead of contiguous-tokens match for multi-token phrases. Exact for the LAT-562 motivating case (single-token phrases like `"handOffToHuman"` and `"true"`); when prod upgrades to 26.4+, swap the predicate generator over to `hasPhrase` to recover phrase-order semantics.)
- [x] **P1-2**: Author migration `00012_text_index_search_documents.sql` via `pnpm --filter @platform/db-clickhouse ch:create text_index_search_documents`. Add the `text` index and the `MATERIALIZE INDEX` statement. (Numbered 00012, not 00011, since `00011_plan_aware_retention.sql` had already landed on `development` by the time this spec was implemented.)
- [x] **P1-3**: Run migration locally; verify with sample `hasTokenCaseInsensitive(search_text, '...')` queries that match the expected trace counts pulled via the MCP for the LAT-562 repro project.

**Exit gate**: migration runs cleanly on a fresh CH and on a CH already populated with the prior schema; `hasPhrase` returns the expected set against real data.

### Phase 2 — Query parser + repo rewrite

- [x] **P2-1**: Implement `parseSearchQuery(raw)` in `@domain/spans` with the parser rules above. Pure function; no I/O.
- [x] **P2-2**: Tests for the parser: empty input, single phrase, multiple phrases, mixed, unbalanced trailing quote, unbalanced leading quote, empty phrase (`""`).
- [x] **P2-3**: Rewrite `buildLexicalSearchSubquery` in `trace-repository.ts` to consume `phrases` and emit AND-ed token predicates with parameter binding. (Uses `hasTokenCaseInsensitive` per token — see P1-1.)
- [x] **P2-4**: Replace `buildHybridSearchSubquery` with `buildSearchPlan` that dispatches on `(phrases.length, semanticPrompt)` per the table above. The weighted-score formula and the `HYBRID_SEARCH_CONFIG` constant are removed. The plan carries a `ranked` flag so callers know whether to ORDER BY relevance or by the default sort.
- [x] **P2-5**: `listByProjectId` (and `countByProjectId`, `findLastTraceAt`, `countAnnotatedByProjectId`, `aggregateMetricsByProjectId`, `histogramByProjectId`) parse `searchQuery` once and feed the parsed structure plus the (optional) embedding into `buildSearchPlan`. The embedder is only called when `semanticPrompt` is non-empty — phrase-only queries never round-trip to Voyage.
- [x] **P2-6**: `trace-repository.test.ts` now exercises all four query shapes (phrase-only, semantic-only, hybrid, multi-token phrase) plus the LAT-562 whitespace-asymmetry regression and a list/count/metrics/histogram consistency check on the phrase-only path.

**Exit gate**: existing search-related tests pass; new tests assert each of the four query-shape combinations; the lexical side no longer contributes a numeric score in the explain plan.

### Phase 3 — UI

- [x] **P3-1**: Update the search-bar placeholder in the trace-search route in `apps/web` to the new text.
- [ ] **P3-2**: Add an inline help affordance with a one-paragraph syntax explainer (placement TBD with design).

**Exit gate**: a user landing on the trace-search page sees the new placeholder; the help affordance is reachable.

### Phase 4 — Legacy index cleanup

- [ ] **P4-1**: Run the new path against production for a stability window (one week of clean traffic, no regressions reported, sample queries match expected behavior).
- [ ] **P4-2**: Author migration `00012_drop_legacy_search_indexes.sql` dropping `idx_search_text_tokenbf` and `idx_search_text_ngrambf`.
- [ ] **P4-3**: Update the leading comment block in `00009_trace_search_documents.sql` (or supersede it via a comment in the new migration) to reflect the text-index path as the lexical backend.

**Exit gate**: legacy bloom-filter indexes are gone from production; storage footprint of `trace_search_documents` reflects the swap.

## Open Items

- Whether to gate the cutover behind a per-org feature flag or hard-cut after staging validation. Default: hard-cut.
- Whether to expose a `-"phrase"` exclusion operator in v1. Defer unless explicitly requested.
- Whether snake_case identifier searchability (e.g., querying `search_properties` as one token) is enough of a regression to justify a custom `splitByString` separator list. Decided after observing real query patterns post-launch; default is to accept the loss.
