// ---------------------------------------------------------------------------
// Evaluation trigger defaults
// ---------------------------------------------------------------------------

/** Default sampling percentage for new issue-linked evaluations. */
export const DEFAULT_EVALUATION_SAMPLING = 10

// ---------------------------------------------------------------------------
// Evaluation name constraints
// ---------------------------------------------------------------------------

export const EVALUATION_NAME_MAX_LENGTH = 128

// ---------------------------------------------------------------------------
// Evaluation turn options
// ---------------------------------------------------------------------------

export const EVALUATION_TURNS = ["first", "every", "last"] as const

// ---------------------------------------------------------------------------
// Alignment cadence
// ---------------------------------------------------------------------------

/** Debounce window for metric recomputation after new annotations (1 hour in milliseconds). */
export const ALIGNMENT_METRIC_RECOMPUTE_DEBOUNCE_MS = 1 * 60 * 60 * 1000

/** Debounce window for full re-optimization after new annotations (8 hours in milliseconds). */
export const ALIGNMENT_FULL_REOPTIMIZE_DEBOUNCE_MS = 8 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Alignment tolerances
// ---------------------------------------------------------------------------

/**
 * MCC tolerance band for incremental refresh.
 * If derived MCC drops by more than this amount after incremental evaluation,
 * the system triggers a full re-optimization instead of keeping the current script.
 */
export const ALIGNMENT_MCC_TOLERANCE = 0.05

// ---------------------------------------------------------------------------
// Evaluation-generation job status
// ---------------------------------------------------------------------------

/**
 * TTL in seconds for Redis-backed evaluation-generation job status keys.
 * After this period the status key expires and the frontend stops polling.
 */
export const EVALUATION_JOB_STATUS_TTL_SECONDS = 3600
