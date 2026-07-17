/**
 * Calibrated adaptive depth schedule + rollout limits — the Phase-1 deliverable.
 *
 * These are the values Phase 2 lifts into `constants.ts`
 * (`TAXONOMY_TREE_DEPTH_SCHEDULE` gains the four adaptive fields) and Phases
 * 3–5 enforce. They are recorded here, proven by `calibration.test.ts`, and
 * documented with their measured basis in `BASELINES.md`. Nothing in production
 * imports this module yet.
 *
 * The size/score/depth/child-count limits are carried over UNCHANGED from the
 * production static schedule (spec decision 5: keep scale-free static limits).
 * Only the four adaptive fields are new, plus dominant-child protection.
 */

import { TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD } from "../constants.ts"
import type { AdaptiveDepthSchedule } from "./adaptive-clustering.ts"

/**
 * `minRelativeSeparation` is calibrated on the real narrow-domain pilot corpus
 * (voyage 2048d), not on the synthetic fixtures: real coherent intent boundaries
 * there sit at relative separations of ~0.45–0.90, well below the ~1.2+ that the
 * cleaner synthetic blobs produce, so a synthetic-only value (~0.6) collapses the
 * real tree. 0.45 at the root resolves the pilot's single production cluster into
 * four human-recognizable intents; it tightens with depth so deeper splits must
 * be more clearly separated. `withinDistanceQuantile` reads the spread from the
 * upper bulk of member distances so outliers can't wave a weak split through;
 * `routingSimilarityQuantile` admits ~85% of a child's known members. See
 * `BASELINES.md` for the recorded pilot validation.
 */
export const ADAPTIVE_TREE_DEPTH_SCHEDULE: readonly AdaptiveDepthSchedule[] = [
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

/** Global absolute floor on the online routing threshold — mirrors production. */
export const ADAPTIVE_GLOBAL_ABSOLUTE_THRESHOLD = TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD

/**
 * Rollout limits fixed here for Phases 3–5 (spec exit criterion). Their basis is
 * recorded in `BASELINES.md`.
 */
export interface AdaptiveRolloutLimits {
  /** Hard cap on total tree nodes; exceeding it is a structural-limit fallback to static. */
  readonly nodeCap: number
  /** Max fraction of a run's continued nodes that may change name before it counts as churn. */
  readonly churnCeiling: number
  /** Max fraction of runs allowed to fall back to static before the rollout is halted. */
  readonly fallbackCeiling: number
  /** Minimum shadow observation window before reading a decision-grade comparison. */
  readonly shadowDurationDays: number
  /** Target fraction of known members a child's routing threshold must admit. */
  readonly perChildKnownMemberAdmissionTarget: number
}

export const ADAPTIVE_ROLLOUT_LIMITS: AdaptiveRolloutLimits = {
  nodeCap: 128,
  churnCeiling: 0.5,
  fallbackCeiling: 0.05,
  shadowDurationDays: 14,
  perChildKnownMemberAdmissionTarget: 0.85,
}

/**
 * Calibration thresholds the exit criteria are scored against. Floors are set
 * below the measured worst case (recorded in `BASELINES.md`) with headroom.
 */
/** Minimum acceptable mean labeled purity on labeled fixtures. */
export const ADAPTIVE_LABELED_PURITY_FLOOR = 0.85
/** Minimum acceptable per-group recall in one child on labeled narrow-domain fixtures. */
export const ADAPTIVE_GROUP_RECALL_FLOOR = 0.85
/**
 * Minimum acceptable cross-sample ARI (partition stability across overlapping
 * subsamples). Set from the real pilot: overlapping subsamples of the pilot
 * corpus agree at ARI ~0.85, so the floor is 0.8. Synthetic fixtures clear this
 * comfortably (~0.99).
 */
export const ADAPTIVE_CROSS_SAMPLE_ARI_FLOOR = 0.8
/** Maximum acceptable broad-domain leaf-purity regression of adaptive below static. */
export const ADAPTIVE_BROAD_REGRESSION_TOLERANCE = 0.05
/** Maximum acceptable adaptive/static runtime ratio at the 1,500-sample cap. */
export const ADAPTIVE_RUNTIME_RATIO_CEILING = 1.25
/**
 * Recommended clustering-worker old-generation budget (MB). The measured
 * 1,500×2048 build peaks well under this (see `BASELINES.md`); Phase 2 sets the
 * Node worker `resourceLimits.maxOldGenerationSizeMb` to it.
 */
export const ADAPTIVE_WORKER_MAX_OLD_GEN_MB = 512
