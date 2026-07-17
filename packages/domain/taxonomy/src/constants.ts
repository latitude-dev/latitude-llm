/**
 * Every tunable for the live behavior taxonomy.
 *
 * Initial values are seeded by analogy to `@domain/signals` and to published
 * cluster-labeling baselines, then refined by a tuning pass on the seeded
 * Acme corpus. They are MVP defaults, not optimal values — see
 * `dev-docs/taxonomy.md`.
 */

// ---------------------------------------------------------------------------
// Cluster + observation shape
// ---------------------------------------------------------------------------

export const TAXONOMY_CLUSTER_NAME_MAX_LENGTH = 80
export const TAXONOMY_CLUSTER_DESCRIPTION_MAX_LENGTH = 280
export const TAXONOMY_PENDING_DISPLAY_NAME = "Pending"

/**
 * Single clustering dimension. Taxonomy observations are session-level topic
 * projections; moment labels carry behavioural/process facets separately.
 */
export const TAXONOMY_DIMENSIONS = ["topic"] as const

export const TAXONOMY_CLUSTER_STATES = ["active", "merged", "deprecated"] as const

/**
 * The divisive build emits exactly these three transitions:
 *   - `birth`  — a freshly built node with no confident predecessor.
 *   - `death`  — a previously-active cluster no new node continued.
 *   - `continuation` — a new node reused an old cluster's id (Hungarian 1:1
 *     centroid match ≥ `TAXONOMY_CONTINUATION_THRESHOLD`).
 * `split` / `merge` were retired with the bottom-up gardening path: a confident
 * 1:1 continuation carries the identity trend UIs need, and the divisive build
 * cannot produce near-duplicate siblings to merge. See `dev-docs/taxonomy.md`.
 */
export const TAXONOMY_LINEAGE_TRANSITION_TYPES = ["birth", "death", "continuation"] as const

export const TAXONOMY_RUN_TRIGGERS = ["cron", "manual", "threshold"] as const
export const TAXONOMY_RUN_STATUSES = ["pending", "running", "completed", "failed"] as const

export const TAXONOMY_OBSERVATION_ASSIGNMENT_METHODS = [
  "centroid_online",
  "gardening_birth",
  "gardening_reassign",
  "noise",
] as const

// ---------------------------------------------------------------------------
// Custom behaviors
// ---------------------------------------------------------------------------

export const CUSTOM_BEHAVIOR_NAME_MAX_LENGTH = 80

export const CUSTOM_BEHAVIOR_STATUSES = ["pending", "generating", "ready", "failed"] as const

/**
 * Per-project cap on custom behaviors (LAT-746 Q1 = flat 10), enforced in the
 * create use-case. Each behavior spawns its own scoped clusters, a ClickHouse
 * `custom_behavior_assignments` slice, and a workflow run, so the cap bounds
 * CH storage + LLM naming cost. Deliberately a single constant: raising it is a
 * one-line change, no per-plan machinery.
 */
export const MAX_CUSTOM_BEHAVIORS_PER_PROJECT = 10

// ---------------------------------------------------------------------------
// Embedding + summary
// ---------------------------------------------------------------------------

// The embedding model is resolved at call time via `resolveEmbeddingConfig()`
// (`@domain/ai`) — same global config as `@domain/signals` + trace-search,
// single embedding surface, fixed `EMBEDDING_DIMENSIONS` (2048).

export const TAXONOMY_PROJECTION_METHODS = ["moment_text_embedding", "session_user_intent_embedding"] as const

// ---------------------------------------------------------------------------
// Session document
// ---------------------------------------------------------------------------

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
export const TAXONOMY_GARDENING_SWEEP_SPREAD_MS = 5 * 60 * 60_000
export const TAXONOMY_GARDENING_THROTTLE_MS = 60 * 60_000

/**
 * Scoped-gardening sweep: the periodic enqueue that keeps every custom behavior
 * a *living* taxonomy (the scoped analogue of the global `gardenSweep`). Same 6h
 * cadence as the global sweep. A behavior gardened within
 * `CUSTOM_BEHAVIOR_GARDENING_MIN_INTERVAL_MS` is skipped so a create-time run or
 * a prior sweep isn't redone every tick — eligibility reads `last_gardened_at`.
 */
