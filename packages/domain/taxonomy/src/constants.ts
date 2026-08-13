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

/**
 * `staging` clusters are the freshly built tree awaiting the atomic swap: they
 * are fully written and assigned but MUST be ignored by every active read and by
 * online routing until the publish transaction flips them to `active` (and the
 * old tree to `deprecated`) in one step. The column is already `varchar(16)`, so
 * widening the domain contract needs no Postgres migration.
 */
export const TAXONOMY_CLUSTER_STATES = ["active", "merged", "deprecated", "staging"] as const

// ---------------------------------------------------------------------------
// Adaptive-clustering gate
//
// Which builder a garden run persists, resolved once in the planning activity
// from the per-organization `adaptiveTaxonomyClustering` feature flag (never in
// workflow code — Temporal determinism). `off` is a guaranteed byte-identical
// no-op: static builder, `computeSplitLinkThreshold`, sample-only reassignment,
// centroid-similarity naming, original publish sequence. `enforced` runs the
// adaptive machinery (adaptive builder, member-confidence routing thresholds,
// shape-aware naming, staging + atomic swap, full-window reassignment). Exactly
// one of the two builders runs per garden pass; static is also the fallback when
// an adaptive build fails or is structurally rejected.
// ---------------------------------------------------------------------------

export const TAXONOMY_ADAPTIVE_CLUSTERING_MODES = ["off", "enforced"] as const

/**
 * Tag stamped on every adaptive telemetry event so a dashboard can slice
 * by the policy that produced a run. Bump it whenever the relative schedule or
 * routing constants change so old and new calibrations are separable in Logs.
 */
export const TAXONOMY_ADAPTIVE_POLICY_VERSION = "relative-v1"

/**
 * Structural node-count ceiling used as a fallback guardrail: an adaptive tree
 * with more nodes than this cannot be a legitimate output of the depth schedule
 * (max children 10 × 8 × 6 over three depths) and signals a builder fault, so
 * the planning activity falls back to static rather than persist it.
 */
export const TAXONOMY_ADAPTIVE_STRUCTURAL_MAX_NODES = 1_024

/** Batch size for bounded ClickHouse assignment writes during full-window reassignment. */
export const TAXONOMY_REASSIGNMENT_BATCH_SIZE = 1_000

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
 * `taxonomy_view_assignments` slice, and a workflow run, so the cap bounds
 * CH storage + LLM naming cost. Deliberately a single constant: raising it is a
 * one-line change, no per-plan machinery.
 */
export const MAX_CUSTOM_BEHAVIORS_PER_PROJECT = 10

// ---------------------------------------------------------------------------
// Facets
//
// A facet clusters sessions by an extracted answer to a question rather than by
// the raw transcript. Projections are facet-global (extracted once per
// `(facet, session)`, cached in `taxonomy_facet_projections`); clusters and
// assignments are per-view. Editing the question bumps `version` = reset tree.
// ---------------------------------------------------------------------------

export const FACET_NAME_MAX_LENGTH = 80

/** UI help text shown in the facet picker: why this facet is useful for your sessions. Required for every facet. */
export const FACET_DESCRIPTION_MAX_LENGTH = 300

/**
 * Length ceiling on a facet's free-text extraction instructions. Presets fill it
 * with curated guidance; custom facets are user-written. Generous on purpose —
 * it is prompt guidance, not the transcript (that input is bounded separately by
 * `FACET_EXTRACTION_INPUT_CHAR_CAP`). Instructions are write-once: to change what
 * a facet means, create a new facet.
 */
export const FACET_INSTRUCTIONS_MAX_LENGTH = 4_000

/**
 * Reserved slug prefix for the code-defined preset catalog (`FACET_PRESETS`) and
 * for route sentinels like `TOPICS_BEHAVIOR_SLUG`. Preset facets are
 * find-or-created under these slugs; neither a user-authored facet nor a custom
 * behavior may claim the prefix, so `createFacet` and `createCustomBehavior`
 * reject a generated slug that starts with it.
 */
export const FACET_PRESET_SLUG_PREFIX = "lat-"

/**
 * Addresses the whole-project topic behavior in the web router. That behavior has
 * no `custom_behaviors` row — the unfiltered topic tree is the online-routed
 * `(NULL, NULL)` view — so the UI needs a stable slug to route it like any other
 * behavior. It sits in the reserved `lat-` namespace, so no user-created behavior
 * can shadow it.
 */
