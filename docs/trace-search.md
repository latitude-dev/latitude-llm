# Trace Search

Full-text and semantic search over trace conversations, served alongside the existing trace list. Users type a natural-language query in the traces page and see the most relevant traces, ranked by a hybrid lexical + semantic score computed entirely in ClickHouse. Search behaves like any other filter column: single query, cursor-paginable, composable with `sortBy` and `FilterSet`.

## Scope

- **Trace-only.** Not session-level, not span-level.
- **Forward-only.** Only traces indexed after rollout are searchable by default. No first-class customer backfill in the product UI.
- **Input/output content only.** System prompts, system instructions, and tool-result bodies are excluded from the searchable document. Tool call *names* are preserved as light metadata.
- **Time-bounded.** Both lexical documents and semantic embeddings age out via ClickHouse `TTL` — 90 days for documents, 30 days for embeddings. No per-project size cap.

## Data Model

Two ClickHouse tables hold the searchable corpus. Both are `ReplacingMergeTree` partitioned by month of `start_time`. Documents use `(organization_id, project_id, trace_id)` as the logical primary key; embeddings add `chunk_index` so each trace can carry multiple vector rows.

### `trace_search_documents`

Lexical index. One row per searchable trace.

Key columns:

- `search_text` — normalized UTF-8 document built from user + assistant message text, truncated to `TRACE_SEARCH_DOCUMENT_MAX_LENGTH` (20,000 chars).
- `root_span_name` — metadata boost for lexical ranking.
- `content_hash` — SHA-256 of document content, used for dedup on re-ingest.
- `indexed_at` — version column for `ReplacingMergeTree`.

Secondary indexes on `search_text`:

- `tokenbf_v1(32768, 3, 0)` for token/word lookup.
- `ngrambf_v1(3, 512, 3, 0)` for substring inclusion.
- `TYPE text(tokenizer = 'splitByNonAlpha', preprocessor = lower(search_text))` for token-set lookup.

Literal substring filters use case-sensitive `LIKE`, which can be assisted by the n-gram bloom filter. Backtick token-phrase filters are lower-cased to match the text-index preprocessor, then use `hasAllTokens` to hit the text index before the query checks token adjacency with `hasSubstr(tokens(lower(...)), ...)`.

Retention: `TTL start_time + INTERVAL 90 DAY DELETE`.

### `trace_search_embeddings`

Semantic index. One row per **chunk** (packed conversation turns / long-turn slices) that passed the per-chunk size floor and was embedded. `ReplacingMergeTree` is keyed by `(organization_id, project_id, trace_id, chunk_index)` so each slice versions independently.

Key columns:

- `chunk_index` — 0-based index within the trace's packed chunk list (part of the dedup key with `content_hash`).
- `embedding` — `Array(Float32)`. Dimension set by `TRACE_SEARCH_EMBEDDING_DIMENSIONS` (currently 2048 for `voyage-4-large`).
- `embedding_model` — identifier string (e.g. `"voyage-4-large"`). A future model/dimension swap would need to either drop-and-rebuild the table (forward-only rollout makes this cheap) or reintroduce a dim filter at query time.
- `content_hash` — SHA-256 of that chunk's normalized text; lets the worker skip re-embedding unchanged slices (distinct from the lexical document hash, which covers the whole trace string).
- `indexed_at`, `start_time`, `organization_id`, `project_id`, `trace_id`.

Retention: `TTL start_time + INTERVAL 30 DAY DELETE`. Shorter than documents because embeddings are the expensive side (Voyage credits + vector bytes) and the lexical fallback keeps recently-evicted traces discoverable.

## Indexing Pipeline

Indexing is driven entirely by the existing trace-end debounce boundary — there is no separate stream.

1. `trace-end:run` completes for a trace.
2. The handler publishes `trace-search:refreshTrace` with `(organizationId, projectId, traceId, startTime, rootSpanName)`.
3. The trace-search worker (`apps/workers/src/workers/trace-search.ts`) picks up the task.
4. The worker loads span input/output messages from ClickHouse and builds the canonical document via `buildTraceSearchDocument`.
5. The lexical document is upserted to `trace_search_documents` unconditionally.
6. Semantic-indexing decision (per chunk):
   - Build `chunks` from `buildTraceSearchDocument` (head+tail turn selection when the trace exceeds the char budget, then greedy packing / long-turn slicing).
   - Drop chunks shorter than `TRACE_SEARCH_EMBEDDING_MIN_LENGTH` (100 chars). If none remain, skip semantic indexing for the trace.
   - For each remaining chunk, `hasEmbeddingWithHash` on `(trace_id, chunk_index, content_hash)` skips unchanged slices.
   - Otherwise call Voyage `embed` with `inputType: "document"` and upsert **one row per chunk** into `trace_search_embeddings`. Org-level token budgets can stop the loop early; the lexical row was already written.

