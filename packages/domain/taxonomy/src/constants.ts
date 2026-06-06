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

/**
 * Maximum active clusters per dimension a project can hold. Beyond this the
 * taxonomy stops being navigable, so the noise sweep recalibrates birth
 * density as the count grows (see TAXONOMY_BIRTH_LINK_PRESSURE_RANGE) and
 * stops birthing entirely at the cap. Capacity frees up through merges and
 * deprecations.
 */
export const TAXONOMY_MAX_ACTIVE_CLUSTERS = 40

/**
 * How much the birth connectivity threshold tightens as the active cluster
 * count approaches TAXONOMY_MAX_ACTIVE_CLUSTERS: at zero clusters births use
 * TAXONOMY_BIRTH_LINK_THRESHOLD, at the cap they would need
 * TAXONOMY_BIRTH_LINK_THRESHOLD + this range (denser, tighter candidates).
 * The birth member floor scales up alongside it.
 */
export const TAXONOMY_BIRTH_LINK_PRESSURE_RANGE = 0.06

/** Re-absorb a candidate birth into an existing cluster instead of birthing. */
export const TAXONOMY_ABSORPTION_THRESHOLD = 0.85

/**
 * Pairwise merge threshold between two active clusters. Used as the
 * similarity-only fallback for candidate pairs the LLM judge cannot evaluate
 * (a member still carries the "Pending" birth placeholder name).
 */
export const TAXONOMY_MERGE_THRESHOLD = 0.88

/**
 * Pairs at/above this centroid similarity become merge candidates evaluated
 * by the LLM merge judge. QA at 500 sessions showed cosine in the 0.86–0.92
 * band carries no merge signal on a dense support corpus: the worst wrong
 * pair (order lookup vs action approval) scored 0.919 while true duplicates
 * scored 0.885. Similarity only nominates candidates; the judge decides.
 */
export const TAXONOMY_MERGE_JUDGE_THRESHOLD = 0.86

/** Concurrent LLM merge-judge calls per gardening run. */
export const TAXONOMY_MERGE_JUDGE_CONCURRENCY = 4
export const TAXONOMY_MERGE_NEAREST_NEIGHBORS = 10
export const TAXONOMY_MERGE_CANDIDATES_PER_PARENT = 100

/**
 * Cluster judges (merge dedup, purity audit) run on Haiku: short structured
 * verdicts where a fast non-reasoning model is cheaper and avoids the
 * reasoning-budget truncation failures seen with reasoning models.
 */
export const TAXONOMY_JUDGE_MODEL = {
  provider: "amazon-bedrock",
  model: "anthropic.claude-haiku-4-5-20251001-v1:0",
} as const

/**
 * Name-duplicate merge nomination: clusters whose *names* overlap heavily can
 * be the same topic even when their full-text centroids diverge (the naming
 * pass abstracts away context the embeddings keep — QA: "Account
 * Verification" vs "Account verification using name and zip code" sat at
 * 0.742 cosine). Pairs with name-token Jaccard at/above the threshold are
 * nominated to the judge when their centroids clear the (lower) floor.
 */
export const TAXONOMY_MERGE_NAME_NOMINATION_JACCARD = 0.5
export const TAXONOMY_MERGE_NAME_NOMINATION_MIN_SIMILARITY = 0.65

/**
 * A merge component's minimum pairwise similarity must stay at/above this
 * floor. Births are diameter-bounded but transitive merge chains were not:
 * one QA run chained six distinct intents into a single cluster through
 * pairwise ~0.88 links. Components failing the floor are skipped this run.
 */
export const TAXONOMY_MERGE_COMPONENT_MIN_SIMILARITY = 0.82

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
// Threshold calibration (clustering scope)
// ---------------------------------------------------------------------------

/**
 * Hand-picked similarity gates drift wrong across corpora (QA: every
 * misbehaving subsystem was the one still on hand-picked values). The
 * calibration pass derives gates from each project's own score distributions,
 * clamped to the guardrail bands below, and stores them in
 * `calibration_profiles`. Constants remain the fallback for uncalibrated
 * projects.
 */
export const TAXONOMY_CALIBRATION_EMBEDDING_SAMPLE = 600
export const TAXONOMY_CALIBRATION_SCORE_SAMPLE = 4_000
/** Recompute when the stored profile is older than this. */
export const TAXONOMY_CALIBRATION_TTL_MS = 24 * 60 * 60_000
/** Birth link = clamp(pairwise-similarity quantile, band). */
export const TAXONOMY_CALIBRATION_BIRTH_LINK_QUANTILE = 0.92
export const TAXONOMY_CALIBRATION_BIRTH_LINK_MIN = 0.76
export const TAXONOMY_CALIBRATION_BIRTH_LINK_MAX = 0.88
/** Diameter scales off the link threshold: (1 - link) * factor, clamped. */
export const TAXONOMY_CALIBRATION_DIAMETER_FACTOR = 2.5
export const TAXONOMY_CALIBRATION_DIAMETER_MIN = 0.3
export const TAXONOMY_CALIBRATION_DIAMETER_MAX = 0.6
/** Assignment gate = clamp(p10 of assigned-observation confidences, band). */
export const TAXONOMY_CALIBRATION_ASSIGN_QUANTILE = 0.1
export const TAXONOMY_CALIBRATION_ASSIGN_MIN = 0.55
export const TAXONOMY_CALIBRATION_ASSIGN_MAX = 0.75
/** Purity audit: judged clusters per calibration and members sampled each. */
export const TAXONOMY_CALIBRATION_PURITY_CLUSTERS = 6
export const TAXONOMY_CALIBRATION_PURITY_MEMBERS = 6

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
/** Governor caps per level. */
export const TAXONOMY_TREE_ROOT_CAP = 6
export const TAXONOMY_TREE_CHILDREN_CAP = 8
/**
 * Root births cluster at a coarser density than the old flat threshold so
 * depth-0 nodes play the category role. Calibration may override via the
 * clustering profile's rootLinkThreshold.
 */
export const TAXONOMY_TREE_ROOT_LINK_THRESHOLD = 0.7
export const TAXONOMY_CALIBRATION_ROOT_LINK_QUANTILE = 0.85
export const TAXONOMY_CALIBRATION_ROOT_LINK_MIN = 0.62
export const TAXONOMY_CALIBRATION_ROOT_LINK_MAX = 0.78
/**
 * A node recurses into children when its directly-assigned share of the
 * project's observations exceeds the navigability budget (and depth allows).
 */
export const TAXONOMY_TREE_RECURSE_SHARE = 0.12
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
export const TAXONOMY_TREE_CHILD_MIN_MEMBERS_RATIO = 0.03
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
