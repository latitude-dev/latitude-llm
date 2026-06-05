export const CONVERSATION_INTELLIGENCE_DETECTOR_VERSION = "ci-v4" as const
export const CONVERSATION_INTELLIGENCE_ANALYSIS_DEBOUNCE_MS = 5 * 60_000
export const CONVERSATION_INTELLIGENCE_RETENTION_DAYS = 90
export const CONVERSATION_INTELLIGENCE_MIN_CONTENT_LENGTH = 40
export const CONVERSATION_INTELLIGENCE_MODEL_PROVIDER = "amazon-bedrock"
export const CONVERSATION_INTELLIGENCE_MODEL = "minimax.minimax-m2.5"
export const CONVERSATION_INTELLIGENCE_EMBEDDING_MODEL = "voyage-4-large"
export const CONVERSATION_INTELLIGENCE_EMBEDDING_DIMENSIONS = 2048
export const CONVERSATION_INTELLIGENCE_LLM_MAX_DOCUMENT_CHARS = 24_000

export const CONVERSATION_MOMENT_SEGMENTATION_VERSION = "semantic-moments-v3" as const
/**
 * Continuity thresholds operate on voyage-4-large cosine similarity between a
 * turn and the current moment centroid. QA measurement on the tau2 corpus
 * (1,860 adjacent-moment pairs) put the adjacent-turn similarity distribution
 * at p25 0.46 / p50 0.53 / p75 0.66 / p90 0.86 — the previous 0.74–0.84 clamp
 * range sat entirely above it and forced a split at nearly every turn
 * (avg 1.84 messages per moment). The range below keeps same-topic exchanges
 * together while still splitting at genuine topic shifts.
 */
export const CONVERSATION_MOMENT_CONTINUITY_DEFAULT_THRESHOLD = 0.55
export const CONVERSATION_MOMENT_CONTINUITY_MIN_THRESHOLD = 0.45
export const CONVERSATION_MOMENT_CONTINUITY_MAX_THRESHOLD = 0.65

export const INTERACTION_KINDS = ["user_conversation", "unknown"] as const

export const ANALYSIS_LENSES = ["conversation", "telemetry_only"] as const
export const ANALYSIS_STATUSES = [
  "analyzed",
  "skipped_empty",
  "skipped_too_short",
  "skipped_malformed",
  "skipped_non_conversation",
  "failed",
] as const
export const OUTCOMES = ["resolved", "escalated", "abandoned", "unresolved", "unknown"] as const
export const MOMENT_KINDS = [
  "escalation",
  "hesitation",
  "abandonment",
  "user_frustration",
  "user_satisfaction",
  "resolution",
  "policy_refusal",
  "clarification_loop",
] as const
export const MOMENT_ACTORS = ["user", "assistant", "tool", "system", "unknown"] as const

export const SEMANTIC_MOMENT_BOUNDARY_REASONS = [
  "session_start",
  "semantic_drift",
  "max_length",
  "role_boundary",
  "topic_drift",
  "session_end",
] as const
export const SEMANTIC_MOMENT_SEGMENTATION_METHODS = ["embedding_continuity"] as const

/**
 * Conversation-scope threshold calibration. QA measured anchor-vs-turn
 * similarity p95 below the hand-picked 0.58 gate for every label kind, so
 * gates are derived per project from quantiles of the corpus's own anchor
 * score distribution, clamped to the bands below.
 */
export const CONVERSATION_CALIBRATION_SESSION_SAMPLE = 80
export const CONVERSATION_CALIBRATION_TTL_MS = 24 * 60 * 60_000
/** Label gate = clamp(per-kind positive-score quantile, band). */
export const CONVERSATION_CALIBRATION_LABEL_QUANTILE = 0.95
export const CONVERSATION_CALIBRATION_LABEL_THRESHOLD_MIN = 0.48
export const CONVERSATION_CALIBRATION_LABEL_THRESHOLD_MAX = 0.62
/** Margin = clamp(median margin among above-gate turns, band). */
export const CONVERSATION_CALIBRATION_LABEL_MARGIN_MIN = 0.02
export const CONVERSATION_CALIBRATION_LABEL_MARGIN_MAX = 0.06
/** Ritual gate calibrated with the same quantile rule as labels. */
export const CONVERSATION_CALIBRATION_RITUAL_QUANTILE = 0.9
/** Continuity clamps from the adjacent-turn similarity distribution. */
export const CONVERSATION_CALIBRATION_CONTINUITY_MIN_FLOOR = 0.35
export const CONVERSATION_CALIBRATION_CONTINUITY_MAX_CEIL = 0.75
/**
 * Turns judged per kind when precision-refining a calibrated label gate.
 * Deep enough to verify the score band below the formulaic top hits — at 12
 * the walk never reached real-but-naturally-phrased positives and every kind
 * fell back to its static gate.
 */
export const CONVERSATION_CALIBRATION_JUDGE_SAMPLE = 24
/**
 * Judged precision the calibrated gate must maintain. 0.7 let through
 * user-visible mislabels (a clear return request labeled hesitation); labels
 * are user-facing, so the bar is high and kinds that cannot meet it are
 * disabled per project instead.
 */
export const CONVERSATION_CALIBRATION_PRECISION_TARGET = 0.8
/**
 * Gate value that disables a label kind for a project: cosine similarity
 * cannot reach it, so the detector never fires. Applied when the calibration
 * judge inspects a kind's best-scoring candidates and cannot confirm a
 * precision band — mislabeling is worse than not labeling.
 */
export const CONVERSATION_CALIBRATION_DISABLED_GATE = 1.01