export const CUSTOM_BEHAVIOR_GARDENING_CRON_KEY = "taxonomy:garden-custom-behavior-sweep"
export const CUSTOM_BEHAVIOR_GARDENING_CRON_PATTERN = "0 */6 * * *"
export const CUSTOM_BEHAVIOR_GARDENING_MIN_INTERVAL_MS = 5 * 60 * 60_000
/**
 * Cold-start gate. Lowered from the spec's original `50` after the
 * adversarial-review pass concluded the first 2–4 weeks of empty-state UX
 * was worse than the risk of slightly noisier births on low-volume mature
 * projects. The regular/young split was collapsed into a single value so the
 * eligibility check has no edge cases. See spec "Cold-start window."
 */
export const TAXONOMY_GARDENING_MIN_OBSERVATIONS = 15

/** Gardening works over the live taxonomy window: newest observations first. */
/** System-wide hard cap for the in-memory proposal sample passed to clustering helpers. */
export const TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX = 1_500
export const TAXONOMY_CLUSTERING_SAMPLE_STRATEGY = "day_stratified_hash_round_robin"

/** Read-path live window for project/cluster observation pages. */
export const TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX = 10_000

/** Hard cap on per-cluster batch reads inside the live gardening window. */
export const TAXONOMY_LIST_ALL_BY_CLUSTER_MAX = 10_000

// ---------------------------------------------------------------------------
// Gardening sample window
// ---------------------------------------------------------------------------

/**
 * The single gardening sample window: how far back a gardening pass day-
 * stratifies its observation sample. Shared by BOTH the global divisive build
 * and scoped custom-behavior sampling (and the sweep's eligibility count) so the
 * two can never drift. Not per-behavior selectable — scoped gardening tracks the
 * global gardening model.
 */
export const TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS = 7

// ---------------------------------------------------------------------------
// Hierarchy + naming
// ---------------------------------------------------------------------------

export const TAXONOMY_SEARCH_MIN_SCORE = 0.2
export const TAXONOMY_SEARCH_MIN_VECTOR_SIMILARITY = 0.5

export const TAXONOMY_DEFAULT_NAMING_MODEL = {
  provider: "amazon-bedrock",
  model: "minimax.minimax-m2.5",
  temperature: 0.2,
  maxTokens: 1600,
} as const

export const TAXONOMY_NAMING_REFRESH_OBSERVATIONS = 25
export const TAXONOMY_NAMING_TIMEOUT_MS = 60_000

export const TAXONOMY_FPS_SAMPLE_BUDGET_MIN = 4
export const TAXONOMY_FPS_SAMPLE_BUDGET_MAX = 12

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** Same TTL horizon as semantic-search embeddings. */
export const TAXONOMY_OBSERVATION_RETENTION_DAYS = 30

/**
 * Taxonomy observations are always ingested while retained. Gardening is the
 * bounded part: every pass operates on the newest live observations only.
 */

// ---------------------------------------------------------------------------
// Lock TTLs (Redis SET NX EX)
// ---------------------------------------------------------------------------

export const TAXONOMY_CLUSTER_LOCK_TTL_SECONDS = 30

// ---------------------------------------------------------------------------
// Divisive builder — per-depth schedule (adaptive, node-relative separation)
//
// Each depth carries a scale-free split policy: broad-then-narrow child counts
// and size floors, plus the node-relative separation gate. Absolute cosine
// similarity is not comparable across projects, so acceptance is judged against
// each node's own member spread rather than a fixed sibling-cosine ceiling.
//
// Size/score/child-count limits are the original static tuning; the four
// adaptive fields (dominance + relative separation + within/routing quantiles)
// are calibrated in `src/calibration/` (see BASELINES.md): the root separation
// 0.45 resolves the narrow-domain pilot's single production cluster into four
// coherent intents, tightening with depth so deeper splits must be more clearly
// separated. `withinDistanceQuantile` reads the spread from the upper bulk of
// member distances (outliers can't wave a weak split through);
// `routingSimilarityQuantile` admits ~85% of a child's known members.
// ---------------------------------------------------------------------------

export interface TaxonomyTreeDepthSchedule {
  readonly maxChildren: number
  readonly minClusterFraction: number
  readonly minClusterAbs: number
  readonly minSplitScore: number
  readonly maxDominantChildFraction: number
  readonly minRelativeSeparation: number
  readonly withinDistanceQuantile: number
  readonly routingSimilarityQuantile: number
}