The worker is best-effort: any error in the pipeline is logged and swallowed via `Effect.orElseSucceed(() => undefined)` — a single failing trace never retries the whole job queue.

### Document construction

`buildTraceSearchDocument` (in `packages/domain/spans/src/use-cases/`) produces a flat text document from a trace's messages. The rules, in order:

- **Role gate.** Only `user` and `assistant` messages are emitted. `system` is excluded entirely.
- **Part handling:**
  - `text` → raw string content.
  - `reasoning` → excluded (not indexed for lexical or chunks).
  - `tool_call` → `[TOOL CALL: <name>]`. Name is preserved as a signal; arguments are dropped.
  - `tool_call_response` → empty. Tool result payloads (JSON, errors) are not searchable in any meaningful way and the literal `[TOOL RESULT]` placeholder was actively harming embedding quality.
  - `blob` → `[IMAGE]` / `[VIDEO]` / `[AUDIO]` / `[BLOB:<modality>]`.
  - `file`, `uri` → labeled placeholders carrying the relevant identifier where useful.
  - Unknown part types → empty. We deliberately don't emit `[<unknown-type>]` labels because untyped tokens feed noise into embeddings.
- **Lexical vs chunks.** `search_text` is built from **every** turn (joined, whitespace-normalized, then middle-truncated when over `TRACE_SEARCH_DOCUMENT_MAX_LENGTH`). Embedding `chunks` apply the same turn budget first, then greedy packing / long-turn slicing — so long traces can omit middle turns from vectors while the lexical row still reflects the full conversation up to the char cap.
- **Content hash (document).** SHA-256 of `traceId + "\0" + searchText` via `@repo/utils` `hash`, used as the lexical `ReplacingMergeTree` dedup key. Per-chunk hashes are separate and gate re-embedding per slice.

## Query Pipeline

Active search adds a single CH query with cursor-based pagination on the trace list, mirroring the shape of the non-search list path. `count`, `metrics`, and `histogram` use the same search-plan subquery as a filter (`trace_id IN (SELECT trace_id FROM <plan>)`), so aggregate numbers agree with the list without drift.

### Search plan (literal filters, token-phrase filters, semantic prompt, or a mix)

`parseSearchQuery` splits the search bar input into three independent parts:

- **Semantic prompt**: unquoted text. This is embedded with Voyage and used for semantic ranking.
- **Literal phrases**: double-quoted text (`"..."`). Each literal phrase is normalized the same way as stored `search_text` and becomes a case-sensitive `LIKE` substring filter. `%`, `_`, and backslashes are escaped before building the parameterized pattern.
- **Token phrases**: backtick text (`` `...` ``). Each token phrase is lower-cased and tokenized with the same `splitByNonAlpha` shape as the ClickHouse text index. ClickHouse 26.2 does not expose `hasPhrase`, so the query combines indexed `hasAllTokens(search_text, tokens)` with `hasSubstr(tokens(lower(search_text), 'splitByNonAlpha'), tokens)` to enforce adjacency and order.

`buildSearchPlan` in `trace-repository.ts` picks one of three shapes:

- **Lexical only** (`ranked = false`). Literal and token-phrase filters are AND-ed together against `trace_search_documents`. Results keep the caller's normal chronological sort.
- **Semantic only** (`ranked = true`). The inner scan ranks **chunk rows** by cosine similarity, `ORDER BY semantic_score DESC LIMIT SEMANTIC_SCAN_LIMIT`, then rolls up with `max(semantic_score) GROUP BY trace_id` so each trace's score is its best-matching chunk. A `WHERE semantic_score >= TRACE_SEARCH_MIN_RELEVANCE_SCORE` gate drops noise on pure semantic queries.
- **Hybrid** (`ranked = true`). Lexical filters on `trace_search_documents` (precision) `LEFT JOIN` the per-trace semantic rollup. Lexical matches without embeddings stay in with `relevance_score = 0.0`; the floor is **not** re-applied so lexical precision is not lost.

