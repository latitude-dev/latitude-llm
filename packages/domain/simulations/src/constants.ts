// ---------------------------------------------------------------------------
// Name and field limits
// ---------------------------------------------------------------------------

/** Maximum length for a simulation name (defined in the `*.sim.*` file). */
export const SIMULATION_NAME_MAX_LENGTH = 128

/** Maximum length for individual evaluation cuid/source-id entries in the `evaluations` array. */
export const SIMULATION_EVALUATIONS_MAX_LENGTH = 128

// ---------------------------------------------------------------------------
// Threshold sentinel
// ---------------------------------------------------------------------------

/** Sentinel value for `metadata.threshold` when the user provides a custom threshold function. */
export const SIMULATION_THRESHOLD_CUSTOM_SENTINEL = "CUSTOM" as const

// ---------------------------------------------------------------------------
// Dataset sentinel
// ---------------------------------------------------------------------------

/** Sentinel value for `dataset` when the user provides a custom dataset loader function. */
export const SIMULATION_DATASET_CUSTOM_SENTINEL = "CUSTOM" as const
