# Search highlights

## Goal

When a user opens a trace from the search page, the trace detail drawer should:

1. **Highlight** the spans of conversation text that explain why this trace matched the search.
2. **Scroll to the first occurrence** on open.
3. Allow stepping through matches with `N` / `P` (Next / Previous) — reusing the existing `ScrollNavigator`.
4. Use **distinct colors per match kind** so the user can tell at a glance whether a hit was literal, token-phrase, or semantic.
5. Support **click-to-explain**: clicking a highlight opens a small popover saying *why* this segment is highlighted (which phrase, which chunk, what score).

This applies to the trace search drawer. The same shape will inform the future Issues panel once `issue discovery` lands on Postgres (`pgvector` + `tsvector`), where the lexical side gains free highlighting via `ts_headline` but the semantic side has the same gap as traces.

## Search types we support today

Source of truth: `parseSearchQuery` (`packages/domain/spans/src/use-cases/parse-search-query.ts:31`) and `buildSearchPlan` (`packages/platform/db-clickhouse/src/repositories/trace-repository.ts:218`).

| Kind | Syntax | Semantics | Backing index |
|---|---|---|---|
| **Literal** | `"…"` | Case-sensitive exact substring | `trace_search_documents.search_text`, indexed `LIKE %phrase%` |
| **Token phrase** | `` `…` `` | Lowercased, ordered token adjacency (case- and punctuation-insensitive) | `trace_search_documents` via `hasAllTokens` prefilter + `hasSubstr(tokens(lower(search_text)))` |
| **Semantic** | bare text | Natural-language meaning match | `trace_search_embeddings` (one row per chunk), Voyage embedding + cosine, rolled up per-trace via `max(score)` |

These compose into three concrete plans:

- **Phrase-only** — pure filter, no ranking
- **Semantic-only** — ranked by cosine score, with a minimum relevance floor
- **Hybrid** — phrases narrow the candidate set, semantic ranks survivors; the relevance floor is dropped because the phrase filter is the precision gate

## Current pipeline — what reaches the drawer

```
SearchInput (search/index.tsx)
  └─ q (string)
       └─ useTracesCount / useTracesInfiniteScroll
            └─ listTracesByProject / countTracesByProject (server fn)
                 └─ TraceRepository.listByProjectId
                      └─ buildSearchPlan → ClickHouse subquery
                           └─ trace_search_documents (lexical)
                           └─ trace_search_embeddings (semantic)
       └─ TracesView → user clicks a row →
            getTraceDetail (server fn)
                 └─ TraceDetailRecord { allMessages, inputMessages, outputMessages, systemInstructions }
                      └─ TraceDetailDrawer
                           └─ ConversationTab
                                └─ <Conversation messages highlightRanges /> ← already supports highlights
```

Once `2-session-level-search.md` lands, the search page swaps `TracesView` for
`SessionsView` and the same `q` flows through a session-rollup CTE. The
click target is now the **session panel** (per `./6-session-panel.md`), not
the trace drawer directly. The panel renders one trace's conversation at
a time using the same `<Conversation>` primitive the trace drawer uses,
so the highlight pipeline still operates per-trace — it just renders
inside the panel's Conversation tab instead of the standalone drawer:

```
SearchInput (search/index.tsx)
  └─ q (string)
       └─ useSessionsCount / useSessionsInfiniteScroll
            └─ listSessionsByProject / countSessionsByProject (server fn)
                 └─ SessionRepository.listByProjectId
                      └─ buildSearchPlan → ClickHouse subquery (trace-level, reused)
                           └─ trace_search_documents (lexical)
                           └─ trace_search_embeddings (semantic)
                      └─ trace_rollup CTE → GROUP BY session_id
                           └─ best_score, best_trace_id,
                              matching_trace_ids, matching_trace_scores
       └─ SessionsView → user clicks a session row
            ├─ Row expands inline (for multi-trace sessions) — matching
            │  trace rows in the expansion get a hit-count badge sorted by
            │  matching_trace_scores
            └─ Session panel opens with currentTraceId = matching_trace_ids[0]
                 └─ getSessionDetail(sessionId)            ─┐  ← session metadata for the header
                 └─ getTraceDetail(currentTraceId)         ─┤
                 └─ getTraceSearchHighlights(             ─┴─→ SessionDetailDrawer
                      currentTraceId, q)                        └─ ConversationTab
                      ↑                                              └─ <Conversation … />
                      │
                      └── re-fired when the user clicks a different matching
                          trace row in the sessions-list row expansion behind
                          the panel — the expansion is the trace navigator
                          (see "Session-level result behavior" below)
```

What's **computed but discarded** before the drawer:

| Signal | Computed? | Reaches drawer? |
|---|---|---|
| `relevance_score` per trace | yes (semantic / hybrid) | **No** — dropped at `toTraceRecord` (`apps/web/src/domains/traces/traces.functions.ts:65`) |
| Winning chunk index (semantic) | implicit via `max-arg`, not preserved | No — `max(...) GROUP BY trace_id` collapses it |
| Per-phrase / per-substring offsets (lexical) | not computed | No |
| Per-message provenance | not computed | No — `trace_search_documents.search_text` is normalized whitespace, system-stripped, reasoning-stripped; offsets don't map to `allMessages` |
| `matching_trace_ids: Array(UUID)` per session | yes, after rollup (`2-session-level-search.md` §4.1) | **Must reach the drawer** — it's the navigation set for cross-trace N/P (see "Session-level result behavior") |
| `matching_trace_scores: Array(Float32)` per session | yes, sorted aligned with `matching_trace_ids` | **Must reach the drawer** — drives which trace is "primary" and tie-breaks the N/P order |
| `best_trace_id` per session | yes (`argMax(trace_id, relevance_score)`) | **Yes** — it's the `traceId` the drawer opens on for a session click |

The drawer **does not know `searchQuery` exists** today. `getTraceDetail` doesn't take it.

## UI primitives already in place

The drawer's conversation tab can render highlights with zero changes to the rendering pipeline:

- **`HighlightRange = { messageIndex, partIndex, startOffset, endOffset, type, … }`**
  (`packages/ui/src/components/genai-conversation/text-selection.tsx:13`)
- **`sourceMappedTextPlugin`** — rehype plugin that splits markdown text nodes on highlight boundaries and tags each segment with `data-source-start` + `data-source-end` + `data-annotation-id` (or equivalent).
  (`packages/ui/src/components/genai-conversation/parts/source-mapped-text-plugin.ts`)
- **`highlightAttributes`** — class/data-attr lookup keyed on `HighlightRange["type"]`. Currently knows `"selection"` (yellow) and `"annotation"` (red/emerald/blue per pass-state).
  (`packages/ui/src/components/genai-conversation/parts/highlight-segments.ts:78`)
- **`ScrollNavigator`** + `navItemRefs` — already wired to the `N`/`P` hotkeys in the conversation tab. Today it steps through message blocks; it can be parameterized to step through any DOM nodes.
  (`.../trace-detail-drawer/tabs/conversation-tab.tsx:64-75`, `:185-199`)
- **Click affordance** — `onAnnotationClick` already routes clicks from highlighted spans via `data-annotation-id`. The same wire can carry search clicks.