For this query:

```txt
refund "handOffToHuman: true" `human-annotation`
```

The literal filter requires the exact `handOffToHuman: true` substring, the token-phrase filter requires adjacent ordered `human`/`annotation` tokens, and the semantic prompt `refund` ranks the filtered traces.

The lexical document is always built from the **full** normalized conversation string in `buildTraceSearchDocument` (`search_text`), independent of which turns were packed into embedding chunks.

### List query — cursor-paginable

```sql
WITH search_results AS (
  SELECT trace_id, relevance_score FROM (<hybrid subquery>)
)
SELECT <LIST_SELECT>, search_results.relevance_score
FROM traces t
INNER JOIN search_results ON t.trace_id = search_results.trace_id
WHERE t.organization_id = :org
  AND t.project_id = :proj
  <extra WHERE from FilterSet>
  <cursor: AND (search_results.relevance_score, t.trace_id) < (:cursorScore, :cursorTraceId)>
GROUP BY t.organization_id, t.project_id, t.trace_id, search_results.relevance_score
<HAVING from FilterSet>
ORDER BY search_results.relevance_score DESC, t.trace_id DESC
LIMIT :pageSize
```

Cursor pagination on the tuple `(relevance_score, trace_id)` gives a stable, infinite-scroll ordering. The page size is `BATCH_SIZE = 50`; the query fetches `50 + 1` to compute `hasMore`.

### Ordering policy

When `searchQuery` is present, results are ordered by `relevance_score DESC` regardless of the client-side `sortBy` choice. This follows the original plan's stated default of "when searchQuery is present, the default ordering is relevance" — and matches user intent: if you typed a query, you want the most relevant traces first, not the most recent. Column-header sort clicks during active search still update `sortBy` in URL state but the effective server ordering stays relevance-first.

### Query-time embedding

Each search generates a query-side embedding with Voyage `voyage-4-large`, `input_type: "query"`. The asymmetric input type is important: indexing uses `"document"`, querying uses `"query"`. Mismatched input types silently degrade retrieval quality (~15% in testing pre-fix).

The embed result is cached in Redis via `withAICache` keyed on `(text, model, dimensions, inputType)`. The first of the four React Query hooks (list, count, metrics, histogram) to fire pays the Voyage round-trip; the other three get cached hits.

## Decisions & Tradeoffs

This section records the durable choices that shaped the feature. Future contributors should understand the "why" — many of these choices were reached after experimentation (rerank was tried and removed; the per-project cap was shipped and later dropped).

### Why ClickHouse for semantic search

The plan explicitly rejected introducing a new database (Weaviate, Pinecone, pgvector). Trace search had to share the existing trace query pipeline so lexical results, filters, and aggregates stay consistent. ClickHouse gives us `cosineDistance` and vector-column storage out of the box; at realistic per-project scale linear scan is fast enough.

### Why `UNION ALL + GROUP BY` instead of `FULL OUTER JOIN`

The first version used `FULL OUTER JOIN` with `coalesce(l.trace_id, s.trace_id)`. ClickHouse fills the miss side of an outer join with the column's **default value** (zero bytes for `FixedString`, empty string for `String`), not SQL `NULL`. `coalesce` kept the zero bytes, and the downstream inner join against `traces` matched nothing — silent "no results" for every semantic-only query. `UNION ALL + GROUP BY trace_id` with `MAX()` aggregates avoids the problem entirely.

### Why `voyage-4-large` at 2048 dims

- **Retrieval quality.** Voyage-4-large cleanly separates semantically-related traces from noise on paraphrase queries ("user complaining"), without a cross-encoder rerank step. The top 30 results by cosine similarity are consistently real matches; noise starts around rank 200. This is the quality that made rerank removable.
- **Cost.** 200M-free-tokens/month covers Small and Medium tenants entirely. Large is ~$7.50/mo, XL is ~$291/mo (see Cost & Performance).
- **Storage.** 2048 × 4 bytes = 8 KB/row uncompressed, ~6 KB with ZSTD. Trivial at realistic scales.
- **Codebase consistency.** The `@domain/issues` centroid system already uses `voyage-4-large`; using the same model across features keeps the account surface single-tier.

