/**
 * Every tunable for the live behavior taxonomy.
 *
 * Initial values are seeded by analogy to `@domain/issues` and to published
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

/** Gardening works over the live taxonomy window: newest observations first. */
export const TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX = 100_000

/** Maximum in-memory proposal sample passed to clustering helpers. */
export const TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX = 10_000

/** Hard cap on per-cluster batch reads inside the live gardening window. */
export const TAXONOMY_LIST_ALL_BY_CLUSTER_MAX = 100_000

// ---------------------------------------------------------------------------
// Births (noise sweep) + merge / death
// ---------------------------------------------------------------------------

export const TAXONOMY_NOISE_LOOKBACK_DAYS = 7
/** Lowered from 8 in the adversarial-review pass; see cold-start gate above. */
export const TAXONOMY_NOISE_BIRTH_MIN_OBSERVATIONS = 3

/**
 * Two noise embeddings are connected when their cosine ≥ this.
 * Seeded-Acme Voyage tuning raised this from 0.78 to 0.82: the full 1,574
 * session corpus produced clearer topic births without the broad
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
export const TAXONOMY_VISIBLE_BIRTH_MIN_OBSERVATION_RATIO = 0.05

/** Re-absorb a candidate birth into an existing cluster instead of birthing. */
export const TAXONOMY_ABSORPTION_THRESHOLD = 0.85

/** Pairwise centroid similarity threshold required to merge two active clusters. */
export const TAXONOMY_MERGE_THRESHOLD = 0.88

export const TAXONOMY_MERGE_NEAREST_NEIGHBORS = 10
export const TAXONOMY_MERGE_CANDIDATES_PER_PARENT = 100

export const TAXONOMY_DEAD_CLUSTER_MASS_FLOOR = 0.5
export const TAXONOMY_DEAD_CLUSTER_INACTIVITY_DAYS = 30

// ---------------------------------------------------------------------------
// Hierarchy + naming
// ---------------------------------------------------------------------------

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
// Retry policy: worst-case cumulative wait ≈29s, just under the lock TTL.
export const TAXONOMY_CLUSTER_LOCK_MAX_RETRIES = 18
export const TAXONOMY_CLUSTER_LOCK_RETRY_BASE_DELAY_MS = 100
export const TAXONOMY_CLUSTER_LOCK_RETRY_MAX_DELAY_MS = 2_000
export const TAXONOMY_GARDEN_LOCK_TTL_SECONDS = Math.ceil(TAXONOMY_GARDENING_MAX_RUNTIME_MS / 1000) + 60

// ---------------------------------------------------------------------------
// Cluster tree (categories are depth-0 nodes; depth = clustering density)
// ---------------------------------------------------------------------------

/**
 * Levels below root. Until parent nodes become aggregate-only categories, keep
 * online gardening to one child level; recursively splitting direct-assignment
 * residue can create parent/child/grandchild duplicates where the deepest node
 * simply absorbs the broad root's mass.
 */
export const TAXONOMY_TREE_MAX_DEPTH = 2
/** Maximum number of children a single recursion pass exposes under one node. */
export const TAXONOMY_TREE_CHILDREN_CAP = 8
/** A node recurses into children when it has enough directly assigned members. */
export const TAXONOMY_TREE_RECURSE_MIN_OBSERVATIONS = 60
/** Bound recursion work per gardening run. */
export const TAXONOMY_TREE_RECURSE_PER_RUN = 3
/**
 * Child birth density derives from the parent's own member-pairwise
 * similarity distribution (per-node density schedule), clamped below.
 */
export const TAXONOMY_TREE_CHILD_LINK_QUANTILE = 0.7
export const TAXONOMY_TREE_CHILD_LINK_MIN = 0.78
/**
 * Child splits should expose navigable subtopics under broad roots. A very
 * high per-node quantile can overfit to boilerplate-similar support sessions
 * and reject useful retail subtopic splits as tiny shards, so cap child-level
 * density near the coarse topic boundary.
 */
export const TAXONOMY_TREE_CHILD_LINK_MAX = 0.8
/** Diameter scales off the link threshold: (1 - link) * factor, clamped. */
export const TAXONOMY_TREE_CHILD_DIAMETER_FACTOR = 2.5
export const TAXONOMY_TREE_CHILD_DIAMETER_MIN = 0.3
export const TAXONOMY_TREE_CHILD_DIAMETER_MAX = 0.6
/**
 * Recursion rollback: a split must produce at least two children covering a
 * meaningful share of members, and no child may dominate the covered mass —
 * otherwise the node has no internal structure at the next density and stays
 * a leaf.
 */
export const TAXONOMY_TREE_MIN_CHILDREN = 2
export const TAXONOMY_TREE_MIN_COVERAGE = 0.3
export const TAXONOMY_TREE_MAX_CHILD_DOMINANCE = 0.9
export const TAXONOMY_TREE_DEEP_MAX_CHILD_DOMINANCE = 0.75
