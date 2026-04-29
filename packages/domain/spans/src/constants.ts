export const SESSION_ID_MAX_LENGTH = 128
export const TRACE_ID_LENGTH = 32
export const SPAN_ID_LENGTH = 16

/** Debounce window for trace end detection (1:30 minutes in milliseconds). */
export const TRACE_END_DEBOUNCE_MS = 90 * 1000

/** TTL for cached tag-scoped cohort baseline summaries (1 hour in seconds). */
export const TRACE_COHORT_SUMMARY_CACHE_TTL_SECONDS = 60 * 60

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

/**
 * Embedding model for trace semantic search (Voyage).
 *
 * `voyage-4-large` at 2048 dims. Chosen over the smaller voyage-3-lite so the
 * raw cosine ranking is precise enough to stand on its own without a
 * cross-encoder rerank step. A larger bi-encoder fits the "search-as-a-
 * filter-column" query shape: single CH query, cursor-paginable, bounded
 * latency, no external rerank round-trip.
 */
export const TRACE_SEARCH_EMBEDDING_MODEL = "voyage-4-large"

/** Embedding dimensions for the chosen model. */
export const TRACE_SEARCH_EMBEDDING_DIMENSIONS = 2048

/**
 * Minimum combined relevance score for a trace to surface in search results.
 *
 * With no rerank, this is the sole precision filter. Pure-lexical hits always
 * pass (relevance 0.3 from the lexical weight alone). Pure-semantic hits must
 * clear the floor via cosine similarity: at 0.2, they need cosineSimilarity
 * >= 0.286, i.e. cosineDistance <= 0.714.
 *
 * Voyage-4-large produces lower raw cosine values than voyage-3-lite for the
 * same semantic match (different normalization), so the floor sits lower in
 * absolute terms than you might expect — genuine matches on paraphrase queries
 * cluster around cosine 0.33–0.38, with noise starting below ~0.26. Tune
 * empirically per corpus.
 */
export const TRACE_SEARCH_MIN_RELEVANCE_SCORE = 0.2
