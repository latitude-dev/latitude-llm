import type { ScoreSource } from "@domain/scores"

export const ISSUE_NAME_MAX_LENGTH = 128

export const ISSUE_STATES = ["new", "escalating", "ongoing", "resolved", "regressed", "ignored"] as const

export const ISSUE_SOURCES = ["annotation", "flagger", "custom"] as const

export const NEW_ISSUE_AGE_DAYS = 7

/**
 * An issue is "escalating" when last-day occurrences exceed the 7-day
 * baseline average by this factor.
 * */
export const ESCALATION_THRESHOLD_FACTOR = 1.33

/** Escalating issues must clear at least this many recent occurrences. */
export const ESCALATION_MIN_OCCURRENCES_THRESHOLD = 20

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

/** Minimum fused hybrid score to consider a candidate: 80% relevance after vector/BM25 fusion. */
export const ISSUE_DISCOVERY_MIN_SIMILARITY = 0.8

/** Maximum candidates returned from the hybrid search stage. */
export const ISSUE_DISCOVERY_SEARCH_CANDIDATES = 1000

// ---------------------------------------------------------------------------
// Discovery thresholds (rerank)
// ---------------------------------------------------------------------------

/** Maximum candidates sent into the reranking stage. */
export const ISSUE_DISCOVERY_RERANK_CANDIDATES = 25

/** Minimum rerank relevance score required to accept an existing issue match. */
export const ISSUE_DISCOVERY_MIN_RELEVANCE = 0.3

/** Rerank model identifier for issue discovery candidate selection. */
export const ISSUE_DISCOVERY_RERANK_MODEL = "rerank-2.5"

// ---------------------------------------------------------------------------
// Issue details generation
// ---------------------------------------------------------------------------

/** Language model used to generate stable issue names/descriptions. */
export const ISSUE_DETAILS_GENERATION_MODEL = {
  provider: "amazon-bedrock",
  model: "minimax.minimax-m2.5",
  reasoning: "high",
} as const

/** Maximum recent assigned issue occurrences used when regenerating existing issue details. */
export const ISSUE_DETAILS_MAX_OCCURRENCES = 25

// ---------------------------------------------------------------------------
// Issue refresh throttle
// ---------------------------------------------------------------------------

/**
 * Throttle window for issue name/description regeneration (8 hours in
 * milliseconds). Used as `throttleMs` on the `issues:refresh` queue task:
 * the first `ScoreAssignedToIssue` schedules the refresh for `now + 8h`, and
 * subsequent assignments within that window are dropped by BullMQ. Guarantees
 * an upper bound of 8h on refresh latency and at most one refresh per issue
 * per 8h, even under a constant annotation stream.
 */
export const ISSUE_REFRESH_THROTTLE_MS = 8 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Denoising / visibility
// ---------------------------------------------------------------------------

/**
 * Minimum number of linked scores before a non-annotation-backed issue
 * becomes visible in the main Issues UI.
 */
export const MIN_OCCURRENCES_FOR_VISIBILITY = 3

// ---------------------------------------------------------------------------
// Discovery serialization locks
// ---------------------------------------------------------------------------

/**
 * TTL for the outer feedback-scoped serialization lock. Wraps retrieval, AI
 * generation, and the inner project-lock section. Sized to match the
 * activity `startToCloseTimeout` so the lock outlives any single activity
 * run; if a worker dies, Redis auto-deletion never strands the key.
 */
export const ISSUE_DISCOVERY_FEEDBACK_LOCK_TTL_SECONDS = 300

/**
 * TTL for the inner project-scoped serialization lock. Serializes brand-new
 * issue creation per project while a prior worker is still writing the
 * Postgres row and the Weaviate projection. Matches the activity timeout.
 */
export const ISSUE_DISCOVERY_PROJECT_LOCK_TTL_SECONDS = 300

/** Inner project-scoped serialization lock key. */
export const ISSUE_DISCOVERY_PROJECT_LOCK_KEY = "project"

/**
 * Outer feedback-scoped serialization lock key. Takes the SHA-256 hex digest
 * of the canonical feedback string. Hashing serializes identical feedback
 * across all sources without leaking the feedback into Redis keys.
 */
export const ISSUE_DISCOVERY_FEEDBACK_LOCK_KEY = (hash: string) => `feedback:${hash}`

// ---------------------------------------------------------------------------
// Issue update lock
// ---------------------------------------------------------------------------

/**
 * Per-issue serialization lock key. Wraps the assign-score-to-issue Postgres
 * transaction (centroid recompute) and the subsequent Weaviate projection
 * sync so concurrent writers to the same issue do not race on the projection.
 */
export const ISSUE_UPDATE_LOCK_KEY = (issueId: string) => `issue:${issueId}`

/** TTL for the per-issue update serialization lock. Matches the activity timeout. */
export const ISSUE_UPDATE_LOCK_TTL_SECONDS = 300