export const TOPICS_BEHAVIOR_SLUG = `${FACET_PRESET_SLUG_PREFIX}topics`

/**
 * Character ceiling on the conversation fed to a single facet extraction. Input
 * tokens are the dominant cost lever after adoption and intent is usually
 * apparent early, so the extractor (Phase 2) truncates its input to this bound.
 */
export const FACET_EXTRACTION_INPUT_CHAR_CAP = 12_000

/** Max length of the one-sentence extracted answer stored + embedded per facet projection. */
export const FACET_PROJECTION_TEXT_MAX_LENGTH = 500

/**
 * Extraction model for `FACET_EXTRACTION` (overridable via `LAT_AI_FACET_EXTRACTION_*`).
 * Starts on the cheap Bedrock `minimax.minimax-m2.5` (already our naming model,
 * ~$0.30/1M in · $1.20/1M out); if intent-extraction quality proves poor, point
 * the override at Claude Haiku 4.5 (`amazon-bedrock` / `anthropic.claude-haiku-4-5`,
 * ~$1/$5). Low temperature keeps a single session's answer stable across passes;
 * `maxTokens` need only cover a one-sentence answer bounded to
 * `FACET_PROJECTION_TEXT_MAX_LENGTH` plus a small JSON envelope.
 *
 * `temperature` is 0.1, NOT 0: the MiniMax family caps temperature to the open
 * range (0, 1] (0 is rejected) and greedy decoding falls into repetition loops on
 * these checkpoints. MiniMax's own recommendation is 1.0 (it is RL-trained there);
 * 0.1 is the low-variance floor we accept for a stable extraction — if quality is
 * poor, raising toward 1.0 is a lever alongside the Haiku fallback.
 */
export const TAXONOMY_DEFAULT_FACET_EXTRACTION_MODEL = {
  provider: "amazon-bedrock",
  model: "minimax.minimax-m2.5",
  temperature: 0.1,
  maxTokens: 400,
} as const

/** Bounded concurrency for the per-session extraction fan-out (misses only). */
export const FACET_EXTRACTION_CONCURRENCY = 8

/**
 * Flush extracted projections to the cache every this many, instead of once at
 * the end. Lets the cold-start progress UI show answers stream in, and lets a
 * retry of the long garden activity resume from already-persisted work (cache
 * hits) rather than re-extracting everything.
 */
export const FACET_EXTRACTION_PERSIST_BATCH_SIZE = 16

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

export const TAXONOMY_NAMING_PROMPT_TOKEN_BUDGET = 30_000
export const TAXONOMY_NAMING_CHARS_PER_TOKEN = 4
export const TAXONOMY_NAMING_SAMPLE_CHAR_MAX = 4_000
export const TAXONOMY_NAMING_SAMPLE_CHAR_FLOOR = 800
export const TAXONOMY_CONTRASTIVE_NAMING_TIMEOUT_MS = 180_000
export const TAXONOMY_CONTRASTIVE_NAMING_MAX_TOKENS = 4_000
export const TAXONOMY_NAMING_FORBIDDEN_PROMPT_MAX = 60

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** Same TTL horizon as semantic-search embeddings. */
export const TAXONOMY_OBSERVATION_RETENTION_DAYS = 30

// ---------------------------------------------------------------------------
// Lens coverage
// ---------------------------------------------------------------------------

/**
 * How far back a lens coverage scan looks: the `taxonomy_view_assignments` TTL
 * horizon (retention plus the table's 30-day grace), past which no membership
 * row survives to be covered.
 */
export const TAXONOMY_LENS_COVERAGE_HORIZON_DAYS = TAXONOMY_OBSERVATION_RETENTION_DAYS + 30

/**
 * A day counts as covered when its assigned share of clusterable observations
 * reaches this fraction of the lens's current rate. The test is relative because
 * the gardening sample is capped: a busy project's plateau sits well below 100%,
 * and an absolute test would clip every such lens to nothing.
 */
export const TAXONOMY_LENS_COVERAGE_MIN_RATE_FRACTION = 0.75

/**
 * Taxonomy observations are always ingested while retained. Gardening is the
 * bounded part: every pass operates on the newest live observations only.
 */