export const TAXONOMY_TREE_DEPTH_SCHEDULE: readonly TaxonomyTreeDepthSchedule[] = [
  {
    maxChildren: 10,
    minClusterFraction: 0.01,
    minClusterAbs: 20,
    minSplitScore: 1.5,
    maxDominantChildFraction: 0.9,
    minRelativeSeparation: 0.45,
    withinDistanceQuantile: 0.8,
    routingSimilarityQuantile: 0.15,
  },
  {
    maxChildren: 8,
    minClusterFraction: 0.03,
    minClusterAbs: 10,
    minSplitScore: 1.2,
    maxDominantChildFraction: 0.9,
    minRelativeSeparation: 0.55,
    withinDistanceQuantile: 0.8,
    routingSimilarityQuantile: 0.15,
  },
  {
    maxChildren: 6,
    minClusterFraction: 0.05,
    minClusterAbs: 8,
    minSplitScore: 1.1,
    maxDominantChildFraction: 0.9,
    minRelativeSeparation: 0.65,
    withinDistanceQuantile: 0.8,
    routingSimilarityQuantile: 0.15,
  },
]

/**
 * Pre-adaptive static schedule (absolute sibling-cosine gate). Retained as the
 * regression baseline for the calibration harness and the `off`-mode
 * publication path; removed once adaptive is the enforced default.
 */
export interface TaxonomyTreeStaticDepthSchedule {
  readonly maxChildren: number
  readonly minClusterFraction: number
  readonly minClusterAbs: number
  readonly maxSiblingCosine: number
  readonly minSplitScore: number
}

export const TAXONOMY_TREE_STATIC_DEPTH_SCHEDULE: readonly TaxonomyTreeStaticDepthSchedule[] = [
  { maxChildren: 10, minClusterFraction: 0.01, minClusterAbs: 20, maxSiblingCosine: 0.85, minSplitScore: 1.5 },
  { maxChildren: 8, minClusterFraction: 0.03, minClusterAbs: 10, maxSiblingCosine: 0.9, minSplitScore: 1.2 },
  { maxChildren: 6, minClusterFraction: 0.05, minClusterAbs: 8, maxSiblingCosine: 0.93, minSplitScore: 1.1 },
]

// ---------------------------------------------------------------------------
// Cross-run lineage continuity (Hungarian matcher)
//
// Between building the tree and persisting it, the build matches new nodes 1:1
// against the previously-active clusters by centroid cosine. A match above
// CONTINUATION_THRESHOLD reuses the old id (emits `continuation`); below it the
// node is born fresh. NAME_REUSE_THRESHOLD is the tighter band at which the
// topic moved so little that re-naming would only churn the label, so the old
// name is carried over and the naming step skips the cluster.
//
// Seeded by analogy to published lineage-layer baselines; tune offline on real
// cross-pass corpora. Biased toward continuation on purpose: a false
// continuation is a visual no-op, a false birth+death pair breaks trend charts.
// ---------------------------------------------------------------------------

export const TAXONOMY_CONTINUATION_THRESHOLD = 0.92
export const TAXONOMY_NAME_REUSE_THRESHOLD = 0.95

/** k-means++ restarts per K sweep at each tree node. */
export const TAXONOMY_KMEANS_RESTARTS = 3
/** k-means iteration cap. Convergence on normalized 2048-D embeddings is fast. */
export const TAXONOMY_KMEANS_MAX_ITER = 25
/** k-means convergence tolerance in (1 - cosine) centroid drift. */
export const TAXONOMY_KMEANS_TOLERANCE = 1e-4

// ---------------------------------------------------------------------------
// Clustering worker resource bounds
//
// The divisive build runs in a dedicated Node worker thread. These bound a
// single worker invocation — one shared deadline and memory budget covering
// the whole run (static plus, in shadow mode, adaptive). The measured
// max-sample (1,500 × 2,048) build is ~6s and a real 2,048d pilot build ~12s;
// the timeout is a generous backstop against a hung/looping worker, not a tuned
// SLA. The old-generation budget is the calibrated worker heap ceiling: the
// measured build peaks well under it.
// ---------------------------------------------------------------------------

export const TAXONOMY_CLUSTERING_WORKER_TIMEOUT_MS = 5 * 60_000
export const TAXONOMY_CLUSTERING_WORKER_MAX_OLD_GEN_MB = 512
