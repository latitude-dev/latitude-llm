export const SESSION_ID_MAX_LENGTH = 128
export const TRACE_ID_LENGTH = 32
export const SPAN_ID_LENGTH = 16

/** Debounce window for trace end detection (1:30 minutes in milliseconds). */
export const TRACE_END_DEBOUNCE_MS = 90 * 1000

// ═══════════════════════════════════════════════════════════════════════════════
// Trace Search Constants
// ═══════════════════════════════════════════════════════════════════════════════

/** Maximum length of searchable text content before truncation. */
export const TRACE_SEARCH_DOCUMENT_MAX_LENGTH = 20_000

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
 * Today's numbers target a "Pro" plan profile at voyage-4-large + 20k-char
 * truncation:
 *
 *  - Monthly 500M tokens → ~$60/org in worst-case Voyage spend.
 *  - Weekly 115M tokens  → one burst week can't exhaust the monthly budget.
 *  - Daily 16.7M tokens  → one burst day can't exhaust the weekly budget.
 *
 * When subscription plans land, `EmbedBudgetResolver` will resolve
 * per-plan values at the org boundary instead of using these constants
 * directly. Any caller that needs the limit for a given org goes through the
 * resolver, not these constants.
 */
export const TRACE_SEARCH_DEFAULT_DAILY_EMBED_BUDGET_TOKENS = 16_700_000
export const TRACE_SEARCH_DEFAULT_WEEKLY_EMBED_BUDGET_TOKENS = 115_000_000
export const TRACE_SEARCH_DEFAULT_MONTHLY_EMBED_BUDGET_TOKENS = 500_000_000

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