// ---------------------------------------------------------------------------
// Lock TTLs (Redis SET NX EX)
// ---------------------------------------------------------------------------

export const TAXONOMY_CLUSTER_LOCK_TTL_SECONDS = 30

export const TAXONOMY_CONTRASTIVE_NAMING_CACHE_TTL_SECONDS = 3_600

// ---------------------------------------------------------------------------
// Divisive builder — per-depth schedules
//
// Two schedules, one per builder gate. Neither is a "default"; the gardening
// path picks explicitly (static today, relative once the rollout gate enables
// it).
//
// Static (`TAXONOMY_TREE_STATIC_DEPTH_SCHEDULE`) is the current production
// tuning: broad-then-narrow child counts + size floors + an absolute
// sibling-cosine ceiling per depth.
//
// Relative (`TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE`) carries the same
// scale-free size/score/child-count limits but replaces the absolute ceiling
// with the node-relative separation gate — absolute cosine similarity is not
// comparable across projects, so acceptance is judged against each node's own
// member spread. The four relative fields (dominance + relative separation +
// within/routing quantiles) are calibrated in `src/calibration/` (see
// BASELINES.md): the root separation 0.45 resolves the narrow-domain pilot's
// single production cluster into four coherent intents, tightening with depth
// so deeper splits must be more clearly separated; `withinDistanceQuantile`
// reads the spread from the upper bulk of member distances (outliers can't wave
// a weak split through); `routingSimilarityQuantile` admits ~85% of a child's
// known members.
// ---------------------------------------------------------------------------

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

export interface TaxonomyTreeRelativeDepthSchedule {
  readonly maxChildren: number
  readonly minClusterFraction: number
  readonly minClusterAbs: number
  readonly minSplitScore: number
  readonly maxDominantChildFraction: number
  readonly minRelativeSeparation: number
  readonly withinDistanceQuantile: number
  readonly routingSimilarityQuantile: number
}

