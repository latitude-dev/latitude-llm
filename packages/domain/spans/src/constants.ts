export const SESSION_ID_MAX_LENGTH = 128
export const TRACE_ID_LENGTH = 32
export const SPAN_ID_LENGTH = 16

/** Debounce window for trace end detection (1:30 minutes in milliseconds). */
export const TRACE_END_DEBOUNCE_MS = 90 * 1000

/** TTL for cached tag-scoped cohort baseline summaries (1 hour in seconds). Shared by traces and sessions. */
export const COHORT_SUMMARY_CACHE_TTL_SECONDS = 60 * 60

// ═══════════════════════════════════════════════════════════════════════════════
// Trace Search Constants
// ═══════════════════════════════════════════════════════════════════════════════

/** Character-to-token estimate used for trace-search embedding budget enforcement. */
export const TRACE_SEARCH_CHARS_PER_TOKEN_ESTIMATE = 4

/** Maximum estimated tokens of searchable conversation text before truncation. */
export const TRACE_SEARCH_DOCUMENT_MAX_ESTIMATED_TOKENS = 5_000

/** Maximum length of searchable conversation text before truncation. */
export const TRACE_SEARCH_DOCUMENT_MAX_LENGTH =
  TRACE_SEARCH_DOCUMENT_MAX_ESTIMATED_TOKENS * TRACE_SEARCH_CHARS_PER_TOKEN_ESTIMATE

/**
 * Per-chunk soft cap (~500 tokens at 4 chars/token). One conversation turn
 * fits in one chunk if it's under this size; longer turns split into multiple
 * chunks with overlap; multiple short turns greedily pack into one chunk.
 */
export const TRACE_SEARCH_CHUNK_MAX_CHARS = 2_000

/**
 * Overlap applied only when a single turn exceeds `TRACE_SEARCH_CHUNK_MAX_CHARS`
 * and has to be sliced. Keeps cross-boundary phrases inside at least one chunk.
 */
export const TRACE_SEARCH_CHUNK_OVERLAP_CHARS = 200

/**
 * Soft cap for the **tail** half of a long-trace head+tail split. The tail is
 * the bigger half because it carries more retrieval signal (resolution,
 * handoff, final answer) than the head (the user's framing).
 *
 * Walked tail-first; the turn that crosses the threshold is still embedded
 * fully (atomic-turn rule) before the walk stops.
 */
export const TRACE_SEARCH_CHUNK_TAIL_BUDGET_CHARS = 12_000

/**
 * Soft cap for the **head** half of a long-trace head+tail split. Combined
 * with `TRACE_SEARCH_CHUNK_TAIL_BUDGET_CHARS` it sums to
 * `TRACE_SEARCH_DOCUMENT_MAX_LENGTH` so total chunked text per trace stays
 * roughly bounded.
 *
 * The head walk runs second and stops before revisiting any turn already
 * claimed by the tail walk.
 */
export const TRACE_SEARCH_CHUNK_HEAD_BUDGET_CHARS = 8_000

/**
 * Retention window for embeddings. Enforced via ClickHouse TTL on the
 * `trace_search_embeddings` table (see the migration). Shorter than the
 * document window because embeddings are the expensive side.
 */
export const TRACE_SEARCH_EMBEDDING_LOOKBACK_DAYS = 30

/**
 * Retention window for lexical documents. Longer than embeddings because
 * lexical storage is cheap and lets recently-evicted-from-semantic traces
 * still surface via `ILIKE` match.
 */
export const TRACE_SEARCH_DOCUMENT_LOOKBACK_DAYS = 90

/**
 * Minimum search-document length (chars) before a trace is eligible for
 * semantic embedding. Avoids burning Voyage credits on near-empty traces
 * (single-turn classifier prompts, "hi", etc.) where embeddings add no
 * meaningful retrieval signal and tend to cluster at similar distances
 * from every query.
 */
export const TRACE_SEARCH_EMBEDDING_MIN_LENGTH = 100

/**
 * Default per-organization embedding-token budget. Enforced as three tiered
 * rolling windows (daily, weekly, monthly) — a trace is embedded only if all
 * three budgets can absorb its estimated tokens.
 *
 * Today's numbers target a "Pro" plan profile at voyage-4-large + 5k-token
 * truncation, sized so worst-case Voyage spend per org sits at 50% of the
 * $100/month base — the rest of plan revenue funds storage, infra, and
 * margin:
 *
 *  - Monthly 5B tokens    → ~$600/org in worst-case Voyage spend.
 *  - Weekly 1.15B tokens  → one burst week can't exhaust the monthly budget.
 *  - Daily 167M tokens    → one burst day can't exhaust the weekly budget.
 *
 * When subscription plans land, `EmbedBudgetResolver` will resolve
 * per-plan values at the org boundary instead of using these constants
 * directly. Any caller that needs the limit for a given org goes through the
 * resolver, not these constants.
 */
