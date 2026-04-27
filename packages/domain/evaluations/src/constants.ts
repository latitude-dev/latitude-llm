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

/**
 * Throttle window for incremental metric recomputation after new annotations
 * (1 hour in milliseconds). Used as `throttleMs` on the
 * `evaluations:automaticRefreshAlignment` queue task: the first annotation that
 * flows through `issues:refresh` schedules the workflow for `now + 1h`, and
 * subsequent annotations within that hour are dropped by BullMQ. Guarantees an
 * upper bound of 1h on fire latency and at most one refresh per evaluation
 * per hour, even under a constant annotation stream.
 */
export const ALIGNMENT_METRIC_RECOMPUTE_THROTTLE_MS = 1 * 60 * 60 * 1000

/**
 * Throttle window for full re-optimization after an incremental alignment
 * metric drop (8 hours in milliseconds). Used as `throttleMs` on the
 * `evaluations:automaticOptimization` queue task: the first escalation from
 * `refreshEvaluationAlignmentWorkflow` schedules the optimize workflow for
 * `now + 8h`, and subsequent escalations within that window are dropped.
 * Guarantees at most one GEPA pass per evaluation per 8h.
 */
export const ALIGNMENT_FULL_REOPTIMIZE_THROTTLE_MS = 8 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Alignment tolerances
// ---------------------------------------------------------------------------

/**
 * Alignment metric tolerance band for incremental refresh.
 * If the derived alignment metric drops by more than this amount after
 * incremental evaluation, the system triggers a full re-optimization instead
 * of keeping the current script.
 */
export const ALIGNMENT_METRIC_TOLERANCE = 0.05

// ---------------------------------------------------------------------------
// Deterministic example curation and splitting
// ---------------------------------------------------------------------------

/** Minimum curated example count before the aligner expands beyond sparse bootstrap behavior. */
export const ALIGNMENT_CURATED_DATASET_MIN_ROWS = 4

/**
 * Maximum total curated examples (positive + negative) sent into alignment in one run.
 * Collection targets a balanced split (up to half from each label, then backfill from the other).
 */
export const ALIGNMENT_CURATED_DATASET_MAX_ROWS = 100

/** Default seed used for deterministic dataset ordering and splitting. */
export const ALIGNMENT_DEFAULT_SEED = 310700

/** Fraction of curated examples assigned to the training split. */
export const ALIGNMENT_TRAIN_SPLIT = 0.7

/** Fraction of curated examples assigned to the validation split. */
export const ALIGNMENT_VALIDATION_SPLIT = 0.3
