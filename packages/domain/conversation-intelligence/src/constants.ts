export const CONVERSATION_INTELLIGENCE_DETECTOR_VERSION = "ci-v4" as const
export const CONVERSATION_INTELLIGENCE_ANALYSIS_DEBOUNCE_MS = 5 * 60_000
export const CONVERSATION_INTELLIGENCE_RETENTION_DAYS = 90
export const CONVERSATION_INTELLIGENCE_MIN_CONTENT_LENGTH = 40
export const CONVERSATION_INTELLIGENCE_MODEL_PROVIDER = "amazon-bedrock"
export const CONVERSATION_INTELLIGENCE_MODEL = "minimax.minimax-m2.5"
export const CONVERSATION_INTELLIGENCE_EMBEDDING_MODEL = "voyage-4-large"
export const CONVERSATION_INTELLIGENCE_EMBEDDING_DIMENSIONS = 2048
export const CONVERSATION_INTELLIGENCE_LLM_MAX_DOCUMENT_CHARS = 24_000

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
