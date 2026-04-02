import type { ScoreSource } from "@domain/scores"

export const ISSUE_NAME_MAX_LENGTH = 128

export const ISSUE_STATES = ["new", "escalating", "resolved", "regressed", "ignored"] as const

export const NEW_ISSUE_AGE_DAYS = 7

/**
 * An issue is "escalating" when last-day occurrences exceed the 7-day
 * baseline average by this factor.
 * */
export const ESCALATION_THRESHOLD_FACTOR = 1.33

/** An issue with no occurrences in this many days is auto-resolved. */
export const AUTO_RESOLVE_INACTIVITY_DAYS = 14

// ---------------------------------------------------------------------------
// Centroid configuration
// ---------------------------------------------------------------------------

/**
 * Critical issue-discovery configuration.
 *
 * These values define the persisted `IssueCentroid` space and the query vectors
 * matched against it during issue discovery. Do not change them directly in
 * place: changing model, dimensions, decay semantics, or source weights
 * requires explicit support for old and new embedding spaces plus a centroid
 * rebuild/migration strategy, otherwise historical and new contributions become
 * incompatible.
 */

/** Half-life for exponential decay of centroid contributions, in seconds (14 days). */
export const CENTROID_HALF_LIFE_SECONDS = 14 * 24 * 60 * 60

/** Embedding model used for centroid vectors. */
export const CENTROID_EMBEDDING_MODEL = "voyage-4-large"

/** Embedding dimensionality. */
export const CENTROID_EMBEDDING_DIMENSIONS = 2048

/** Source weights applied when contributing a score embedding to the centroid. */
export const CENTROID_SOURCE_WEIGHTS: Readonly<Record<ScoreSource, number>> = {
  annotation: 1.0,
  evaluation: 0.8,
  custom: 0.8,
} as const

// ---------------------------------------------------------------------------
// Discovery thresholds (hybrid search)
// ---------------------------------------------------------------------------

/** Alpha for Weaviate hybrid search: 75% vector search, 25% keyword search */
export const ISSUE_DISCOVERY_SEARCH_RATIO = 0.75

/** Minimum hybrid similarity score to consider a candidate: 80% similarity */
export const ISSUE_DISCOVERY_MIN_SIMILARITY = 0.8

/** Minimum BM25 keyword matches required (OR mode): At least 1 keyword match */
export const ISSUE_DISCOVERY_MIN_KEYWORDS = 1

/** Maximum initial candidates returned from the hybrid search stage: Large pool */
export const ISSUE_DISCOVERY_MAX_CANDIDATES = 1000

// ---------------------------------------------------------------------------
// Discovery thresholds (rerank)
// ---------------------------------------------------------------------------

/** Maximum candidates sent to the reranker after hybrid search filtering. */
export const RERANK_LIMIT = 100

/** Minimum rerank relevance score to accept a candidate as a match. */
export const MIN_RERANK_RELEVANCE = 0.3

/** Rerank model identifier. */
export const RERANK_MODEL = "rerank-2.5"

// ---------------------------------------------------------------------------
// Issue details generation
// ---------------------------------------------------------------------------

/** Language model used to generate stable issue names/descriptions. */
export const ISSUE_DETAILS_GENERATION_MODEL = {
  provider: "openai",
  model: "gpt-5.4",
  reasoning: "medium",
} as const

/** Maximum recent assigned issue occurrences used when regenerating existing issue details. */
export const ISSUE_DETAILS_MAX_OCCURRENCES = 25

// ---------------------------------------------------------------------------
// Issue refresh debounce
// ---------------------------------------------------------------------------

/** Debounce window for issue name/description regeneration (8 hours in milliseconds). */
export const ISSUE_REFRESH_DEBOUNCE_MS = 8 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Denoising / visibility
// ---------------------------------------------------------------------------

/**
 * Minimum number of linked scores before a non-annotation-backed issue
 * becomes visible in the main Issues UI.
 */
export const MIN_OCCURRENCES_FOR_VISIBILITY = 2