export const TRACE_SEARCH_DEFAULT_DAILY_EMBED_BUDGET_TOKENS = 167_000_000
export const TRACE_SEARCH_DEFAULT_WEEKLY_EMBED_BUDGET_TOKENS = 1_150_000_000
export const TRACE_SEARCH_DEFAULT_MONTHLY_EMBED_BUDGET_TOKENS = 5_000_000_000

// The embedding model is resolved at call time via `resolveEmbeddingConfig()`
// (`@domain/ai`): default `voyage-4-large` at the fixed `EMBEDDING_DIMENSIONS`
// (2048), overridable with `LAT_AI_EMBEDDING_{PROVIDER,MODEL}`. The default
// was chosen over smaller models so the raw cosine ranking is precise enough
// to stand on its own without a cross-encoder rerank step.

/**
 * Minimum semantic-only relevance score for a trace to surface in search
 * results. Applied after the per-trace `max(...) GROUP BY trace_id` rollup
 * over per-message cosine similarities — i.e. it's the score of a trace's
 * single best-matching message.
 *
 * Tuned empirically against the seeded demo corpus on 2026-06-12 for the
 * shared message-embedding read path (per-message vectors score hotter than
 * the legacy per-chunk vectors on both signal and noise, so the legacy 0.30
 * floor let garbage through):
 *   - Off-topic queries ("totally unrelated banana", "recipe for sourdough
 *     bread starter") top out at 0.24–0.25; lexically-adjacent garbage
 *     ("rocket skates malfunction" → skateboard returns) reaches 0.32 —
 *     this is the practical noise ceiling of the corpus.
 *   - Weakly-topical matches start at ~0.37 ("warranty claim for a broken
 *     telescope" → damaged-product returns); relevant broad-query mass
 *     ("refund request") sits at 0.40–0.55; specific-query tops at 0.63–0.69.
 *
 * 0.35 sits in the gap: everything below is noise, everything above is at
 * least weakly topical. Raising it to 0.40 would drop genuinely relevant
 * broad-query matches (return/cancel conversations score 0.39–0.40 for
 * "refund request"). History: 0.20 (single mean vector per trace), 0.30
 * (trace-document chunks + max-pool, 2026-05-08), 0.35 (shared per-message
 * embeddings + max-pool). The legacy chunk path shares this floor until it
 * is removed — on legacy distributions 0.35 only trims the weakest band
 * (legacy noise ceiling is 0.29).
 *
 * Re-tune against production if the noise / signal distribution shifts.
 */
export const TRACE_SEARCH_MIN_RELEVANCE_SCORE = 0.35

/**
 * Boilerplate suppression for the shared message-embedding read path.
 *
 * Shared message embeddings are deduplicated by content hash, so a canned
 * message ("Hi! How can I help you today?") is ONE vector that joins back to
 * nearly every trace in the project via `trace_message_occurrences`. Under
 * max-pool scoring that single vector sets the score of every trace that
 * contains it: on the seeded demo corpus the greeting appears in 1,568 of
 * 1,578 traces and scores 0.35 against service-flavored prompts ("user
 * asking to talk to a human"), so every session in the project cleared the
 * relevance floor — search degenerated into an unfiltered listing.
 *
 * The fix is a document-frequency cut, the stop-word idea lifted to whole
 * messages: a content hash that occurs in `>= max(MIN_TRACES, FRACTION ×
 * project traces)` distinct traces carries no discriminative signal for
 * *ranking traces against each other* and is excluded from semantic scoring.
 * The message text still participates in lexical search and is still shown
 * in conversations — only its vector stops being able to set a trace's
 * relevance score.
 *
 *  - `FRACTION = 0.2`: a message shared by a fifth of all traces is
 *    template/boilerplate, not content. Genuine repeated user intents
 *    cluster far below this (the most-duplicated real message in the demo
 *    corpus, "I want to return everything I ordered.", sits in <1% of
 *    traces).
 *  - `MIN_TRACES = 50`: floors the threshold so small projects (where 20%
 *    is a handful of traces) don't suppress legitimately repeated intents.
 */
export const TRACE_SEARCH_BOILERPLATE_TRACE_FRACTION = 0.2
export const TRACE_SEARCH_BOILERPLATE_MIN_TRACES = 50

// ═══════════════════════════════════════════════════════════════════════════════
// Session Search Constants
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Per-session cap on the `matching_trace_ids` / `matching_trace_scores`
 * arrays returned by the session-search rollup. The CTE-side `groupArray`
 * is bounded only by the upstream `SEMANTIC_SCAN_LIMIT = 30_000` candidate
 * set — a pathological single-session project could otherwise materialize
 * a 30k-element tuple array per row (≈ 1.2 MB × 2 arrays per row from the
 * parallel id/score split). The UI only renders a handful of matching
 * turns per session card, and `best_trace_id` + `matching_trace_count`
 * carry the rest of the signal, so capping at 50 keeps the worst case
 * bounded without changing user-visible behavior.
 *
 * Note: `matching_trace_count` continues to reflect the **true** count of
 * matching traces per session — the cap only limits the materialized
 * id/score arrays.
 */
export const SESSION_SEARCH_MAX_MATCHING_TRACES_PER_ROW = 50
