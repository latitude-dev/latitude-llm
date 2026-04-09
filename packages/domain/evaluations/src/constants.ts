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

/** Default cooldown for user-triggered manual realignment requests (1 hour in milliseconds). */
export const ALIGNMENT_MANUAL_REALIGNMENT_RATE_LIMIT_MS = 1 * 60 * 60 * 1000

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
// Deterministic example curation and splitting
// ---------------------------------------------------------------------------

/** Minimum curated example count before the aligner expands beyond sparse bootstrap behavior. */
export const ALIGNMENT_CURATED_DATASET_MIN_ROWS = 4

/** Maximum curated example count sent into alignment in one run. */
export const ALIGNMENT_CURATED_DATASET_MAX_ROWS = 1000

/** Default seed used for deterministic dataset ordering and splitting. */
export const ALIGNMENT_DEFAULT_SEED = 310700

/** Fraction of curated examples assigned to the training split. */
export const ALIGNMENT_TRAIN_SPLIT = 0.7

/** Fraction of curated examples assigned to the validation split. */
export const ALIGNMENT_VALIDATION_SPLIT = 0.3

// ---------------------------------------------------------------------------
// Evaluation-generation job status
// ---------------------------------------------------------------------------

export const EVALUATION_ALIGNMENT_JOB_KEY_PREFIX = "evaluation-alignment"

export const EVALUATION_ALIGNMENT_JOB_STATUSES = ["pending", "running", "completed", "failed"] as const

/**
 * TTL in seconds for Redis-backed evaluation-generation job status keys.
 * After this period the status key expires and the frontend stops polling.
 */
export const EVALUATION_JOB_STATUS_TTL_SECONDS = 3600