### Why no cross-encoder rerank

Rerank was tried in an intermediate iteration to compensate for `voyage-3-lite`'s poor paraphrase retrieval. It worked, but:

- Rerank's 100-candidate cap meant search results were hard-capped at 100 *total*. No pagination past page 2.
- Rerank scores aren't stable across independent API calls, so paginating by fetching "next 100 candidates" and reranking them independently produces inconsistent orderings.
- Upgrading to `voyage-4-large` closed enough of the bi-encoder/cross-encoder quality gap that rerank's remaining marginal benefit didn't justify the rigidity.
- Dropping rerank let the query path collapse back to a single cursor-paginable SQL query — the same shape as every other filter in the app.

### Why `TRACE_SEARCH_MIN_RELEVANCE_SCORE = 0.30`

Per-chunk embeddings `max`-pool per trace, which sharpens cosine scores versus the old single-vector-per-trace mean. The floor applies **after** that rollup on **pure semantic** queries (hybrid deliberately skips the floor on the joined score).

The value was re-tuned on the seeded Acme corpus (2026-05-08): nonsense queries top out around 0.29 cosine while real matches start around 0.37+, so `0.30` sits in the gap. Revisit if the production noise/signal distribution shifts (model swap, prompt mix change).

### Why no per-project cap

The original design capped embeddings to 10,000 rows per project with a periodic cleanup worker. Analysis showed:

- Cost scales linearly with trace volume and is trivial at any realistic scale (~$7.50/mo for 500k traces).
- ClickHouse storage for embeddings is negligible (~2 GB for 500k traces at 2048 dims).
- The real concern at high volume is **query latency**, not cost — a single project with millions of embeddings does a multi-second linear scan.

TTL alone handles "recency bias" and "storage ceiling" cleanly, with no cleanup worker to maintain. Latency risk is deferred to the "add HNSW" future work item; realistic customer projects stay well under 1M embeddings in any 30-day window.

## Constraints & Limitations

### Forward-only rollout

There is no backfill path. Traces that completed before the worker started running are invisible to search. Re-enqueuing `trace-search:refreshTrace` for historical traces works mechanically but is not a sanctioned production procedure. If a customer asks for historical search, treat it as a separate feature.

### Literal and token-phrase matching have different precision/performance tradeoffs

Double-quoted literals use case-sensitive `LIKE` over normalized `search_text`. This matches copy-pasted text closely and can use the existing n-gram bloom-filter index, but it does not ignore punctuation differences.

Backtick token phrases use `hasAllTokens` as an indexed prefilter and `hasSubstr(tokens(lower(...)), ...)` as the ordered-adjacency check. This approximates phrase search on ClickHouse 26.2: case, punctuation, and whitespace differences are ignored, but the tokens must stay adjacent and in order. It is not a relevance scorer; it is a boolean filter.

### Semantic scan is linear over the embeddings table

`cosineDistance` is computed for every row matching `(org_id, project_id, dim)`. Scan time grows linearly with per-project embedding count:

| Embeddings in project | Approx scan time |
|---|---|
| < 100k | instant |
| 500k | ~300ms |
| 1M+ | > 500ms |
| 5M+ | unusable |

Above ~1M per project, you'd want the `vector_similarity` HNSW index — listed in Future Work. This is the main scaling concern, not cost.

### Silent failure modes

The query path is failure-tolerant by design:

- Query embedding errors → fallback to lexical-only.
- Worker-side embedding errors → trace is lexical-only.

These choices protect availability but mean partial degradation can happen without user-visible signals. Logging exists for each path; observability dashboards watching query-embedding failure rate would be the right follow-up.

### Threshold is global

`TRACE_SEARCH_MIN_RELEVANCE_SCORE` is a single value. A model upgrade (different cosine distribution) requires retuning. Keep a benchmark corpus around for this.

## Cost & Performance

Numbers assume an average `search_text` of 3,000 chars (~750 tokens) and ~70% of traces passing the size floor. Voyage-4-large at $0.12/1M tokens with a 200M-free-tokens/month allowance.

