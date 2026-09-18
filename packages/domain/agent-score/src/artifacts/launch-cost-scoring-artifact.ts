import type { CostFamily } from "../entities/cost-evidence.ts"
import type { CostMetricCurve, CostScoringArtifact } from "../entities/cost-scoring-artifact.ts"

export const LAUNCH_COST_ARTIFACT_VERSION = "cost-scoring-v1-provisional"

/**
 * A provisional response curve: no penalty across the healthy range, a gradual rise through the
 * watch range, and a full claim at the top.
 *
 * Every launch metric reports a share, so one shape parameterised by its two boundaries serves all
 * of them. The boundaries themselves are guesses until the shadow run replaces them: this file is
 * what P6-53 rewrites, and until it does, `calibration` says so and the version name says so.
 */
const provisionalCurve = ({
  curveId,
  healthyMax,
  watchMax,
}: {
  readonly curveId: string
  readonly healthyMax: number
  readonly watchMax: number
}): CostMetricCurve => ({
  curveId,
  points: [
    { rawValue: 0, penalty: 0 },
    { rawValue: healthyMax, penalty: 0 },
    { rawValue: watchMax, penalty: 0.4 },
    { rawValue: 1, penalty: 1 },
  ],
  healthyMaxRawValue: healthyMax,
  watchMaxRawValue: watchMax,
})

const CURVE_BOUNDARIES: readonly {
  readonly curveId: string
  readonly healthyMax: number
  readonly watchMax: number
}[] = [
  { curveId: "cost.recoverable_spend_share", healthyMax: 0.05, watchMax: 0.2 },
  { curveId: "cost.cache_gap", healthyMax: 0.1, watchMax: 0.35 },
  { curveId: "context.redundant_input_share", healthyMax: 0.1, watchMax: 0.3 },
  { curveId: "context.avoidable_pressure", healthyMax: 0.05, watchMax: 0.2 },
  { curveId: "tools.dead_surface", healthyMax: 0.05, watchMax: 0.2 },
  { curveId: "tools.repeated_call", healthyMax: 0.05, watchMax: 0.2 },
  { curveId: "tools.thrashing", healthyMax: 0.02, watchMax: 0.1 },
  { curveId: "tools.structural_defect", healthyMax: 0.01, watchMax: 0.05 },
  { curveId: "memory.repeated_zero_hit", healthyMax: 0.1, watchMax: 0.3 },
  { curveId: "memory.noop_rewrite", healthyMax: 0.05, watchMax: 0.2 },
  { curveId: "memory.reverted_write", healthyMax: 0.05, watchMax: 0.2 },
  { curveId: "recovery.recovered_incident_rate", healthyMax: 0.05, watchMax: 0.25 },
]

const METRIC_IDS: readonly string[] = CURVE_BOUNDARIES.map(({ curveId }) => curveId)

const familyRecord = <Value>(values: Record<CostFamily, Value>): Record<CostFamily, Value> => values

/**
 * The Cost scoring artifact the benchmark loads.
 *
 * Provisional in every number and deliberately conservative in structure: metric and family caps
 * are open, so the curves alone decide how much a metric claims, and the overlap policies are the
 * ones the catalog's groups make unavoidable rather than a fitted set. A calibrated artifact
 * replaces this under a new version, which is what makes the swap a marked boundary on the trend
 * instead of a silent re-scoring.
 */
export const LAUNCH_COST_SCORING_ARTIFACT = {
  artifactVersion: LAUNCH_COST_ARTIFACT_VERSION,
  calibration: "provisional",
  familyWeights: familyRecord({ spend: 0.3, context: 0.25, tools: 0.2, memory: 0.1, recovery: 0.15 }),
  metricCurves: CURVE_BOUNDARIES.map(provisionalCurve),
  metricCaps: Object.fromEntries(METRIC_IDS.map((metricId) => [metricId, 1])),
  familyCaps: familyRecord({ spend: 1, context: 1, tools: 1, memory: 1, recovery: 1 }),
  familyCoverageRequirements: familyRecord({
    // Spend and context are the two families every agent has a denominator for, so an unreadable
    // one is missing evidence rather than an agent that does not do that kind of work.
    spend: { required: true, coverageFloor: 0.5 },
    context: { required: true, coverageFloor: 0.5 },
    tools: { required: false, coverageFloor: 0.5 },
    memory: { required: false, coverageFloor: 0.5 },
    recovery: { required: false, coverageFloor: 0.5 },
  }),
  overlapPolicies: [
    {
      overlapGroupId: "tools.repeated-calls",
      resolution: "maximum",
      metricIds: [],
      overlapGroups: ["tools.repeated-calls"],
      families: ["tools"],
    },
    {
      overlapGroupId: "context.redundant-atoms",
      resolution: "maximum",
      metricIds: [],
      overlapGroups: ["context.redundant-atoms"],
      families: ["context"],
    },
    {
      overlapGroupId: "memory.writes",
      resolution: "maximum",
      metricIds: [],
      overlapGroups: ["memory.writes"],
      families: ["memory"],
    },
    {
      // Recoverable money that exists only because of the cache-token gap is one effect read twice.
      overlapGroupId: "cost.cache-derived-savings",
      resolution: "combinedCap",
      metricIds: ["cost.cache_gap", "cost.recoverable_spend_share"],
      overlapGroups: [],
      families: ["context", "spend"],
      combinedCap: 0.5,
    },
  ],
  residualSignalCap: 0.05,
  tokenizerPolicy: { preferProviderTokenizer: true, fallbackEncoding: "o200k_base", fallbackRelativeBound: 0.15 },
} satisfies CostScoringArtifact