### Existing performance cap that constrains the highlight design

The conversation renderer caps each part at **`LARGE_MARKDOWN_CONTENT_THRESHOLD = 20_000` chars** (`packages/utils/src/json-format.ts:7`). Above that threshold, `MarkdownContent` (`packages/ui/src/components/genai-conversation/parts/markdown-content.tsx:139-164`) splits the part into **head + collapsed middle + tail**. The middle is **not in the DOM** until the user clicks `Show N more characters`.

Three consequences for highlights:

1. **Per-part highlight count is naturally bounded** by the rendered head + tail size. The rehype plugin only sees content we've decided to render, so adding highlights doesn't multiply the cost.
2. **Highlights inside the collapsed middle won't render** unless we react to that. This is the actual UX risk — not "too many highlights", but "hidden highlights" (see Resolved decisions).
3. **No highlights of any kind render in oversized parts today — pre-existing gap.** In the oversized branch (`markdown-content.tsx:139-164`), head / middle / tail are rendered through `MarkdownBody` (`markdown-content.tsx:105`), which does **not** receive `sourceMappedTextPlugin(highlights)` — only `rehypeHighlightPlugin`. Even if it did, `sourceMappedTextPlugin` reads `position?.start?.offset` from the rehype tree, which is **local to the rendered slice string** (head is `0..headCut`, tail is `0..tail.length`, *not* `(content.length - tail.length)..content.length`). Highlight ranges however carry offsets into the **full original part text**. So today: any annotation or selection that lands in an oversized part silently drops out of view — search highlights would inherit the same bug. The fix is in Phase A scope; see "Oversized-part offset fix" below.

## Design

### Single unified `getTraceSearchHighlights` endpoint

One server function returns *all* highlights regardless of match kind. Server is the source of truth for parsing, tokenization, and chunk metadata; client only renders.

Kept **separate** from `getTraceDetail`:
- The drawer opens from many places (no query, prev/next trace nav, deep links). Coupling highlights into the detail endpoint forces stale-cache invalidation on every query change.
- The detail endpoint stays usable by callers that don't care about search.
- React Query keys cleanly: `["traceDetail", traceId]` and `["traceSearchHighlights", traceId, q]`.

#### Contract

```ts
// apps/web/src/domains/traces/traces.functions.ts
export const getTraceSearchHighlights = createServerFn({ method: "GET" })
  .inputValidator(z.object({
    projectId: z.string(),
    traceId: z.string(),
    searchQuery: z.string().max(500),
  }))
  .handler(async ({ data }): Promise<TraceSearchHighlightsResult> => { /* … */ })

interface TraceHighlight {
  readonly messageIndex: number
  readonly partIndex: number
  readonly startOffset: number
  readonly endOffset: number
  /**
   * Render-side discriminator — extends `HighlightRange["type"]` in
   * `packages/ui/src/components/genai-conversation/text-selection.tsx`.
   * Values use the `"search-"` prefix to namespace them from existing
   * highlight types ("selection", "annotation"). The renderer picks the
   * class/styling for each from `highlightAttributes`.
   */
  readonly type: "search-literal" | "search-token" | "search-semantic-region"
  /**
   * Metadata about which match produced this highlight. Independent of
   * the render-side `type` above — `source.kind` is the categorical
   * meaning of the match ("a literal phrase matched"); `type` is what
   * the renderer dispatches on. They share the same trichotomy
   * (literal / token / semantic-region) without the `"search-"` prefix.
   */
  readonly source:
    | { kind: "literal"; phrase: string }
    | { kind: "token"; phrase: string; matchedTokens: readonly string[] }
    | { kind: "semantic-region"; chunkIndex: number; score: number }
}

interface TraceSearchHighlightsResult {
  readonly highlights: readonly TraceHighlight[]
  /** Index into `highlights` of the first match in document order, or -1. */
  readonly firstMatchIndex: number
}
```

