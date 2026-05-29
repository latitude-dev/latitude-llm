/**
 * Every tunable for the live behavior taxonomy.
 *
 * Initial values are seeded by analogy to `@domain/issues` and to published
 * cluster-labeling baselines, then refined by a tuning pass on the seeded
 * Acme corpus. They are MVP defaults, not optimal values — see
 * `specs/live-taxonomy.md#tuning-and-the-benchmark-corpus`.
 */

// ---------------------------------------------------------------------------
// Cluster + observation shape
// ---------------------------------------------------------------------------

export const TAXONOMY_CLUSTER_NAME_MAX_LENGTH = 80
export const TAXONOMY_CLUSTER_DESCRIPTION_MAX_LENGTH = 280

export const TAXONOMY_CLUSTER_STATES = ["active", "merged", "deprecated"] as const
export const TAXONOMY_CATEGORY_STATES = ["active", "deprecated"] as const

/**
 * MVP emits `birth` / `death` / `merge` from gardening activities A/B/C.
 * `continuation` and `split` are reserved values added by the
 * Hungarian-lineage Future Work and are not written by MVP code.
 */
export const TAXONOMY_LINEAGE_TRANSITION_TYPES = ["birth", "death", "merge", "continuation", "split"] as const

export const TAXONOMY_RUN_TRIGGERS = ["cron", "manual", "threshold"] as const
export const TAXONOMY_RUN_STATUSES = ["pending", "running", "completed", "failed"] as const

export const TAXONOMY_OBSERVATION_ASSIGNMENT_METHODS = [
  "centroid_online",
  "gardening_birth",
  "gardening_reassign",
  "noise",
] as const

// ---------------------------------------------------------------------------
// Embedding + summary
// ---------------------------------------------------------------------------

/** Same family as `@domain/issues` + trace-search, single embedding-account surface. */
export const TAXONOMY_EMBEDDING_MODEL = "voyage-4-large"
export const TAXONOMY_EMBEDDING_DIMENSIONS = 2048

/**
 * Used only when `TAXONOMY_SUMMARY_STRATEGY = "llm"`. Summaries are
 * 1-sentence intent labels; reasoning tokens buy nothing here.
 */
export const TAXONOMY_SUMMARY_MODEL = { provider: "anthropic", model: "claude-haiku-4-5" } as const

/**
 * Global text-to-embed switch.
 *
 * - `"embed_direct"` (MVP default): no LLM call; embed normalized
 *   conversation text directly.
 * - `"llm"`: summarize via LLM, then embed the summary.
 *
 * Tradeoff in `specs/live-taxonomy.md#why-embed_direct-is-the-mvp-default`.
 */
export const TAXONOMY_SUMMARY_STRATEGIES = ["embed_direct", "llm"] as const
export type TaxonomySummaryStrategy = (typeof TAXONOMY_SUMMARY_STRATEGIES)[number]

export const TAXONOMY_SUMMARY_STRATEGY: TaxonomySummaryStrategy = "embed_direct"

/**
 * Used only when `TAXONOMY_SUMMARY_STRATEGY = "llm"`. Below this token count
 * we skip the LLM summary and embed conversation text directly even on the
 * opt-in path — short sessions are already single-intent.
 */
export const TAXONOMY_SUMMARY_MIN_SESSION_TOKENS = 500

// ---------------------------------------------------------------------------
// Session document
// ---------------------------------------------------------------------------

export const TAXONOMY_SESSION_DOCUMENT_MAX_LENGTH = 30_000
export const TAXONOMY_SESSION_MIN_LENGTH = 200

// ---------------------------------------------------------------------------
// Centroid math
// ---------------------------------------------------------------------------

/** 30 days. Slower decay than issues (14d); behavior categories move slower than failures. */
export const TAXONOMY_CENTROID_HALF_LIFE_SECONDS = 30 * 24 * 60 * 60

/** Single weight bucket in MVP. Multi-source weighting is Future Work. */
export type TaxonomyObservationWeightScheme = { readonly default: number }
export const TAXONOMY_OBSERVATION_WEIGHT_SCHEME: TaxonomyObservationWeightScheme = { default: 1.0 }

// ---------------------------------------------------------------------------
// Online assignment
// ---------------------------------------------------------------------------

export const TAXONOMY_OBSERVATION_DEBOUNCE_MS = 5 * 60_000

export const TAXONOMY_ASSIGN_TOPK = 10
export const TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD = 0.65
export const TAXONOMY_ASSIGN_RELATIVE_MARGIN = 0.06
export const TAXONOMY_ASSIGN_TEMPERATURE = 0.08

// ---------------------------------------------------------------------------
// Gardening cadence
// ---------------------------------------------------------------------------

