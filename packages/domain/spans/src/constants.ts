export const SESSION_ID_MAX_LENGTH = 128
export const TRACE_ID_LENGTH = 32
export const SPAN_ID_LENGTH = 16

/** Debounce window for trace end detection (1:30 minutes in milliseconds). */
export const TRACE_END_DEBOUNCE_MS = 90 * 1000

// ═══════════════════════════════════════════════════════════════════════════════
// Trace Search Constants
// ═══════════════════════════════════════════════════════════════════════════════

/** Maximum length of searchable text content before truncation. */
export const TRACE_SEARCH_DOCUMENT_MAX_LENGTH = 50_000

/** Maximum number of recent traces per project eligible for semantic search indexing. */
export const TRACE_SEARCH_SEMANTIC_CAP = 10_000

/** Embedding model for trace semantic search. */
export const TRACE_SEARCH_EMBEDDING_MODEL = "text-embedding-3-small"

/** Embedding dimensions for the chosen model (1536 for text-embedding-3-small). */
export const TRACE_SEARCH_EMBEDDING_DIMENSIONS = 1536