| Profile | Traces/mo | Searches/mo | Indexing | **Total Voyage/mo** |
|---|---|---|---|---|
| Small | 5,000 | 100 | free (within 200M) | **$0** |
| Medium | 50,000 | 1,000 | free (within 200M) | **$0** |
| Large | 500,000 | 10,000 | 63M paid × $0.12/1M | **~$7.50** |
| Extra Large | 5,000,000 | 25,000 | 2.4B paid × $0.12/1M | **~$291** |

- Query-side Voyage cost is effectively $0 at every scale (first-hit only, cached in Redis).
- ClickHouse storage is ~20 GB for XL, negligible below.
- Latency p95 is dominated by semantic scan time: ~50ms at Small/Medium, ~350ms at Large, multi-second at XL without HNSW.

For XL cost reduction, the knobs are:

- **Downgrade to `voyage-4` (1024d)**: $0.06/1M rate; XL indexing drops to ~$144/mo. Slight quality tradeoff.
- **Voyage-4-large at 1024d via Matryoshka**: same model, same cost, half the storage and scan time. No quality regression worth worrying about.

## Configuration Reference

All constants live in `packages/domain/spans/src/constants.ts`.

| Constant | Value | Purpose |
|---|---|---|
| `TRACE_SEARCH_DOCUMENT_MAX_LENGTH` | 20,000 | Per-trace `search_text` truncation ceiling |
| `TRACE_SEARCH_EMBEDDING_MIN_LENGTH` | 100 | Min `search_text` length to be embedded |
| `TRACE_SEARCH_EMBEDDING_MODEL` | `voyage-4-large` | Voyage embedding model |
| `TRACE_SEARCH_EMBEDDING_DIMENSIONS` | 2048 | Vector dimension |
| `TRACE_SEARCH_EMBEDDING_LOOKBACK_DAYS` | 30 | Embedding TTL (enforced in migration) |
| `TRACE_SEARCH_DOCUMENT_LOOKBACK_DAYS` | 90 | Document TTL (enforced in migration) |
| `TRACE_SEARCH_MIN_RELEVANCE_SCORE` | 0.30 | Pure-semantic noise gate after per-trace max over chunk cosines |

Hybrid ranking does not blend fixed lexical/semantic weights in SQL; lexical acts as a filter (and optional rank signal via the join) while semantic supplies cosine when present.

## Future Work

In rough priority order. None are on the near-term roadmap.

### HNSW vector similarity index

ClickHouse supports `vector_similarity` indexes (experimental, HNSW). At project scales below ~500k embeddings, linear scan is fast enough. Above that, latency becomes user-visible. Adding the index is a migration-only change and future-proofs the query path against high-volume tenants.

### Subscription-plan knobs

Several constants will likely become tenant-tiered:

- `TRACE_SEARCH_EMBEDDING_MODEL` — enterprise gets voyage-4-large (2048d); pro gets voyage-4 (1024d); free gets voyage-4-lite.
- `TRACE_SEARCH_MIN_RELEVANCE_SCORE` — could be per-tier if precision/recall tradeoffs differ.
- Per-project retention days (current 30-day embedding TTL could stretch for higher tiers).

The shape is a resolver port (`SubscriptionPlanResolver` or similar) that takes an `organizationId` and returns the resolved knob values. No per-row schema change needed.

### Native phrase search

ClickHouse 26.2 has the `TYPE text` index and token-set functions used by trace search, but it does not expose the `hasPhrase` query shape needed for native ordered phrase matching. Backtick token-phrase search currently approximates that behavior with `hasAllTokens` plus `hasSubstr(tokens(...), ...)`. If a future ClickHouse version exposes a compatible indexed phrase function, replace the two-step predicate with the native phrase predicate.

### Session-level search

Excluded from V1 but reasonable to reconsider. Designing session search as a separate index (on rolled-up session content) rather than layering it onto trace search would keep the query paths independent and avoid implicit coupling.

### Observability

- Search-side: p95 latency, query-embedding cache hit rate, result count distribution, HAVING-floor filter rate.
- Indexing-side: embed skip rate by reason (size floor vs hash dedup vs Voyage error), per-project embedding row count, TTL-evicted row count.
- None of this exists today; the original plan's Phase 4 added basic logging but no dashboards.

### Historical backfill path

If a customer-facing feature ever needs to cover pre-rollout traces, the backfill pattern is known (enqueue `trace-search:refreshTrace` per historical trace) but would need rate limiting, cost estimation upfront, and a way to signal progress.