export const TAXONOMY_GARDENING_CRON_KEY = "taxonomy:garden-sweep"
export const TAXONOMY_GARDENING_CRON_PATTERN = "0 */6 * * *"
export const TAXONOMY_GARDENING_THROTTLE_MS = 60 * 60_000
/**
 * Cold-start gate. Lowered from the spec's original `50` after the
 * adversarial-review pass concluded the first 2–4 weeks of empty-state UX
 * was worse than the risk of slightly noisier births on low-volume mature
 * projects. The regular/young split was collapsed into a single value so the
 * eligibility check has no edge cases. See spec "Cold-start window."
 */
export const TAXONOMY_GARDENING_MIN_OBSERVATIONS = 15
export const TAXONOMY_GARDENING_MAX_RUNTIME_MS = 5 * 60_000
export const TAXONOMY_GARDENING_STALE_GRACE_MS = 60_000
export const TAXONOMY_GARDENING_SWEEP_BATCH = 25

/**
 * Hard cap on `listAllByCluster` results. Merge needs every row to reassign;
 * naming/trends only need a sample. Pick generously for merge (50k clusters
 * × ~1k obs each is well past typical) and rely on callers to pass a smaller
 * value where a sample is enough.
 */
export const TAXONOMY_LIST_ALL_BY_CLUSTER_MAX = 50_000

// ---------------------------------------------------------------------------
// Births (noise sweep) + merge / death
// ---------------------------------------------------------------------------

export const TAXONOMY_NOISE_LOOKBACK_DAYS = 7
/** Lowered from 8 in the adversarial-review pass; see cold-start gate above. */
export const TAXONOMY_NOISE_BIRTH_MIN_OBSERVATIONS = 3

/**
 * Two noise embeddings are connected when their cosine ≥ this.
 * Seeded-Acme Voyage tuning raised this from 0.78 to 0.82: the full 1,574
 * session corpus produced clearer small behavior births without the broad
 * chaining seen at looser thresholds.
 */
export const TAXONOMY_BIRTH_LINK_THRESHOLD = 0.82

/**
 * Reject candidates whose max pairwise cosine distance exceeds this — cuts
 * single-linkage chains. Full-corpus seeded-Acme Voyage tuning kept this at
 * 0.45; looser diameters admitted broad single-linkage components.
 */
export const TAXONOMY_BIRTH_MAX_DIAMETER = 0.45

export const TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_FLOOR = 4
export const TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_RATIO = 0.005
export const TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_CEILING = 30

/** Re-absorb a candidate birth into an existing cluster instead of birthing. */
export const TAXONOMY_ABSORPTION_THRESHOLD = 0.85

/** Pairwise merge threshold between two active clusters. */
export const TAXONOMY_MERGE_THRESHOLD = 0.92

export const TAXONOMY_DEAD_CLUSTER_MASS_FLOOR = 0.5
export const TAXONOMY_DEAD_CLUSTER_INACTIVITY_DAYS = 30

// ---------------------------------------------------------------------------
// Hierarchy + naming
// ---------------------------------------------------------------------------

export const TAXONOMY_HIERARCHY_MAX_CATEGORIES = 15
export const TAXONOMY_CATEGORY_CONTINUATION_THRESHOLD = 0.8

export const TAXONOMY_SEARCH_MIN_SCORE = 0.2
export const TAXONOMY_SEARCH_MIN_VECTOR_SIMILARITY = 0.5

export const TAXONOMY_NAMING_MODEL = {
  provider: "amazon-bedrock",
  model: "minimax.minimax-m2.5",
} as const
export const TAXONOMY_NAMING_REFRESH_OBSERVATIONS = 25
export const TAXONOMY_NAMING_TIMEOUT_MS = 60_000

export const TAXONOMY_FPS_SAMPLE_BUDGET_MIN = 4
export const TAXONOMY_FPS_SAMPLE_BUDGET_MAX = 12

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export const TAXONOMY_OBSERVATION_RETENTION_DAYS = 90

// ---------------------------------------------------------------------------
// Lock TTLs (Redis SET NX EX)
// ---------------------------------------------------------------------------

export const TAXONOMY_CLUSTER_LOCK_TTL_SECONDS = 30
// Retry policy: worst-case cumulative wait ≈29s, just under the lock TTL.
export const TAXONOMY_CLUSTER_LOCK_MAX_RETRIES = 18
export const TAXONOMY_CLUSTER_LOCK_RETRY_BASE_DELAY_MS = 100
export const TAXONOMY_CLUSTER_LOCK_RETRY_MAX_DELAY_MS = 2_000
export const TAXONOMY_GARDEN_LOCK_TTL_SECONDS = Math.ceil(TAXONOMY_GARDENING_MAX_RUNTIME_MS / 1000) + 60
