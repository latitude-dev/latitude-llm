export const SCORE_SOURCES = ["evaluation", "annotation", "custom"] as const

export const ANNOTATION_SCORE_PARTIAL_SOURCE_IDS = ["UI", "API", "SYSTEM"] as const

export const SCORE_SOURCE_ID_MAX_LENGTH = 128

export const SCORE_PUBLICATION_DEBOUNCE = 5 * 60 * 1000

// ---------------------------------------------------------------------------
// Seasonal escalation detection (consumed by `escalationSignalsByIssues`)
// ---------------------------------------------------------------------------

/** Number of prior weeks pooled to derive the seasonal expected/stddev for a (dow, hour) bin. */
export const SEASONAL_HISTORY_WEEKS = 4

/**
 * Hours either side of the target (dow, hour) bin pooled into the sample
 * set. Pooling smooths the boundary (rates rarely change discontinuously
 * across an hour) and roughly halves σ's standard error vs sampling only
 * the exact target bin.
 *
 * With `1`, the pool is `{hour − 1, hour, hour + 1} × SEASONAL_HISTORY_WEEKS`
 * = 12 samples.
 */
export const SEASONAL_BUCKET_POOLING_HOURS = 1