Drawer fires this in parallel with `getTraceDetail`. The detail call resolves first 99% of the time (it's bigger but on the same backend); highlights apply on arrival like annotations do today. Empty `q` → skip the call.

### Two visual channels: unified inline match + semantic-region block

| Match | Drawer highlight |
|---|---|
| Literal `"…"` and Token `` `…` `` | **Single unified background fill** in the brand `primary` (blue) — `bg-primary/30 dark:bg-primary/40 rounded-sm box-decoration-clone`. The fill sits flush with the text bounds so search highlights composing on top of an annotation or selection stay visually clean — earlier `px-1 -mx-1` pill padding looked great in isolation but produced visible rounded "tabs" overhanging into the surrounding colored background. `rounded-sm` keeps a subtle chip edge inside the text bounds; `box-decoration-clone` keeps the rounding on each line when a multi-line match wraps. Same hue as the literal pill in the search bar. Annotation-undefined uses Tailwind's pastel `bg-blue-100`; the brand-saturated `primary` reads as a different state. Literal and token render identically; the `data-search-match` attribute on the DOM preserves the distinction for click popovers (PR4) but is not a visual signal — users already know which pill they typed. |
| Semantic | Soft amber **block background** on the chunk's message range (region-level, not per-character). |

Visual rationale: annotation-style background fills are more discoverable than underlines (which read as spell-check markers and are easy to miss in dense text). Using one color for both literal and token avoids visually fragmenting "the search result" — users care that text matched their search, not which sub-kind of match it was. The fill stays flush with the text bounds so search composing on top of selection/annotation looks clean — pill padding via negative-margin tricks produced visible overhang at overlap boundaries, so the trade was made in favor of the composable case.

**Search wins on overlap.** When a search highlight overlaps an annotation or selection, the search class wins on the overlapping segment. While a search is active the user opened the drawer to see *why* this trace matched; preserving the annotation tint on the matched span obscures the very thing they came to find. The annotation stays visible on the non-overlapping portion of its own range, and its click affordance still works there. Implemented in `segmentForHighlights` by preferring search highlights when picking the active highlight for each split segment.

Implementation: one new switch arm in `highlightAttributes` (`packages/ui/src/components/genai-conversation/parts/highlight-segments.ts:78`) and one widening of `HighlightRange["type"]` in `text-selection.tsx:13`.

### Click-to-explain popover

The rehype plugin already emits per-segment spans with data attributes. Add `data-search-match-id` alongside `data-annotation-id` and a sibling `onSearchMatchClick(matchId)` prop on `<Conversation>`. Click opens a small popover (reuse `AnnotationPopover`'s positioning, simpler content):

- Literal: **Matched phrase** — `"refund"`
- Token: **Matched ordered tokens** — `refund process` (with the original tokens stream)
- Semantic: **Best-matching block** — `score 0.84 · chunk 3 of 7`

The popover also carries **per-phrase prev/next buttons** (Phase B): filter `highlights[]` to the same `source.phrase` and step within the filtered list. For `semantic-region` there is only one region per trace so the buttons are disabled in that variant.

### Scroll-to-first + N/P navigation

- On drawer mount with `firstMatchIndex >= 0`, scroll the container to the DOM node whose `data-source-start === highlights[firstMatchIndex].startOffset` and `data-message-index === highlights[firstMatchIndex].messageIndex`.
- Override the conversation tab's existing `N`/`P` hotkeys when `searchQuery` is present: step through *highlights* (in document order) instead of message blocks. When `searchQuery` is empty, fall back to existing message-block behavior.
- `ScrollNavigator`'s `itemRefs` prop already accepts arbitrary refs — collect refs to the first highlight per message (or per chunk for semantic regions) and pass those instead of `navItemRefs`.

### Collapsed-middle interaction

When a highlight falls inside the collapsed middle of a `MarkdownContent` part:

- The "Show N more characters" affordance becomes **"Show N more characters · M matches hidden"**.
- If the scroll-to-first target is inside the collapsed middle, auto-expand that middle on mount before scrolling.
- N/P navigation does **not** auto-expand other collapsed middles. Buttons keep stepping through visible matches; the count badge on the affordance signals there's more to see if the user expands.

### Oversized-part offset fix (pre-existing bug, fixed in Phase A)

`sourceMappedTextPlugin` emits `data-source-start` / `data-source-end` from the rehype tree's `position.offset`, which is **local to the markdown string passed to ReactMarkdown**. The normal-sized path passes the full part text, so local offsets equal full-part offsets. The oversized path passes head/middle/tail slices, so the AST's positions are local to each slice — meaning emitted `data-source-start` for the same DOM position differs depending on whether the part rendered through the normal or oversized branch.

Two options to fix:

- **(a)** Per-slice, intersect each highlight with the slice's `[sliceStart, sliceEnd)` window, then subtract `sliceStart` before passing to `sourceMappedTextPlugin`. Highlights work, but everything downstream that reads `data-source-start` (click handlers, scroll-to-offset, annotation-offset resolver) sees slice-local offsets and would need a per-slice translation table.
- **(b) Recommended.** Pass a `sliceSourceStart: number` through `MarkdownBody` → `sourceMappedTextPlugin`, and emit `data-source-start = position.offset + sliceSourceStart` (and the same for `data-source-end`). The DOM attributes then always carry full-part-text coordinates, and **nothing downstream changes** — annotations, selections, click routing, scroll-to-first all keep working in their existing coordinate system.

Both also require passing `highlights` into `MarkdownBody` (currently it doesn't receive them at all). For (b), highlights flow through unchanged; the plugin uses the slice offset only when emitting attributes, not when matching highlights against AST text-node positions. (Equivalent: pre-shift highlight offsets to slice-local before passing, then emit with the shift undone — same arithmetic, less plumbing.)

This change fixes the pre-existing gap for annotations and selections in oversized parts, in addition to enabling search highlights. Treat that as a bonus, not as scope creep — it's the same code path either way.

### Semantic match mapping: chunk → message range

The semantic side of the search pipeline matches against **embedding chunks**, not messages. To highlight a semantic hit, we need to translate a winning chunk back into the message indices that contributed to it. This section spells out that mapping, the edge cases that fall out of how `buildTraceSearchDocument` currently builds chunks, and how the result is rendered without forcing a character-offset model where it doesn't fit.

#### The chunk-build pipeline today

`buildTraceSearchDocument` (`packages/domain/spans/src/use-cases/build-trace-search-document.ts:226`) transforms messages into chunks through four passes:

1. **`extractTurns(messages)`** (line 78) — groups messages into conversational turns. Each turn starts on a `user` message (or the first non-system message if the conversation opens otherwise) and extends through the response/tool-call sequence up to the next user message. **System messages are filtered out entirely.** Tool-call response parts and reasoning parts are also filtered. Output is `string[]` — message indices are dropped on the floor.
2. **`selectHeadTailTurns(turns)`** (line 107) — when total turn text exceeds the per-trace budget, walks the tail first (resolution carries more signal), then the head. Returns a non-contiguous subset of turns in document order. Middle turns are discarded.
3. **`packChunks(turns)`** (line 138) — greedy packs adjacent turns into chunks up to `TRACE_SEARCH_CHUNK_MAX_CHARS`. A turn larger than that cap splits into overlapping sub-chunks of `TRACE_SEARCH_CHUNK_OVERLAP_CHARS`. Output is `ChunkPayload[]` — turn boundaries are dropped on the floor.
4. **`normalizeChunkText`** — whitespace normalization, lone-surrogate replacement.

Two passes throw away the structural information we need: `extractTurns` drops message indices, `packChunks` drops turn boundaries.

#### What needs to change

Carry the structure through, don't try to reconstruct it later:

- **`extractTurns`** emits `{ text, firstMessageIndex, lastMessageIndex }[]`. Both indices refer to positions in the **original `allMessages` array** — including system messages, even though those are filtered from the turn text. Indexing against `allMessages` keeps the indices stable against the renderer, which iterates that array.
- **`selectHeadTailTurns`** preserves per-turn metadata when picking turns; no other changes.
- **`packChunks`** emits chunks carrying the **union of the message ranges** of every turn that went in:
  - `firstMessageIndex = min(turn.firstMessageIndex)` across packed turns
  - `lastMessageIndex  = max(turn.lastMessageIndex)`  across packed turns
  When a single oversized turn splits into overlapping sub-chunks, every sub-chunk inherits that turn's full `firstMessageIndex` / `lastMessageIndex` — the sub-chunks all map to the same conversational region. We don't try to subdivide a turn across messages; turns are atomic for the mapping.
- **`TraceSearchChunk`** (line 20) gains `firstMessageIndex` and `lastMessageIndex` alongside `chunkIndex`, `text`, `contentHash`.

#### Storage

Two new columns on `trace_search_embeddings`:

```sql
first_message_index Nullable(UInt32),
last_message_index  Nullable(UInt32),
```

Both populated at ingest for new rows. Pre-existing rows read NULL until (and unless) a backfill runs. Neither column is indexed — they ride along with the embedding as payload.

**Why nullable instead of `NOT NULL DEFAULT 0`.** `(0, 0)` is a valid range — a single-message turn at index 0 would legitimately match there — so zero can't double as a "no data" sentinel. NULL is unambiguous and propagates cleanly through `argMax`: when the highest-scoring chunk for a trace has NULL range columns (i.e. it was indexed before this migration), the rollup returns NULL and the endpoint skips semantic-region emission for that trace. Literal and token highlights are computed from `traceDetail.allMessages` directly and are unaffected.

**Backwards-compatible by design — no backfill.** The feature ships without a backfill, full stop. Old rows return NULL → no semantic-region highlight for those traces; new ingests populate the columns; over time, coverage improves as traces are re-embedded organically (TTL, re-ingestion, edits). This is the permanent steady state. The "Resolved decisions" stance that silent partial coverage beats misleading still applies — a user who opens a trace whose semantic match predates the migration sees literal/token highlights only, never a misplaced or fabricated region tint.

#### Read path: surviving the per-trace rollup

`buildSemanticSearchSubquery` (`packages/platform/db-clickhouse/src/repositories/trace-repository.ts:162`) collapses per-chunk scores via `max(semantic_score) GROUP BY trace_id`. That discards which chunk won. The fix uses `argMax` to keep the winning chunk's metadata:

```sql
SELECT
  trace_id,
  max(semantic_score)                            AS relevance_score,
  argMax(chunk_index, semantic_score)            AS matched_chunk_index,
  argMax(first_message_index, semantic_score)    AS matched_first_message_index,
  argMax(last_message_index, semantic_score)     AS matched_last_message_index
FROM (...)
GROUP BY trace_id
```

In the hybrid plan with `LEFT JOIN`, the same `argMax` pattern applies to the joined semantic side; the lexical side has no chunk metadata to carry. Pure phrase-only plans return `NULL` for the matched-chunk columns and the endpoint emits zero semantic-region highlights — the same trace can still surface literal / token highlights.

`argMax` over nullable columns returns NULL when the winning row's value is NULL. That means traces whose top-scoring chunk was indexed before this migration land in the endpoint with `matched_first_message_index IS NULL` / `matched_last_message_index IS NULL`, and the endpoint treats that identically to a pure-phrase plan: zero semantic-region highlights, literal/token highlights unaffected.

The `SearchPlan` type widens to `{ ranked, subquery, params, semanticMetadata: boolean }`. When `semanticMetadata` is true, the outer `LIST_SELECT` projects the matched-chunk columns out of the join; otherwise, it doesn't.

#### Why character offsets don't apply at this layer

Semantic-region highlights are **block-level**, not character-level. Three reasons character offsets are the wrong model here:

1. **The chunk text is normalized.** `normalizeChunkText` collapses whitespace and strips lone surrogates. Mapping a character position inside a chunk back to the original message text would require reversing those transforms — possible but error-prone.
2. **Tool-call and reasoning parts are stripped from chunk text.** A character offset inside a chunk does not correspond to a character offset in the rendered message.
3. **What the user wants to know is "this region of the conversation matched"** — not "these specific characters in message 7 matched". The chunk-level granularity is what the embedding actually scored; pretending we can localize it further at this layer is a lie. (Future option: re-embed individual messages within the chunk at view time — deferred, see dropped option above.)

So the `HighlightRange` for a semantic match uses **whole-message coverage**: one range per message in the matched span, with `startOffset` / `endOffset` ignored at render time for this type:

```ts
// One range per messageIndex in [matched_first_message_index, matched_last_message_index].
// startOffset/endOffset/partIndex are placeholders; render path keys on `type`.
{
  messageIndex,
  partIndex: 0,
  startOffset: 0,
  endOffset: 0,
  type: "search-semantic-region",
  source: {
    kind: "semantic-region",
    chunkIndex:  matched_chunk_index,
    score:       relevance_score,
  },
}
```

Render-side, the new `"search-semantic-region"` arm of `highlightAttributes` applies a class to the **message container element** rather than wrapping inline text segments (e.g. `bg-amber-50/40 dark:bg-amber-400/10 ring-1 ring-amber-200/50`). Inline `"search-literal"` / `"search-token"` highlights inside the same message still render on top of the block tint, so the two layers compose visually without conflict. The rehype plugin, `data-source-start` machinery, and click-to-explain hit zones stay entirely in service of literal / token highlights where character offsets are meaningful.

#### Edge cases that fall out of the model

| Case | Behavior |
|---|---|
| **Chunk would span head + tail across the discarded middle** | Can't happen — tail-first selection picks contiguous turns from each end and `packChunks` packs only adjacent turns. A single chunk never crosses the head/tail gap; `firstMessageIndex` and `lastMessageIndex` always describe one contiguous range. |
| **Winning chunk is a split sub-chunk of one oversized turn** | All sub-chunks of that turn carry the same `firstMessageIndex` and `lastMessageIndex`. The `argMax` returns the winning sub-chunk's `chunkIndex` for the popover, but the rendered region is identical to any other sub-chunk of the same turn. |
| **System messages interleaved inside the matched region** | `firstMessageIndex` / `lastMessageIndex` index into `allMessages` (with system rows present). The endpoint skips role=`system` at highlight emission anyway, so a system message inside the range simply produces no highlight for itself — the visual tint may visually span across it, which is honest about what the chunk covered. |
| **Reasoning-only or tool-response-only messages inside the region** | Chunk text didn't include those parts, but the message range still does. The block tint covers them. Trying to subtract them at render time would imply a precision we don't have. |
| **Empty chunk after normalization** | `buildTraceSearchDocument` already skips these (`build-trace-search-document.ts:243`); they never reach the embedding table. No special handling needed. |
| **Chunk index non-monotonic in message order** | True under tail-first selection. The `chunkIndex` shown in the popover reflects pack order, not document order. The popover labels it as "best-matching block" without implying chronology. The on-screen position is still correct because the renderer uses `firstMessageIndex` / `lastMessageIndex`, not `chunkIndex`. |
| **Pre-migration rows (permanent steady state, no backfill)** | Older `trace_search_embeddings` rows have NULL in the new columns and stay that way. `argMax` propagates NULL through the rollup, the endpoint emits zero semantic-region highlights for those traces, and literal / token highlights still return normally. Coverage on old traces stays at "lexical only" until they organically re-embed (TTL, re-ingestion, edits). That's honest about what the index can localize and avoids the cost of a one-shot worker. |

#### Where this lands in the contract

`TraceHighlight["source"]` already has:

```ts
| { kind: "semantic-region"; chunkIndex: number; score: number }
```

That stays as-is. The endpoint emits one `TraceHighlight` per non-system message in the matched range, all sharing the same `source` object. A future precision boost (re-embed at view time) would emit multiple narrower ranges with their own per-message scores — the contract doesn't change, only the granularity of what the server emits.

#### Implementation summary

| Layer | File | Change |
|---|---|---|
| Build | `packages/domain/spans/src/use-cases/build-trace-search-document.ts` | Thread `firstMessageIndex` / `lastMessageIndex` through `extractTurns` → `selectHeadTailTurns` → `packChunks`. Extend `TraceSearchChunk` (line 20). |
| Storage | `packages/platform/db-clickhouse/schema/` + `…/repositories/trace-search-repository.ts` | Add `first_message_index UInt32`, `last_message_index UInt32` to `trace_search_embeddings`. Write at insert. |
| Read | `packages/platform/db-clickhouse/src/repositories/trace-repository.ts:162` | `argMax(chunk_index, semantic_score)` + matched-range columns in `buildSemanticSearchSubquery`. Widen `SearchPlan` and project columns through `LIST_SELECT`. |
| API | `apps/web/src/domains/traces/traces.functions.ts` | Plumb matched-chunk metadata onto trace rows (parallel `searchMatch` field, not stuffed into `TraceRecord`). Extend `getTraceSearchHighlights` to emit `semantic-region` highlights from it. |
| Render | `packages/ui/src/components/genai-conversation/parts/highlight-segments.ts` + `<Conversation>` | New `"search-semantic-region"` branch (the same `"search-"`-prefixed namespace as the literal/token types added in Phase A); apply class to the message-container element instead of inline span wrapping. |

## Resolved decisions

- **System messages are skipped.** `getTraceSearchHighlights` walks `allMessages` filtering out `role === "system"`. This matches what the server search index does today (system messages are stripped at ingest in `buildTraceSearchDocument`), so the drawer cannot show hits the server search itself would never return.
- **No cap on highlights per trace.** The conversation renderer already enforces a **per-part** budget at `LARGE_MARKDOWN_CONTENT_THRESHOLD = 20_000` chars; above that, the middle is collapsed out of the DOM entirely. That means per-part highlight count is bounded by what we render in head+tail, and the rehype plugin never sees content we haven't already chosen to render. Real content-bearing queries (feature names, error codes, IDs, domain terms) produce 1–20 hits across a trace anyway. A blanket per-trace cap is solving a problem the existing render budget already constrains. If profiling later surfaces a real perf cliff, derive a cap from the cliff — not from a guess.
- **Hidden highlights, not too many, are the real risk.** When a search hit lives inside the collapsed middle of a long tool-call response, the user opens the drawer "to see why this trace matched" and sees nothing. Handled in Phase A by (a) replacing the affordance with **"Show N more characters · M matches hidden"** and (b) auto-expanding when scroll-to-first targets a hidden range.
- **Scroll-to-first is best-effort, not a guarantee.** Three things can make the lookup fail: code-fence text has no `data-source-start` (rehype-highlight strips source positions), some markdown transforms reshape offsets at element boundaries, and session compaction can erase the message from the trace the user opened (the backend computed the highlight against an earlier trace where the message lived). The resolver walks `highlights[]` from `firstMatchIndex`, takes the first one whose DOM node exists (exact `data-source-start` match, then a fuzzy ±10-char window in the same message), and silently no-ops if every hit's node is missing — the user still sees the inline highlights as they scroll and the matching-trace badges in the panel's Traces tab. Pre-paint races (auto-expand of a collapsed middle hasn't completed) are resolved via a `MutationObserver` on the scroll container, not patient rAF chains: synchronous scan first, observer retries on each mutation, disconnect on success or after a 2-second safety timeout. See [`6-session-panel.md`](./6-session-panel.md) §5 "Scroll resolution + compaction fallback" for the full session-side narrative.
- **Spans tab does not get highlights.** Only the Conversation tab. The Spans tree doesn't render through `<Conversation>`, and the user value sits squarely in the conversation view.
- **Per-phrase prev/next from the popover** — yes, included in Phase B. Cost is low because the global N/P infrastructure already exists; this is just filtering `highlights[]` to the same `source.phrase` and stepping within the filtered list.

## Options that were considered and dropped

### ❌ Lexical-proxy highlighting for semantic queries

Strip stopwords from the semantic prompt and highlight tokens that appear in the text.

**Rejected**: dishonest. Semantic search exists precisely so that a query like *"complaint about refunds"* can match a trace that says *"I want my money back"*. Highlighting only the literal keywords would either show nothing (defeating the point) or imply the trace matched lexically when it didn't. Worse than honest silence.

### ❌ Re-embedding messages at view time

Embed every message against the query embedding on each drawer open.

**Rejected for now**: real Voyage cost per drawer open, proportional to trace size. Not worth it given Phase C (chunk-region highlight) already answers "why did this match" at acceptable granularity. Could revisit later as an optional precision boost, behind a feature flag.

### ❌ Rerank-based span scoring

Use `rerank-2.5` over message-level snippets.

**Rejected**: rerank still scores whole candidates, not spans within them. Only works if we first chop the trace into snippets — which is Phase C in disguise, plus rerank cost. No incremental value.

## Notes for issue search (out of scope for this iteration but informs the shape)

Once Issues land on Postgres (migration `20260517062034_add-pgvector-issue-search`, `IssueRepository.hybridSearch` at `packages/platform/db-postgres/src/repositories/issue-repository.ts:275`):

- **Lexical side gets `ts_headline()` for free** — Postgres can return `Refunds <b>complaint</b> about …` directly out of the FTS engine.
- **Semantic side has the identical gap** as traces — pgvector cosine on a centroid is a score, not a span. The same "matched-region" approach would translate, scaled to the smaller surface (issue name + description vs. trace conversation).

When the Issues UI ships, the highlight types here (`literal | token | semantic-region`) can extend to issues with the same color contract.

## Phasing

Each phase is independently shippable.

**Phase A — Literal + token highlights, no schema change**

- New `getTraceSearchHighlights` endpoint that parses `q`, walks `traceDetail.allMessages` (skipping role=system), and returns `literal` + `token` ranges. Token tokenization matches `tokenizePhrase` from `trace-repository.ts:72` so the highlights are faithful to what the index matched.
- Drawer wiring: drawer accepts `searchQuery` prop (threaded from `q` in `search/index.tsx`), conversation tab calls the new hook, feeds `HighlightRange[]` into `<Conversation>`.
- New `"search-literal"` and `"search-token"` `HighlightRange["type"]` values with the pill-mirroring colors.
- Scroll-to-first on mount, with auto-expand if the first match is inside a collapsed middle.
- Replace the "Show N more characters" affordance with "Show N more characters · M matches hidden" when applicable.
- **Oversized-part offset fix.** Thread `sliceSourceStart` through `MarkdownBody` → `sourceMappedTextPlugin` so emitted `data-source-start` / `data-source-end` always carry full-part-text coordinates, and pass `highlights` into `MarkdownBody` (currently dropped). Also fixes the pre-existing bug where annotations and selections silently fail to render inside oversized parts.

**Phase B — Click-to-explain popover + N/P highlight navigation**

- Sibling popover component to `AnnotationPopover` for search matches.
- `data-search-match-id` plumbing through the rehype plugin.
- N/P override when `searchQuery` is non-empty.
- Per-phrase prev/next buttons inside the popover.

**Phase C — Semantic region highlight (schema migration, no backfill)**

- Schema: add nullable `first_message_index`, `last_message_index` to `trace_search_embeddings`. Old rows stay NULL forever; coverage improves organically as traces re-embed.
- Ingest: thread message indices through `buildTraceSearchDocument`.
- Read: `argMax(chunk_index, semantic_score)` + range columns in `buildSemanticSearchSubquery`. `argMax` propagates NULL from pre-migration winners — the endpoint treats that the same as a phrase-only plan and skips semantic-region emission for that trace.
- Plumb the winning chunk's range onto each trace row (parallel `searchMatch` field, not stuffed into `TraceRecord` itself).
- Extend `getTraceSearchHighlights` to emit one `semantic-region` highlight covering the message-range.
- New `"search-semantic-region"` `HighlightRange["type"]` with soft amber block background.

## Rollout (PR sequence)

Five PRs under Linear task **LAT-601**. The backend PRs ship first and are safe to land independently of the frontend: the new endpoint is dead code until the frontend wires it (PR 3), the schema migration is additive + nullable, and the search-listing read path is gated behind `SearchPlan.semanticMetadata` (default `false`) so existing query plans are byte-identical until a caller opts in. Frontend PRs light up one phase at a time on top.

All branches fork from `development` per the repo's PR-base policy. PR titles end with `(LAT-601 part N/5)` mirroring the LAT-599 convention.

### Dependency graph

```
                PR 1 — backend literal+token endpoint
                       (must land first; no deps)
                ┌──────────────┴──────────────┐
                ▼                             ▼
         PR 2 — backend                 PR 3 — frontend
         semantic-region                wiring + literal/token
                │                             │
                │                       ┌─────┴─────┐
                │                       ▼           ▼
                │                    PR 4         PR 5
                │                    popover      semantic-region
                │                    + N/P        render
                └────────────────────────────────►(needs PR 2 + PR 3)
```

Two parallel windows:

- **PR 2 ‖ PR 3** (after PR 1) — biggest win. Zero file overlap: PR 2 is purely backend (semantic-region pipeline), PR 3 is purely frontend (drawer wiring + literal/token render). Different reviewers, different deploy surfaces. Hand to different devs.
- **PR 4 ‖ PR 5** (after PR 3, and PR 5 also after PR 2) — smaller win. Both touch `conversation.tsx` but in mechanically separate places (PR 4 adds `onSearchMatchClick`, PR 5 adds a per-message wrapper). Either can merge first; trivial rebase for the second.

Hard sequence points: PR 1 → everything else; PR 3 → PR 4 (both touch `conversation-tab.tsx`); PR 2 → PR 5 (no semantic-region data without it).

### PR 1 — Backend: literal + token highlights endpoint *(LAT-601 part 1/5)*

**Branch:** `LAT-601/highlights-backend-endpoint`
**Status:** open as [#3255](https://github.com/latitude-dev/latitude-llm/pull/3255) — Copilot + Claude bot review comments addressed; awaiting human review.
**Depends on:** —
**User-visible change:** none. Endpoint has no caller until PR 3.

- [x] Relocated `tokenizePhrase` to `@domain/spans/helpers/tokenize-phrase.ts`; lexical indexer + highlights endpoint share one tokenizer.
- [x] Added `getTraceSearchHighlights` server fn in `apps/web/src/domains/traces/traces.functions.ts` — input `{ projectId, traceId, searchQuery (≤500) }`, output `TraceSearchHighlightsResult` with `search-literal` + `search-token` ranges only. Auth (`requireSession()`) fires before the parsed-query early-exit so unauthenticated callers can't even see the empty fast-path.
- [x] Parsed `q` with `parseSearchQuery`; fast-path empty `q` to `{ highlights: [], firstMatchIndex: -1 }`.
- [x] Walked `traceDetail.allMessages` skipping `role === "system"` and guarding against `message.parts` being undefined; emitted literal hits (normalised phrase + flexible-whitespace regex) and token hits (ordered-adjacent windows), sorted in document order; set `firstMatchIndex`. Overlapping literal + token ranges are intentionally preserved (each carries distinct `source` info).
- [x] Match-nothing parity with `buildLexicalSearchSubquery`: any literal that normalises to empty OR any token that tokenises to empty makes the whole result empty.
- [x] Relocated `normalizeLiteralPhrase` + `stripLoneSurrogates` to `@domain/spans/helpers/normalize-literal-phrase.ts` so indexer and highlights share one canonical normaliser.
- [x] Vitest: literal-only, token-only, hybrid, empty query, semantic-only, system-message filtering, multi-part messages, malformed `parts`, overlapping ranges, match-nothing combinations, whitespace-flexible literal matching (12+ cases).
- [x] Verified: 602 / 602 vitest, 3 typechecks clean, `pnpm knip` exit 0 (export shielded by `@knipignore` JSDoc + `tags: ["-knipignore"]` in `knip.json`).

### PR 2 — Backend: semantic-region schema + ingest + read path *(LAT-601 part 2/5)*

**Branch:** `LAT-601/highlights-backend-semantic-region`
**Status:** all code on local branch; pending the staging-baseline diff verification.
**Depends on:** PR 1 merged.
**User-visible change:** none. Existing search-listing callers don't pass `semanticMetadata: true`, so listing queries are byte-identical to today's. No backfill — see "Storage" section for why pre-migration rows stay NULL forever.

- [x] Migration `00017_add_chunk_message_range_to_trace_search_embeddings` (unclustered + clustered): `first_message_index Nullable(UInt32)` and `last_message_index Nullable(UInt32)` on `trace_search_embeddings` with `CODEC(T64, ZSTD(1))`.
- [x] `extractTurns` returns `{ text, firstMessageIndex, lastMessageIndex }[]`, indexing into the original `allMessages` array (system rows included).
- [x] `selectHeadTailTurns` preserves per-turn metadata when picking turns; type widening only.
- [x] `packChunks` emits union ranges: `min(firstMessageIndex)` / `max(lastMessageIndex)` across packed turns; sub-chunks of one oversized turn inherit that turn's full range.
- [x] Extended `TraceSearchChunk` with `firstMessageIndex` and `lastMessageIndex`.
- [x] Extended `TraceSearchEmbeddingRow` (port) + `upsertEmbedding` (live) to write the two new columns; nullable in CH → `undefined` serialises to `null` in `JSONEachRow`. Worker (`apps/workers/src/workers/trace-search.ts`) passes them through from chunk to row.
- [x] Widened `SearchPlan` to `{ ranked, subquery, params, semanticMetadata: boolean }`. `planSearch(parsed, opts?)` accepts an `opts.semanticMetadata?: boolean`; default `false`.
- [x] `buildSemanticSearchSubquery(queryEmbedding, semanticMetadata)` conditionally adds `argMax(chunk_index, semantic_score)` + matched-range columns; default `false` keeps the existing query plan byte-identical.
- [x] Outer subquery wrapping in `buildSearchPlan` projects `matched_chunk_index` / `matched_first_message_index` / `matched_last_message_index` through every branch when `semanticMetadata: true` (phrase-only / no-embedding plans cast NULL of the right type for shape parity).
- [x] Hybrid `LEFT JOIN`: `max(sem.matched_*)` pass-through over the joined side; lexical-only matches return NULL (no semantic chunk).
- [x] New `TraceSearchRepository.findSemanticHighlightForTrace(orgId, projectId, traceId, queryEmbedding)` runs the focused per-trace `argMax` query and returns `{ chunkIndex, firstMessageIndex, lastMessageIndex, relevanceScore } | null` (nullable on the message-range columns for pre-migration chunks).
- [x] Extended `computeTraceSearchHighlights` use-case to accept an optional `semanticMatch`. When the matched-range columns are non-null, emits one `search-semantic-region` highlight per non-system message in `[first, last]`. NULL range columns → skip semantic-region emission; literal/token still flow.
- [x] Extended `getTraceSearchHighlights` handler: when `parsedQuery.semanticPrompt` is non-empty, runs the Voyage embed + `findSemanticHighlightForTrace` in parallel with `findByTraceId` (both Effect-resolved via `withAi` + `withClickHouse`). AI unavailable → semantic-region skipped, literal/token continue to flow.
- [x] Added `@domain/ai` to `apps/web/package.json` so the handler can take the `AI` service from context for embedding.
- [x] Vitest: index threading through the chunk pipeline (single turn, system-row interleave, multi-turn packing, sub-chunks-of-oversized-turn, head/tail dropping the middle); semantic-region emission (block-per-message, system skipping, NULL-range skipping, composes with literal hits, suppressed by match-nothing phrase, semantic-only with no match). Total: 613 / 613 vitest in `@domain/spans`, 154 / 154 in `@platform/db-clickhouse`. All 4 typechecks clean. `pnpm knip` exit 0.
- [ ] Verify: diff existing search-listing result IDs and `relevance_score` against a staging baseline — must be identical. New endpoint returns semantic-region highlights on freshly-ingested traces, literal/token-only on older ones.

### PR 3 — Frontend: Phase A wiring + literal/token highlights *(LAT-601 part 3/5)*

**Branch:** `LAT-601/highlights-frontend-wiring`
**Depends on:** PR 1 merged. (PR 2 not required — endpoint returns literal/token even before PR 2 lands; semantic-region just isn't in the response yet.)
**User-visible change:** literal and token highlights appear when opening a trace from the search page; scroll-to-first works; collapsed-middle affordance surfaces hidden-match count. Side-effect win: annotations and selections inside oversized parts now render correctly (pre-existing bug fixed).

- [ ] Widen `HighlightRange["type"]` in `packages/ui/src/components/genai-conversation/text-selection.tsx` to include `"search-literal" | "search-token" | "search-semantic-region"`.
- [ ] In `highlightAttributes` (`packages/ui/src/components/genai-conversation/parts/highlight-segments.ts`), add branches for `"search-literal"` (solid underline, primary color: `underline decoration-primary decoration-2 underline-offset-4`) and `"search-token"` (wavy underline, phrase color: `underline decoration-wavy decoration-phrase decoration-2 underline-offset-4`). No background fills.
- [ ] **Oversized-part offset fix:**
  - [ ] `sourceMappedTextPlugin` accepts `sliceSourceStart: number`; emit `data-source-start = position.offset + sliceSourceStart` and same shift for `data-source-end`.
  - [ ] `markdown-content.tsx`: thread `highlights` + `sliceSourceStart` into `MarkdownBody` for the normal path (`0`) and the oversized branch (`head → 0`, `middle → headCut`, `tail → content.length - tail.length`).
  - [ ] Regression test in `source-mapped-text-plugin.test.ts` for non-zero `sliceSourceStart`.
- [ ] Add `useTraceSearchHighlights` React Query hook in `apps/web/src/domains/traces/traces.collection.ts`, keyed on `["traceSearchHighlights", projectId, traceId, searchQuery]`; `enabled: searchQuery.length > 0`.
- [ ] `TraceDetailDrawer` accepts optional `searchQuery` prop; thread through to `ConversationTab`.
- [ ] `ConversationTab`:
  - [ ] Call `useTraceSearchHighlights` in parallel with `useTraceDetail`.
  - [ ] Merge with annotation `highlightRanges` from `useAnnotationPopover` before passing to `<Conversation>`.
  - [ ] On result resolve with `firstMatchIndex >= 0`, scroll to the matching DOM node.
  - [ ] If the first match sits in a collapsed middle, auto-expand that `MarkdownContent`'s middle before scrolling.
- [ ] `MarkdownContent`: replace the "Show N more characters" label with "Show N more characters · M matches hidden" when merged highlights have offsets in the collapsed middle.
- [ ] Pass `searchQuery={q}` to `<TraceDetailDrawer>` from `/search` and `/session-search` route components.
- [ ] Manual verification: `"foo"`, `` `foo bar` ``, hybrid, empty-`q`, and a trace with a very long tool-call response that pushes hits into the collapsed middle.

### PR 4 — Frontend: Phase B popover + N/P navigation *(LAT-601 part 4/5)*

**Branch:** `LAT-601/highlights-frontend-popover`
**Depends on:** PR 3 merged.
**User-visible change:** clicking a highlight opens a popover; N/P walks visible matches in document order; per-phrase prev/next inside the popover.

- [ ] `sourceMappedTextPlugin` emits `data-search-match-id` (deterministic id from `(messageIndex, partIndex, startOffset, type)`) for `search-literal` / `search-token` segments.
- [ ] New `SearchMatchPopover` in `apps/web/src/routes/_authenticated/projects/$projectSlug/-components/`, mirroring `AnnotationPopover` virtual-ref positioning; per-`source.kind` content (literal phrase, token stream, semantic chunk/score).
- [ ] Per-phrase prev/next buttons inside the popover: filter `highlights[]` by `source.phrase`, step within the filtered list; disable for `semantic-region`.
- [ ] `<Conversation>` adds `onSearchMatchClick` prop; route container clicks on `[data-search-match-id]` to it (mirrors the existing `data-annotation-id` wiring).
- [ ] N/P override in `ConversationTab`: when `searchQuery` is non-empty, collect refs to the first highlight per message (or to the message container for `semantic-region`); pass as `itemRefs` to `ScrollNavigator`. Empty `searchQuery` falls back to message-block behavior.
- [ ] Manual verification: click each highlight type, confirm popover content; N/P walks visible highlights; per-phrase nav inside the popover steps within the filtered set.

### PR 5 — Frontend: Phase C semantic-region rendering *(LAT-601 part 5/5)*

**Branch:** `LAT-601/highlights-frontend-semantic-region`
**Depends on:** PR 2 + PR 4 merged.
**User-visible change:** semantic queries (e.g. `customer complaint`) show an amber tint over the matched message range; popover on the tint shows "best-matching block · score X · chunk N of M". Pre-migration traces continue to show literal/token highlights only (no tint), as designed.

- [ ] Add `"search-semantic-region"` arm in `highlightAttributes` returning message-container classes (`bg-amber-50/40 dark:bg-amber-400/10 ring-1 ring-amber-200/50`), not inline span classes.
- [ ] Per-message wrapper in `<Conversation>` checks for a `semantic-region` highlight matching its `messageIndex` and applies the container class. Inline literal/token highlights still render on top.
- [ ] Manual verification: semantic query produces amber tint over the matched range; popover on tinted messages shows score/chunk info; pre-migration traces stay literal/token-only.

## Files this will touch

### Phase A
- `apps/web/src/domains/traces/traces.functions.ts` — new `getTraceSearchHighlights` server fn.
- `apps/web/src/routes/_authenticated/projects/$projectSlug/search/index.tsx:355` — pass `q` to drawer.
- `apps/web/src/routes/_authenticated/projects/$projectSlug/-components/trace-detail-drawer.tsx` — accept `searchQuery`, thread to conversation tab.
- `apps/web/src/routes/_authenticated/projects/$projectSlug/-components/trace-detail-drawer/tabs/conversation-tab.tsx` — call new hook, merge with annotation `highlightRanges`, scroll-to-first, auto-expand-on-target-hidden.
- `apps/web/src/lib/hooks/` — `useTraceSearchHighlights` (React Query wrapper).
- `packages/ui/src/components/genai-conversation/text-selection.tsx` — widen `HighlightRange["type"]`.
- `packages/ui/src/components/genai-conversation/parts/highlight-segments.ts` — add color branches.
- `packages/ui/src/components/genai-conversation/parts/markdown-content.tsx` — "M matches hidden" affordance + auto-expand prop; thread `highlights` and `sliceSourceStart` into `MarkdownBody`.
- `packages/ui/src/components/genai-conversation/parts/source-mapped-text-plugin.ts` — accept `sliceSourceStart` and add it when emitting `data-source-start` / `data-source-end`.
- `packages/ui/src/components/genai-conversation/parts/source-mapped-text-plugin.test.ts` — add coverage for non-zero `sliceSourceStart` (regression for the pre-existing oversized-part gap).

### Phase B
- `packages/ui/src/components/genai-conversation/conversation.tsx` — `onSearchMatchClick` prop.
- `packages/ui/src/components/genai-conversation/parts/source-mapped-text-plugin.ts` — emit `data-search-match-id`.
- New `SearchMatchPopover` next to `AnnotationPopover`.

### Phase C
- `packages/domain/spans/src/use-cases/build-trace-search-document.ts` — thread `messageIndex`.
- `packages/platform/db-clickhouse/schema/` — `trace_search_embeddings` columns.
- `packages/platform/db-clickhouse/src/repositories/trace-search-repository.ts` — write new columns.
- `packages/platform/db-clickhouse/src/repositories/trace-repository.ts:162` — `argMax`, plumb through `SearchPlan` + `LIST_SELECT`.
- `apps/web/src/domains/traces/traces.functions.ts` — extend trace row with `searchMatch` field.

## Session-level result behavior

Once `2-session-level-search.md` and `6-session-panel.md` land, every row in
the search results represents one session, and clicking a row opens the
**session panel** (not the trace drawer directly). The panel's
Conversation tab renders one trace's conversation at a time using the
same `<Conversation>` primitive the trace drawer uses, so the highlight
pipeline stays per-trace — it just renders inside the panel.

### Result row schema (recap)

From `2-session-level-search.md` §4.1, each session result row carries:

```ts
interface SessionSearchMatch {
  readonly bestScore: number
  readonly bestTraceId: string                       // argMax(trace_id, relevance_score)
  readonly matchingTraceCount: number
  readonly matchingTraceIds: readonly string[]       // sorted by score DESC
  readonly matchingTraceScores: readonly number[]    // aligned with matchingTraceIds
}
```

### Click contract on a session row in search mode

Per `./6-session-panel.md` §3 ("Which trace does the Conversation tab
show?"), clicking a session row in search mode opens the session panel
with `currentTraceId = matchingTraceIds[0]` — the first (highest-scored)
matching trace. The panel's Conversation tab fires
`getTraceSearchHighlights(currentTraceId, q)` in parallel with
`getTraceDetail(currentTraceId)` and scrolls to the first highlight on
arrival.

The session-level `bestScore` and `matchingTraceCount` do not influence
the highlight computation itself; they only inform the initial
`currentTraceId` choice. The existing `getTraceSearchHighlights`
contract (`traceId` + `q`) stays exactly as documented above.

### Cross-trace navigation lives in the sessions-list row expansion

For multi-trace sessions, the sessions-list row also **expands inline**
beside/behind the panel, showing every trace in the session ordered by
`start_time`. Trace rows in the expansion that appear in
`matchingTraceIds` get a visual hit-count badge derived from
`matchingTraceScores`. Clicking a different matching trace row in the
expansion sets the panel's `currentTraceId` to that trace; the
Conversation tab re-fires `getTraceDetail` + `getTraceSearchHighlights`
and re-scrolls to its first hit.

That's the cross-trace navigation surface — the row expansion, not a
chip in the panel header. Justifications:

- The expansion already exists today (`useExpandedSessionTraces`) and
  the user has it open as soon as they click the session row. Putting a
  second cross-trace affordance inside the panel duplicates it.
- The expansion can show titles, scores, and per-trace hit counts in
  parallel — far more information than a header chip can fit.
- The panel header stays small and identical between browse and search
  modes; less UI churn between contexts.

### N/P stays within the current trace's highlights

Same decision as before: `N`/`P` steps through `highlights[]` in
document order within the **currently shown** trace. Crossing to
another matching trace is a separate, explicit gesture — clicking a
different trace row in the row expansion. Justification:

- N/P is a tight in-frame operation. Overloading it to also reload the
  panel's Conversation tab with a different `traceId` changes its
  perceived weight from "scroll to the next match" to "navigate to the
  next trace". Users will not understand the same key doing both.
- Highlights inside one trace are bounded (1–20 hits per trace in real
  queries). Running out of N/P targets is rare; when it does happen,
  the user picks the next matching trace from the expansion explicitly.

### Per-trace re-highlighting (when `currentTraceId` changes)

When the user clicks a different trace in the row expansion, the
panel's Conversation tab needs highlights for the new `traceId`. React
Query keys highlights on `["traceSearchHighlights", traceId, q]`, so
the second-trace fetch is independent and cacheable. Two strategies:

- **On-demand refetch (V1).** Panel re-fires
  `getTraceSearchHighlights(newTraceId, q)` on the trace switch.
  Latency is one endpoint call; while it's in flight the conversation
  renders without highlights, same as any first-time drawer open.
- **Prefetch all matching traces on panel open (V1.5).** When the
  panel opens from a search result, fire
  `queryClient.prefetchQuery(["traceSearchHighlights", traceId, q])`
  in parallel for **every** id in `matchingTraceIds`. `matchingTraceCount`
  is bounded by the session's trace count (typically <20), so this is
  bounded work; each call is scoped to one trace's `allMessages`.
  Cross-trace clicks in the expansion feel instant.

Recommendation: ship V1 on-demand, add the full-prefetch in V1.5 behind
a feature flag, default-on once telemetry confirms the cost is fine.
`getTraceDetail` follows the same pattern — also `traceId`-keyed, also
cached, also independently fetchable per trace switch.

### Session-specific open questions

> Specific to the session extension; the spec-global open questions live
> in the section below.

- **Highlight-badge styling in the row expansion.** The matching-trace
  badge in the expansion needs a concrete visual: hit count? score?
  both? Score bucket color? This is more a `sessions-list-row.md` concern
  than a highlights concern; flagged here so the two specs stay aligned
  when the row expansion lands.
- **Highlight cache invalidation when `q` changes mid-session-browse.**
  Edge case: user opens session A in search mode (panel on `matchingTraceIds[0]`),
  switches via the expansion to a second matching trace, edits `q`. The
  panel is still open on the second trace. React Query keys highlights
  on `(traceId, q)` so the highlight set updates automatically — but
  the row expansion's badges are derived from the *previous* `q`'s
  `matchingTraceIds`. Recommendation: close the panel when `q` changes
  (we already close it when filters change). Confirm.
- **Empty highlight set on a non-best trace.** The session result row
  lists every trace whose `relevance_score > 0` (lexical-only matches
  included at `score = 0`). Some of those traces matched purely
  lexically with `relevance_score = 0` and won't produce semantic-region
  highlights — but they will produce literal/token highlights for the
  phrase that matched. Verify this end-to-end before shipping: a
  session whose `matching_trace_ids` includes pure-lexical entries
  should still highlight the phrase in those traces' panel conversation.
- **What happens on a search-result click for a session that has zero
  `matchingTraceIds`?** Shouldn't be possible — by construction every
  session in the search results has at least one matching trace. But
  defensively, if `matchingTraceIds` is empty, fall back to the
  browse-mode default (last trace by `start_time`).

## Open questions

(none currently — keep iterating as design surfaces edge cases.)