export const TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE: readonly TaxonomyTreeRelativeDepthSchedule[] = [
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

/**
 * Restart budget for re-searching the ROOT split when it lands near the separation
 * gate. k-means finds a local optimum, so the tree depends on where k-means++
 * seeded, and seeds are drawn as indices into a member list that window turnover
 * re-addresses (LAT-825). Three restarts is too small a sample on a corpus whose
 * root sits near `minRelativeSeparation`: the tree alternates between a real split
 * and a bare leaf.
 *
 * Do not lower this to buy headroom against the worker deadline — it buys almost
 * none. Over the pilot's real historical windows 12 restarts collapses as many
 * roots as not re-searching at all, while costing only 6% less than 25, because the
 * first pass and the subtrees dominate that total rather than the root sweep.
 * Narrow the swept K instead (TAXONOMY_ADAPTIVE_ESCALATION_SEARCH_WIDTH).
 */
export const TAXONOMY_KMEANS_ESCALATION_RESTARTS = 25
/**
 * Root relative separation at or above which the first-pass build is kept as-is.
 * Measured on real corpora across historical 7-day windows: an unstable project
 * sits at 0.35–0.57 while a stable one sits at 1.06 and above, with no overlap.
 * 0.8 centres the threshold in that gap. Builds above it are returned untouched,
 * so projects that do not need the re-search are unaffected by it.
 */
export const TAXONOMY_ADAPTIVE_ESCALATION_MARGIN = 0.8
/**
 * Lower edge of the re-search band. A corpus with no structure to find reaches
 * only ~0.09 at its best root candidate, while a corpus whose real split merely
 * fell short on this run reaches ~0.4. Without this floor every unimodal project
 * would re-search on every pass to reconfirm the leaf it already had.
 */
export const TAXONOMY_ADAPTIVE_ESCALATION_MARGIN_FLOOR = 0.25
/**
 * How many K the root re-search sweeps, best-scoring-first from the first pass.
 *
 * A k-means run costs O(n·k·dimensions), so sweeping all of 2..maxChildren spends
 * most of the escalated budget re-confirming K the first pass already ranked last.
 * On the real pilot corpus the root's accepted split is identical at every sweep
 * width from 3 to 10 while the build ranges 6.9s to 46.3s. 3 rather than 2 for a
 * spare candidate if the best-scoring K fails the gates at the higher restart count.
 */
export const TAXONOMY_ADAPTIVE_ESCALATION_SEARCH_WIDTH = 3

// ---------------------------------------------------------------------------
// Clustering worker resource bounds
//
// The divisive build runs in a dedicated Node worker thread. The old-generation
// budget is the worker heap ceiling: memory is a function of the sample, not of the
// search budget.
//
// The deadline is the binding constraint on the search budget, not a spare backstop:
// the re-search is bounded to fit it (TAXONOMY_ADAPTIVE_ESCALATION_MAX_WORK), so
// raising the search budget without re-deriving that is a deadline breach. Sizing
// it needs production numbers, not local ones — the build this was set against runs
// ~12s locally but 61-65s on the activity worker, whose speed varies ~4.4x pass to
// pass. Kept well under the 30-minute Temporal start-to-close of the planning
// activity that awaits it.
// ---------------------------------------------------------------------------

export const TAXONOMY_CLUSTERING_WORKER_TIMEOUT_MS = 5 * 60_000
export const TAXONOMY_CLUSTERING_WORKER_MAX_OLD_GEN_MB = 512

/**
 * ROOT-SWEEP dot-product element operations per millisecond of TOTAL build time.
 *
 * Deliberately not raw throughput. The budget check can only charge the root K
 * sweeps, because the work below the root depends on a partition that does not exist
 * until the split is chosen — and a rigorous whole-tree upper bound (every depth
 * sweeping its full K range over all members, no early convergence) overstates a
 * real build by ~2x and would decline corpora that finish comfortably. So the
 * subtree cost is folded into this ratio instead: the numerator counts only the root
 * sweep, the denominator is the whole build's wall time.
 *
 * Calibrated that way from production: a plain build over 970 observations sweeps
 * K=2..10 at 3 restarts and <=25 iterations, so at most `3 * 25 * 970 * 2048 * 54`
 * ~ 8.0e9 root-sweep operations, against 61-65s of total build time — ~128_000 per
 * millisecond. 80_000 leaves headroom for a slow host pass. Retune from
 * `taxonomy.adaptive.projectedRootSearchWork` against observed `durationMs`, which
 * keeps both sides of the ratio measured rather than derived.
 *
 * Not exported: only the derived budget below is a contract.
 */
const CLUSTERING_ROOT_SWEEP_OPS_PER_BUILD_MS = 80_000

/**
 * Ceiling on the projected ROOT-SWEEP work of an escalated build, in the units of
 * CLUSTERING_ROOT_SWEEP_OPS_PER_BUILD_MS (which is what makes charging the root
 * sweeps alone dimensionally sound — see there).
 *
 * A projected operation COUNT rather than a duration: the builder must stay a pure
 * function of its inputs, and a wall-clock check would branch differently on a slow
 * host and break Temporal replay.
 *
 * Exceeding it declines the RE-SEARCH, not the adaptive build: the first pass still
 * stands, so the run publishes an un-escalated adaptive tree — which on a near-gate
 * corpus is exactly the collapse-prone one the re-search exists to avoid. That is
 * why declining reports `escalationSkipped` and `projectedRootSearchWork`; a
 * too-tight budget degrades tree quality quietly otherwise. At current settings a
 * ~900-observation corpus projects to ~74% of this and a
 * TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX corpus is declined.
 */
export const TAXONOMY_ADAPTIVE_ESCALATION_MAX_WORK =
  TAXONOMY_CLUSTERING_WORKER_TIMEOUT_MS * CLUSTERING_ROOT_SWEEP_OPS_PER_BUILD_MS

// ---------------------------------------------------------------------------
// Build quality metrics
// ---------------------------------------------------------------------------

/**
 * A node holding at most this share of its own subtree (floored at 1 member at the
 * call site) is scaffolding. Not a tuning knob: swept 0 through 0.10 across 8
 * production trees the promoted row list was identical at every setting.
 */
export const TAXONOMY_SCAFFOLDING_MAX_OWN_FRACTION = 0.05

/**
 * Cap on the per-leaf quality profile carried in telemetry; the structural worst case
 * is 10 * 8 * 6 leaves. Cohesion summaries are taken before this truncates, and the
 * emitter reports how many leaves it dropped.
 */
export const TAXONOMY_QUALITY_LEAF_PROFILE_MAX = 50
